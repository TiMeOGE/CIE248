import os
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.app import main
from backend.app.config import MAX_PDF_BYTES, MAX_REQUEST_BYTES
from backend.app.errors import ApiError
from backend.app.models import Quiz
from backend.tests.helpers import COURSE, make_pdf, quiz_data


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.environment = patch.dict(os.environ, {"AI_API_KEY": "", "OPENAI_API_KEY": "", "AI_BASE_URL": "", "AI_MODEL": "", "CORS_ORIGINS": "http://localhost:5500"})
        self.environment.start()
        self.addCleanup(self.environment.stop)
        with patch.object(main, "load_dotenv"):
            self.client = TestClient(main.create_app(), raise_server_exceptions=False)
        self.addCleanup(self.client.close)
        self.pdf = make_pdf()

    def post_pdf(self, data=None, filename="cours.pdf", content_type="application/pdf", **form):
        return self.client.post(
            "/api/quiz/generate",
            files={"file": (filename, self.pdf if data is None else data, content_type)},
            data=form,
        )

    def test_health_and_root_without_llm(self):
        with patch.object(main, "generate_quiz") as generate:
            self.assertEqual(self.client.get("/").json(), {"status": "ok", "service": "Quiz IA API"})
            response = self.client.get("/health")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json(), {"status": "healthy"})
        generate.assert_not_called()

    def test_missing_file(self):
        response = self.client.post("/api/quiz/generate", data={"question_count": 5})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"]["code"], "FILE_REQUIRED")

    def test_reject_bad_files_before_llm(self):
        cases = [
            (b"texte", "cours.txt", "text/plain", 415),
            (b"texte", "cours.pdf", "application/pdf", 415),
            (self.pdf, "cours.pdf", "image/png", 415),
            (b"", "cours.pdf", "application/pdf", 422),
            (b"%PDF-1.7\nendommage", "cours.pdf", "application/pdf", 422),
            (make_pdf(text=None), "cours.pdf", "application/pdf", 422),
            (make_pdf(text="Trop court."), "cours.pdf", "application/pdf", 422),
            (make_pdf(encrypted=True), "cours.pdf", "application/pdf", 422),
            (make_pdf(pages=51), "cours.pdf", "application/pdf", 413),
        ]
        with patch.object(main, "generate_quiz") as generate:
            for data, filename, content_type, status in cases:
                with self.subTest(filename=filename, size=len(data), status=status):
                    response = self.post_pdf(data, filename, content_type)
                    self.assertEqual(response.status_code, status, response.text)
                    self.assertIn("error", response.json())
        generate.assert_not_called()

    def test_question_count_and_level_validation(self):
        with patch.object(main, "generate_quiz") as generate:
            for count in ("0", "11", "-1", "1.5", "abc"):
                with self.subTest(count=count):
                    response = self.post_pdf(question_count=count)
                    self.assertEqual(response.status_code, 422)
                    self.assertEqual(response.json()["error"]["code"], "INVALID_QUESTION_COUNT")
            response = self.post_pdf(level="INSTRUCTION_SECRETE")
            self.assertEqual(response.status_code, 422)
            self.assertNotIn("INSTRUCTION_SECRETE", response.text)
        generate.assert_not_called()

    def test_file_size_and_streamed_request_limits(self):
        with patch.object(main, "generate_quiz") as generate:
            response = self.post_pdf(b"%PDF-" + b"x" * (MAX_PDF_BYTES - 4))
            self.assertEqual(response.status_code, 413)
            self.assertEqual(response.json()["error"]["code"], "PDF_TOO_LARGE")
            response = self.client.post(
                "/api/quiz/generate", content=iter([b"x" * (1024 * 1024)] * 6),
                headers={"Content-Type": "multipart/form-data; boundary=test"},
            )
            self.assertEqual(response.status_code, 413)
            self.assertEqual(response.json()["error"]["code"], "REQUEST_TOO_LARGE")
            response = self.client.post(
                "/api/quiz/generate", content=b"", headers={"Content-Length": str(MAX_REQUEST_BYTES + 1)},
            )
            self.assertEqual(response.status_code, 413)
        generate.assert_not_called()

    def test_pdf_to_json_and_count_boundaries(self):
        for count in (1, 5, 10):
            with self.subTest(count=count), patch.object(main, "generate_quiz", return_value=Quiz(**quiz_data(count))) as generate:
                response = self.post_pdf(question_count=count, level="10e")
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(response.json(), quiz_data(count))
                text, actual_count, level = generate.call_args.args
                self.assertIn(COURSE, text)
                self.assertEqual((actual_count, level), (count, "10e"))

    def test_missing_api_key(self):
        response = self.post_pdf()
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["error"]["code"], "AI_NOT_CONFIGURED")

    def test_error_mapping_and_no_stack_trace(self):
        with patch.object(main, "generate_quiz", side_effect=ApiError(504, "AI_TIMEOUT", "Delai depasse.")):
            response = self.post_pdf()
            self.assertEqual(response.status_code, 504)
            self.assertEqual(response.json()["error"]["code"], "AI_TIMEOUT")
        with patch.object(main, "generate_quiz", side_effect=RuntimeError("PRIVATE_TEST_VALUE")):
            response = self.post_pdf()
            self.assertEqual(response.status_code, 500)
            self.assertEqual(response.json()["error"]["code"], "INTERNAL_ERROR")
            self.assertNotIn("PRIVATE_TEST_VALUE", response.text)
            self.assertNotIn("Traceback", response.text)

    def test_swagger_and_openapi_multipart_contract(self):
        self.assertEqual(self.client.get("/docs").status_code, 200)
        self.assertIn("swagger-ui", self.client.get("/docs").text)
        self.assertEqual(self.client.get("/redoc").status_code, 200)
        schema = self.client.get("/openapi.json").json()
        operation = schema["paths"]["/api/quiz/generate"]["post"]
        form = operation["requestBody"]["content"]["multipart/form-data"]["schema"]
        fields = schema["components"]["schemas"][form["$ref"].split("/")[-1]]
        self.assertEqual(set(fields["properties"]), {"file", "question_count", "level"})
        self.assertIn("file", fields["required"])

    def test_cors_allowed_denied_and_validation_errors(self):
        for origin, allowed in [("http://localhost:5500", True), ("https://untrusted.example", False)]:
            with self.subTest(origin=origin):
                response = self.client.options("/api/quiz/generate", headers={
                    "Origin": origin, "Access-Control-Request-Method": "POST",
                    "Access-Control-Request-Headers": "Content-Type",
                })
                self.assertEqual(response.status_code, 200 if allowed else 400)
                self.assertEqual("access-control-allow-origin" in response.headers, allowed)
        response = self.client.post("/api/quiz/generate", headers={"Origin": "http://localhost:5500"})
        self.assertEqual(response.headers["access-control-allow-origin"], "http://localhost:5500")


if __name__ == "__main__":
    unittest.main()
