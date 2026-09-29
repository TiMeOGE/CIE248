"""Extraction pypdf reprise du prototype, avec limites pour les fichiers recus et OCR des pages scannees."""

import logging
import time
from io import BytesIO
from pathlib import Path

from pypdf import PdfReader
from pypdf.errors import PyPdfError

from ..config import MAX_PDF_BYTES, MAX_PDF_PAGES, MAX_TEXT_CHARACTERS, MIN_TEXT_CHARACTERS, OCR_MIN_PAGE_CHARACTERS
from ..errors import ApiError
from .ocr_service import OcrResult, ocr_pages

logger = logging.getLogger(__name__)


def validate_upload(filename: str | None, content_type: str | None, size: int) -> None:
    if not filename:
        raise ApiError(400, "FILE_REQUIRED", "Fournir un fichier PDF dans le champ file.")
    if Path(filename).suffix.lower() != ".pdf" or content_type not in (
        "application/pdf", "application/octet-stream", None,
    ):
        raise ApiError(415, "INVALID_FILE_TYPE", "Le fichier doit etre un PDF.")
    if size > MAX_PDF_BYTES:
        raise ApiError(413, "PDF_TOO_LARGE", "Le PDF depasse la limite de 5 Mio.")
    if size == 0:
        raise ApiError(422, "EMPTY_PDF", "Le fichier PDF est vide.")


def usable_characters(text: str) -> int:
    """Lettres et chiffres : les espaces, la ponctuation et les symboles ne comptent pas."""
    return sum(char.isalnum() for char in text)


def join_pages(pages: list[str]) -> str:
    """Pages dans l'ordre du document ; les pages vides sont ignorees."""
    return "\n\n".join(page for page in pages if page)


def check_length(text: str) -> None:
    if len(text) > MAX_TEXT_CHARACTERS:
        raise ApiError(413, "TEXT_TOO_LONG", "Le cours depasse 60 000 caracteres.")


def extract_pdf_text(data: bytes, min_characters: int = MIN_TEXT_CHARACTERS) -> str:
    """pypdf pour chaque page, puis OCR des seules pages sans assez de texte exploitable.

    min_characters=0 quand un texte colle complete le PDF : le total est verifie ensuite.
    """
    started = time.perf_counter()
    if len(data) > MAX_PDF_BYTES:
        raise ApiError(413, "PDF_TOO_LARGE", "Le PDF depasse la limite de 5 Mio.")
    if not data:
        raise ApiError(422, "EMPTY_PDF", "Le fichier PDF est vide.")
    if not data.startswith(b"%PDF-"):
        raise ApiError(415, "INVALID_FILE_TYPE", "Le contenu du fichier n'est pas un PDF.")

    try:
        reader = PdfReader(BytesIO(data))
        if reader.is_encrypted:
            raise ApiError(422, "ENCRYPTED_PDF", "Utiliser un PDF sans mot de passe.")
        if len(reader.pages) > MAX_PDF_PAGES:
            raise ApiError(413, "TOO_MANY_PAGES", "Le PDF doit contenir au maximum 50 pages.")
        pages = [(page.extract_text() or "").strip() for page in reader.pages]
    except (PyPdfError, OSError, ValueError, KeyError, TypeError, RecursionError) as error:
        raise ApiError(422, "INVALID_PDF", "PDF illisible ou endommage.") from error
    check_length(join_pages(pages))  # un cours deja trop long est refuse sans lancer d'OCR

    # Pages scannees ou presque vides : l'OCR les lit ; les autres gardent le texte pypdf.
    scanned = [index for index, text in enumerate(pages) if usable_characters(text) < OCR_MIN_PAGE_CHARACTERS]
    ocr = ocr_pages(data, scanned) if scanned else OcrResult()
    for index, text in ocr.texts.items():
        # L'OCR ne remplace le texte pypdf que s'il lit davantage de lettres et de chiffres.
        if usable_characters(text) > usable_characters(pages[index]):
            pages[index] = text

    text = join_pages(pages)
    # Journal sans contenu du cours : seulement des compteurs et la duree.
    logger.info(
        "PDF : %d page(s), %d envoyee(s) a l'OCR, %d en echec, %d caracteres, %.1f s",
        len(pages), len(scanned), ocr.failed_pages, len(text), time.perf_counter() - started,
    )
    check_length(text)
    if not text or len(text) < min_characters:
        if ocr.failed_pages:
            raise ApiError(503, "OCR_FAILED", "La lecture des pages scannees a echoue. Reessayer ou coller le texte.")
        if not text:
            raise ApiError(422, "NO_TEXT", "Impossible d'extraire suffisamment de texte de ce document.")
        raise ApiError(422, "INSUFFICIENT_TEXT", "Le cours doit contenir au moins 200 caracteres de texte.")
    return text
