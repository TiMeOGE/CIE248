"""OCR Tesseract des pages scannees : rendu PyMuPDF en memoire, puis pytesseract.

Seules les pages choisies par pdf_service sont rendues, une par une, avec un
delai total par document. pytesseract lance le programme tesseract avec une
liste d'arguments fixes (jamais le nom du fichier envoye) et supprime ses
fichiers temporaires, meme en cas d'erreur.
"""

import logging
import math
import threading
import time
from dataclasses import dataclass, field

import pymupdf
import pytesseract

from ..config import OCR_DPI, OCR_LANGUAGES, OCR_MAX_PARALLEL_PAGES, OCR_MAX_PIXELS, OCR_TIMEOUT_SECONDS

logger = logging.getLogger(__name__)

# Limite les processus Tesseract simultanes, quel que soit le nombre de visiteurs.
_ocr_slots = threading.BoundedSemaphore(OCR_MAX_PARALLEL_PAGES)


@dataclass
class OcrResult:
    texts: dict[int, str] = field(default_factory=dict)  # index de page -> texte lu (parfois vide)
    failed_pages: int = 0  # Tesseract absent ou en erreur, page illisible, delai depasse


def render_page(document: pymupdf.Document, index: int):
    """Image en niveaux de gris a OCR_DPI, reduite si la page depasse OCR_MAX_PIXELS."""
    page = document.load_page(index)
    zoom = OCR_DPI / 72  # une page PDF se mesure en points : 72 par pouce
    pixels = max(page.rect.width * page.rect.height, 1) * zoom * zoom
    if pixels > OCR_MAX_PIXELS:
        zoom *= math.sqrt(OCR_MAX_PIXELS / pixels) * 0.99  # marge : MuPDF arrondit au pixel superieur
    pixmap = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), colorspace=pymupdf.csGRAY, alpha=False)
    return pixmap.pil_image(), round(zoom * 72)


def clean_text(text: str) -> str:
    """Retire les lignes sans lettre ni chiffre : traits, taches ou bruit de l'image."""
    lines = (line.strip() for line in text.splitlines())
    return "\n".join(line for line in lines if any(char.isalnum() for char in line))


def ocr_pages(data: bytes, page_indexes: list[int]) -> OcrResult:
    """Lit les pages demandees dans l'ordre ; une page en echec n'arrete pas les suivantes."""
    result = OcrResult()
    started = time.monotonic()
    deadline = started + OCR_TIMEOUT_SECONDS
    try:
        document = pymupdf.open(stream=data, filetype="pdf")
    except Exception as error:  # PDF lisible par pypdf mais pas par MuPDF
        logger.warning("OCR impossible : PDF non lisible par PyMuPDF (%s)", type(error).__name__)
        result.failed_pages = len(page_indexes)
        return result

    with document:
        for position, index in enumerate(page_indexes):
            remaining = deadline - time.monotonic()
            # pytesseract comprend timeout=0 comme "sans limite" : garder au moins une seconde.
            if remaining < 1 or not _ocr_slots.acquire(timeout=remaining):
                skipped = len(page_indexes) - position
                logger.warning("OCR interrompu : delai de %d s depasse, %d page(s) non lue(s)", OCR_TIMEOUT_SECONDS, skipped)
                result.failed_pages += skipped
                break
            try:
                image, dpi = render_page(document, index)
                text = pytesseract.image_to_string(
                    image, lang=OCR_LANGUAGES, config=f"--dpi {dpi}", timeout=max(deadline - time.monotonic(), 1),
                )
                result.texts[index] = clean_text(text)
            except pytesseract.TesseractNotFoundError:
                logger.error("OCR indisponible : le programme tesseract n'est pas installe sur le serveur")
                result.failed_pages += len(page_indexes) - position
                break
            except Exception as error:  # erreur Tesseract, delai d'une page ou page que MuPDF ne sait pas dessiner
                # Seul le type est journalise : le message peut contenir des chemins internes.
                logger.warning("OCR page %d : echec (%s)", index + 1, type(error).__name__)
                result.failed_pages += 1
            finally:
                _ocr_slots.release()

    logger.info(
        "OCR : %d page(s) lue(s), %d en echec, %.1f s",
        len(result.texts), result.failed_pages, time.monotonic() - started,
    )
    return result
