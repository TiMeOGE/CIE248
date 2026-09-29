"""Extraction PDF : pypdf d'abord, OCR Tesseract seulement pour les pages sans texte exploitable.

Tesseract est simule, sauf dans RealTesseractTests (lance seulement s'il est installe,
par exemple dans l'image Docker). Aucun test n'appelle le fournisseur IA.
"""

import glob
import os
import shutil
import tempfile
import unittest
from unittest.mock import patch

import pymupdf
import pytesseract
from fastapi.testclient import TestClient

from backend.app import main
from backend.app.config import MAX_TEXT_CHARACTERS, OCR_DPI, OCR_LANGUAGES, OCR_MAX_PIXELS, OCR_TIMEOUT_SECONDS
from backend.app.errors import ApiError
from backend.app.models import Quiz
from backend.app.services import ocr_service, pdf_service
from backend.tests.helpers import COURSE, make_pages_pdf, make_pdf, make_scanned_pdf, quiz_data

PAGE_3 = "La pluie et la neige ramenent l'eau des nuages vers le sol, puis vers les rivieres."
SCAN_2 = "Page scannee 2 : les nuages se forment par condensation de la vapeur d'eau."
SCAN_4 = "Page scannee 4 : les rivieres rejoignent la mer, ou l'eau s'evapore de nouveau."
NO_TEXT_MESSAGE = "Impossible d'extraire suffisamment de texte de ce document."


class PdfOcrTests(unittest.TestCase):
    def setUp(self):
        # Chaque test choisit ce que "lit" Tesseract ; le rendu PyMuPDF des pages reste reel.
        ocr = patch.object(ocr_service.pytesseract, "image_to_string", return_value="")
        self.ocr = ocr.start()
        self.addCleanup(ocr.stop)
        render = patch.object(ocr_service, "render_page", wraps=ocr_service.render_page)
        self.render = render.start()
        self.addCleanup(render.stop)

    def rendered_pages(self):
        return [call.args[1] for call in self.render.call_args_list]

    def assert_api_error(self, data, status, code):
        with self.assertRaises(ApiError) as error:
            pdf_service.extract_pdf_text(data)
        self.assertEqual((error.exception.status_code, error.exception.code), (status, code))
        return error.exception

    def post(self, pdf):
        with patch.object(main, "load_dotenv"), TestClient(main.create_app(), raise_server_exceptions=False) as client:
            return client.post(
                "/api/quiz/generate", files={"file": ("scan.pdf", pdf, "application/pdf")}, data={"question_count": 2},
            )

    def test_text_pdf_uses_pypdf_without_ocr(self):
        self.assertEqual(pdf_service.extract_pdf_text(make_pdf(pages=3)), "\n\n".join([COURSE] * 3))
        self.ocr.assert_not_called()
        self.render.assert_not_called()

    def test_scanned_pdf_is_read_by_ocr(self):
        self.ocr.return_value = COURSE
        self.assertEqual(pdf_service.extract_pdf_text(make_scanned_pdf()), COURSE)
        self.ocr.assert_called_once()
        image = self.ocr.call_args.args[0]
        options = self.ocr.call_args.kwargs
        # Image en memoire (pas de fichier ecrit par le backend), en niveaux de gris, A4 a 200 DPI.
        self.assertEqual((image.mode, image.width, image.height), ("L", 1653, 2339))
        self.assertEqual((options["lang"], options["config"]), (OCR_LANGUAGES, f"--dpi {OCR_DPI}"))
        self.assertTrue(1 <= options["timeout"] <= OCR_TIMEOUT_SECONDS)

    def test_mixed_pdf_ocr_only_empty_pages_and_keeps_order(self):
        self.ocr.side_effect = [SCAN_2, SCAN_4]
        text = pdf_service.extract_pdf_text(make_pages_pdf([COURSE, None, PAGE_3, None]))
        self.assertEqual(text.split("\n\n"), [COURSE, SCAN_2, PAGE_3, SCAN_4])
        self.assertEqual(self.rendered_pages(), [1, 3])

    def test_ocr_replaces_a_poor_page_only_if_it_reads_more(self):
        title = "Chapitre 2 : le cycle"  # moins de 50 lettres et chiffres : la page passe a l'OCR
        figure = "Chapitre 2 : le cycle\nFigure 1 : evaporation, condensation, pluie"
        for ocr_text, expected in [(figure, figure), ("Chapitre", title), ("", title)]:
            with self.subTest(ocr_text=ocr_text):
                self.ocr.return_value = ocr_text
                self.assertEqual(pdf_service.extract_pdf_text(make_pages_pdf([COURSE, title])), f"{COURSE}\n\n{expected}")

    def test_empty_or_unreadable_pdf_returns_a_clear_error(self):
        # Pages blanches, ou OCR qui ne voit que du bruit (traits, taches) : aucun texte exploitable.
        for ocr_text in ("", "  \n | ~ -- \n ,;"):
            with self.subTest(ocr_text=ocr_text):
                self.ocr.return_value = ocr_text
                error = self.assert_api_error(make_pdf(text=None, pages=2), 422, "NO_TEXT")
                self.assertEqual(error.message, NO_TEXT_MESSAGE)
        self.ocr.return_value = "Trop court."
        self.assert_api_error(make_scanned_pdf(), 422, "INSUFFICIENT_TEXT")

    def test_ocr_errors_return_a_clean_error(self):
        scan = make_scanned_pdf()
        failures = [
            pytesseract.TesseractNotFoundError(),
            pytesseract.TesseractError(1, "PRIVATE_TEST_VALUE /tmp/tess_abc"),
            RuntimeError("Tesseract process timeout"),
        ]
        for failure in failures:
            with self.subTest(failure=type(failure).__name__):
                self.ocr.side_effect = failure
                with self.assertLogs("backend.app", "WARNING") as logs:
                    error = self.assert_api_error(scan, 503, "OCR_FAILED")
                self.assertNotIn("PRIVATE_TEST_VALUE", error.message + "".join(logs.output))
                # Le verrou OCR est rendu meme apres une erreur : le serveur n'est pas bloque.
                self.assertTrue(ocr_service._ocr_slots.acquire(blocking=False))
                ocr_service._ocr_slots.release()
        with patch.object(ocr_service.pymupdf, "open", side_effect=RuntimeError("PRIVATE_TEST_VALUE")), \
                self.assertLogs("backend.app", "WARNING"):
            self.assert_api_error(scan, 503, "OCR_FAILED")

    def test_ocr_error_on_mixed_pdf_keeps_the_text_pages(self):
        self.ocr.side_effect = pytesseract.TesseractNotFoundError()
        with self.assertLogs("backend.app", "WARNING"):
            self.assertEqual(pdf_service.extract_pdf_text(make_pages_pdf([COURSE, None, None])), COURSE)
        self.assertEqual(self.ocr.call_count, 1)  # Tesseract absent : inutile d'essayer les pages suivantes

    def test_ocr_time_budget(self):
        with patch.object(ocr_service, "OCR_TIMEOUT_SECONDS", 0), self.assertLogs("backend.app", "WARNING") as logs:
            self.assert_api_error(make_pdf(text=None, pages=3), 503, "OCR_FAILED")
        self.ocr.assert_not_called()
        self.assertIn("3 page(s) non lue(s)", "".join(logs.output))

    def test_existing_limits_are_checked_before_any_ocr(self):
        for data, status, code in [
            (make_pdf(text=None, pages=51), 413, "TOO_MANY_PAGES"),
            (make_pages_pdf(["a" * (MAX_TEXT_CHARACTERS + 1), None]), 413, "TEXT_TOO_LONG"),
            (make_pdf(text=None, encrypted=True), 422, "ENCRYPTED_PDF"),
            (b"%PDF-1.7\nendommage", 422, "INVALID_PDF"),
        ]:
            with self.subTest(code=code):
                self.assert_api_error(data, status, code)
        self.ocr.assert_not_called()
        # Le texte lu par OCR respecte la meme limite de 60 000 caracteres.
        self.ocr.return_value = "a" * (MAX_TEXT_CHARACTERS + 1)
        self.assert_api_error(make_scanned_pdf(), 413, "TEXT_TOO_LONG")

    def test_huge_page_is_rendered_with_a_bounded_image(self):
        with pymupdf.open() as document:
            document.new_page(width=14_400, height=14_400)  # 5 m de cote, le maximum du format PDF
            image, dpi = ocr_service.render_page(document, 0)
        self.assertLessEqual(image.width * image.height, OCR_MAX_PIXELS)
        self.assertLess(dpi, OCR_DPI)

    def test_logs_give_counts_and_duration_but_never_the_course(self):
        self.ocr.return_value = SCAN_2
        with self.assertLogs("backend.app", "INFO") as logs:
            pdf_service.extract_pdf_text(make_pages_pdf([COURSE, None]))
        output = "\n".join(logs.output)
        self.assertIn("OCR : 1 page(s) lue(s), 0 en echec", output)
        self.assertRegex(output, r"PDF : 2 page\(s\), 1 envoyee\(s\) a l'OCR, 0 en echec, \d+ caracteres, [\d.]+ s")
        self.assertNotIn("evaporation", output)
        self.assertNotIn("nuages", output)

    def test_api_with_scanned_pdf_and_clean_errors(self):
        self.ocr.return_value = COURSE
        with patch.object(main, "generate_quiz", return_value=Quiz(**quiz_data(2))) as generate:
            response = self.post(make_scanned_pdf())
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(generate.call_args.args[0], COURSE)

            self.ocr.side_effect = pytesseract.TesseractError(1, "PRIVATE_TEST_VALUE")
            response = self.post(make_scanned_pdf())
            self.assertEqual(response.status_code, 503)
            self.assertEqual(response.json()["error"]["code"], "OCR_FAILED")
            self.assertNotIn("PRIVATE_TEST_VALUE", response.text)
            self.assertNotIn("Traceback", response.text)

            self.ocr.side_effect, self.ocr.return_value = None, ""
            response = self.post(make_pdf(text=None))
            self.assertEqual(response.status_code, 422)
            self.assertEqual(response.json()["error"], {"code": "NO_TEXT", "message": NO_TEXT_MESSAGE})
        generate.assert_called_once()


@unittest.skipUnless(shutil.which("tesseract"), "Tesseract n'est pas installe (il l'est dans l'image Docker)")
class RealTesseractTests(unittest.TestCase):
    def test_real_scanned_pdf_and_temporary_files(self):
        pattern = os.path.join(tempfile.gettempdir(), "tess_*")
        before = set(glob.glob(pattern))
        text = pdf_service.extract_pdf_text(make_scanned_pdf()).casefold()
        for word in ("evaporation", "condensation", "solidification", "soleil"):
            self.assertIn(word, text)
        # Langue absente : Tesseract echoue, l'erreur reste propre et ses fichiers sont supprimes.
        with patch.object(ocr_service, "OCR_LANGUAGES", "langue_absente"), self.assertRaises(ApiError) as error:
            pdf_service.extract_pdf_text(make_scanned_pdf())
        self.assertEqual(error.exception.code, "OCR_FAILED")
        self.assertEqual(set(glob.glob(pattern)), before)


if __name__ == "__main__":
    unittest.main()
