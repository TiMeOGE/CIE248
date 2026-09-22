"""PDF de test construit comme dans le prototype experimental."""

from io import BytesIO

from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

COURSE = (
    "L'eau existe sous forme solide, liquide et gazeuse. "
    "L'evaporation transforme l'eau liquide en vapeur. "
    "La condensation transforme la vapeur en eau liquide. "
    "La solidification transforme l'eau liquide en glace. "
    "La fusion transforme la glace en eau liquide. "
    "Le Soleil fournit de l'energie qui favorise l'evaporation."
)


def make_pdf(text=COURSE, encrypted=False, pages=1):
    writer = PdfWriter()
    for _ in range(pages):
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
            page[NameObject("/Contents")] = stream
    if encrypted:
        writer.encrypt("test-password")
    output = BytesIO()
    writer.write(output)
    return output.getvalue()


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
