"""Tests sans reseau : vrais PDF temporaires et reponses HTTP simulees."""

from contextlib import redirect_stderr, redirect_stdout
from copy import deepcopy
from io import StringIO
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

import httpx
from openai import OpenAI
from pydantic import ValidationError
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import main


def create_pdf(path, text=None, encrypted=False):
    writer = PdfWriter()
    page = writer.add_blank_page(width=600, height=800)
    if text:
        # Petit flux PDF avec une police standard, sans dependance de test en plus.
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
        stream.set_data(f"BT /F1 12 Tf 50 700 Td ({text}) Tj ET".encode("ascii"))
        page[NameObject("/Contents")] = stream
    if encrypted:
        writer.encrypt("test-password")
    writer.write(path)


def quiz_data():
    return {"questions": [
        {
            "question": f"Question {number} ?",
            "choices": ["Liquide", "Vapeur", "Solide", "Glace"],
            "correct_answer": 1,
            "explanation": "Le cours indique que l'eau devient vapeur.",
        }
        for number in range(1, 6)
    ]}


def response_body(content, status="completed"):
    return {
        "id": "resp_test", "object": "response", "created_at": 0,
        "model": main.MODEL, "status": status,
        "output": [{
            "type": "message", "id": "msg_test", "role": "assistant",
            "status": "completed", "content": content,
        }],
    }


class PrototypeTests(unittest.TestCase):
    def setUp(self):
        self.directory = TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.pdf = Path(self.directory.name) / "cours.pdf"

    def fake_openai(self, body, code=200):
        def handle(request):
            self.request = json.loads(request.content)
            return httpx.Response(code, json=body)

        def create_client(**kwargs):
            return OpenAI(
                **kwargs, http_client=httpx.Client(transport=httpx.MockTransport(handle))
            )

        return patch.object(main, "OpenAI", side_effect=create_client)

    def test_real_pdf_extraction(self):
        create_pdf(self.pdf, "L'eau devient vapeur.")
        self.assertIn("L'eau devient vapeur.", main.extract_text(self.pdf))

    def test_missing_file(self):
        with self.assertRaisesRegex(main.PrototypeError, "introuvable"):
            main.extract_text(self.pdf)

    def test_non_pdf_and_fake_pdf(self):
        for name, content, message in [
            ("cours.txt", b"texte", "extension"),
            ("cours.pdf", b"texte", "PDF valide"),
            ("cours.pdf", b"%PDF-1.7\nendommage", "endommage"),
        ]:
            with self.subTest(name=name, content=content):
                path = self.pdf.with_name(name)
                path.write_bytes(content)
                with self.assertRaisesRegex(main.PrototypeError, message):
                    main.extract_text(path)

    def test_blank_and_encrypted_pdf(self):
        for encrypted, message in [(False, "Aucun texte"), (True, "protege")]:
            with self.subTest(encrypted=encrypted):
                create_pdf(self.pdf, encrypted=encrypted)
                with self.assertRaisesRegex(main.PrototypeError, message):
                    main.extract_text(self.pdf)

    def test_extract_only_never_calls_api(self):
        create_pdf(self.pdf, "Cours de test.")
        with patch.object(main, "OpenAI") as client, redirect_stdout(StringIO()) as output:
            self.assertEqual(main.main([str(self.pdf), "--extract-only"]), 0)
        client.assert_not_called()
        self.assertIn("Cours de test.", output.getvalue())

    def test_missing_key_and_oversized_text_prevent_api_call(self):
        with patch.object(main, "OpenAI") as client:
            with self.assertRaisesRegex(main.PrototypeError, "Cle API absente"):
                main.generate_quiz("Cours", " ")
            with self.assertRaisesRegex(main.PrototypeError, "trop long"):
                main.generate_quiz("x" * (main.MAX_TEXT_CHARACTERS + 1), "test-key")
        client.assert_not_called()

    def test_schema_rejects_bad_fields(self):
        for field, value in [
            ("choices", ["A", "B"]), ("question", "  "),
            ("correct_answer", 4), ("correct_answer", True),
            ("correct_answer", "1"), ("explanation", ""),
        ]:
            with self.subTest(field=field, value=value):
                data = quiz_data()
                data["questions"][0][field] = value
                with self.assertRaises(ValidationError):
                    main.Quiz.model_validate(data)

    def test_full_workflow_with_real_sdk_and_mock_http(self):
        create_pdf(self.pdf, "L'eau devient vapeur.")
        content = [{"type": "output_text", "text": json.dumps(quiz_data()), "annotations": []}]
        with self.fake_openai(response_body(content)), \
                patch.dict("os.environ", {"OPENAI_API_KEY": "test-key"}), \
                patch.object(main, "load_dotenv"), redirect_stdout(StringIO()) as output:
            self.assertEqual(main.main([str(self.pdf)]), 0)
        self.assertEqual(output.getvalue().count("Bonne reponse : B. Vapeur"), 5)
        self.assertIn("L'eau devient vapeur.", self.request["input"][0]["content"])
        self.assertEqual(self.request["text"]["format"]["type"], "json_schema")
        self.assertTrue(self.request["text"]["format"]["strict"])
        self.assertFalse(self.request["store"])

    def test_invalid_ai_responses(self):
        short = quiz_data()
        short["questions"].pop()
        duplicate = deepcopy(quiz_data())
        duplicate["questions"][0]["choices"][1] = "Liquide"
        for data in ["pas du JSON", "{}", '{"questions": []}', json.dumps(short), json.dumps(duplicate)]:
            with self.subTest(data=data):
                content = [{"type": "output_text", "text": data, "annotations": []}]
                with self.fake_openai(response_body(content)), self.assertRaises(main.PrototypeError):
                    main.generate_quiz("Cours", "test-key")

    def test_refusal_and_incomplete_response(self):
        bodies = [
            response_body([{"type": "refusal", "refusal": "Document insuffisant"}]),
            response_body([], status="incomplete"),
        ]
        for body in bodies:
            with self.subTest(body=body), self.fake_openai(body):
                with self.assertRaises(main.PrototypeError):
                    main.generate_quiz("Cours", "test-key")

    def test_api_error_does_not_echo_response_body(self):
        body = {"error": {"message": "PRIVATE_TEST_CONTENT", "type": "authentication_error"}}
        with self.fake_openai(body, code=401):
            with self.assertRaisesRegex(main.PrototypeError, "Echec de l'appel") as error:
                main.generate_quiz("Cours", "test-key")
        self.assertNotIn("PRIVATE_TEST_CONTENT", str(error.exception))

    def test_cli_error_and_interactive_path(self):
        with redirect_stderr(StringIO()) as error:
            self.assertEqual(main.main([str(self.pdf)]), 1)
        self.assertIn("introuvable", error.getvalue())
        create_pdf(self.pdf, "Cours.")
        with patch("builtins.input", return_value=f'"{self.pdf}"'), redirect_stdout(StringIO()):
            self.assertEqual(main.main(["--extract-only"]), 0)


if __name__ == "__main__":
    unittest.main()
