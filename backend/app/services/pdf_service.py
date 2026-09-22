"""Extraction pypdf reprise du prototype, avec limites pour les fichiers recus."""

from io import BytesIO
from pathlib import Path

from pypdf import PdfReader
from pypdf.errors import PyPdfError

from ..config import MAX_PDF_BYTES, MAX_PDF_PAGES, MAX_TEXT_CHARACTERS, MIN_TEXT_CHARACTERS
from ..errors import ApiError


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


def extract_text(data: bytes) -> str:
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
        pages = []
        total = 0
        for page in reader.pages:
            text = (page.extract_text() or "").strip()
            if text:
                total += len(text) + (2 if pages else 0)
                if total > MAX_TEXT_CHARACTERS:
                    raise ApiError(413, "TEXT_TOO_LONG", "Le cours depasse 60 000 caracteres.")
                pages.append(text)
    except (PyPdfError, OSError, ValueError, KeyError, TypeError, RecursionError) as error:
        raise ApiError(422, "INVALID_PDF", "PDF illisible ou endommage.") from error

    text = "\n\n".join(pages)
    if not text:
        raise ApiError(422, "NO_TEXT", "Aucun texte extractible. Les scans necessitent un OCR.")
    if len(text) < MIN_TEXT_CHARACTERS:
        raise ApiError(422, "INSUFFICIENT_TEXT", "Le cours doit contenir au moins 200 caracteres de texte.")
    return text
