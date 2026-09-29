"""PDF de test construit comme dans le prototype experimental."""

import logging
from io import BytesIO

import pymupdf
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

# Tests silencieux : les journaux attendus sont verifies avec assertLogs.
logging.getLogger("backend.app").setLevel(logging.CRITICAL)

COURSE = (
    "L'eau existe sous forme solide, liquide et gazeuse. "
    "L'evaporation transforme l'eau liquide en vapeur. "
    "La condensation transforme la vapeur en eau liquide. "
    "La solidification transforme l'eau liquide en glace. "
    "La fusion transforme la glace en eau liquide. "
    "Le Soleil fournit de l'energie qui favorise l'evaporation."
)


def make_pages_pdf(texts, encrypted=False):
    """Une page par texte ; None donne une page sans texte, comme un scan."""
    writer = PdfWriter()
    for text in texts:
        page = writer.add_blank_page(width=600, height=800)
        if text:
            font = DictionaryObject({
                NameObject("/Type"): NameObject("/Font"),
                NameObject("/Subtype"): NameObject("/Type1"),
                NameObject("/BaseFont"): NameObject("/Helvetica"),
                NameObject("/Encoding"): NameObject("/WinAnsiEncoding"),
            })
            page[NameObject("/Resources")] = DictionaryObject({
                NameObject("/Font"): DictionaryObject({NameObject("/F1"): font})
            })
            stream = DecodedStreamObject()
            escaped = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
            stream.set_data(f"BT /F1 12 Tf 50 700 Td ({escaped}) Tj ET".encode("cp1252"))
            page.replace_contents(stream)  # objet indirect : PDF valide aussi pour MuPDF
    if encrypted:
        writer.encrypt("test-password")
    output = BytesIO()
    writer.write(output)
    return output.getvalue()


def make_pdf(text=COURSE, encrypted=False, pages=1):
    return make_pages_pdf([text] * pages, encrypted)


def make_scanned_pdf(text=COURSE):
    """Vrai PDF scanne : la page ne contient qu'une image du texte, pypdf n'y lit rien."""
    with pymupdf.open() as source, pymupdf.open() as scan:
        page = source.new_page(width=595, height=842)
        page.insert_textbox(pymupdf.Rect(50, 50, 545, 800), text, fontsize=14)
        image = page.get_pixmap(dpi=200, colorspace=pymupdf.csGRAY)
        scan.new_page(width=595, height=842).insert_image(scan[0].rect, pixmap=image)
        return scan.tobytes()


def quiz_data(count=5):
    return {"questions": [
        {
            "question": f"Question {number} sur l'eau ?",
            "choices": ["Liquide", "Vapeur", "Solide", "Glace"],
            "correct_answer": 1,
            "explanation": "Le cours indique que l'eau liquide devient vapeur.",
        }
        for number in range(1, count + 1)
    ]}
