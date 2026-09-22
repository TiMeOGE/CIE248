import json
import unittest
from unittest.mock import patch

import httpx
from openai import OpenAI
from pydantic import ValidationError

from backend.app.errors import ApiError
from backend.app.models import Question, Quiz
from backend.app.services import pdf_service, quiz_service
from backend.tests.helpers import COURSE, make_pdf, quiz_data


class ServiceTests(unittest.TestCase):
    def response_body(self, data, status="completed", refusal=False):
        content = [{"type": "refusal", "refusal": "Document insuffisant"}] if refusal else [
            {"type": "output_text", "text": json.dumps(data), "annotations": []}
        ]
        return {
            "id": "resp_test", "object": "response", "created_at": 0,
            "model": quiz_service.MODEL, "status": status,
            "output": [{"type": "message", "id": "msg_test", "role": "assistant", "status": "completed", "content": content}],
        }

    def fake_openai(self, body=None, status=200, timeout=False):
        def handle(request):
            self.request = json.loads(request.content)
            if timeout:
                raise httpx.ReadTimeout("PRIVATE_TEST_VALUE", request=request)
            return httpx.Response(status, json=body)

        def factory(**kwargs):
            return OpenAI(**kwargs, http_client=httpx.Client(transport=httpx.MockTransport(handle)))

        return patch.object(quiz_service, "OpenAI", side_effect=factory)

    def test_pdf_extraction_and_text_limit(self):
        self.assertEqual(pdf_service.extract_text(make_pdf()), COURSE)
        with self.assertRaises(ApiError) as error:
            pdf_service.extract_text(make_pdf(text="a" * 60_001))
        self.assertEqual(error.exception.code, "TEXT_TOO_LONG")

    def test_models_reject_invalid_questions(self):
        for field, value in [
            ("choices", ["A", "B"]), ("choices", ["A", " a ", "B", "C"]),
            ("question", "  "), ("correct_answer", 4), ("correct_answer", -1),
            ("correct_answer", True), ("correct_answer", "1"), ("explanation", ""),
        ]:
            with self.subTest(field=field, value=value):
                question = quiz_data(1)["questions"][0]
                question[field] = value
                with self.assertRaises(ValidationError):
                    Question.model_validate(question)
        for count in (0, 11):
            with self.assertRaises(ValidationError):
                Quiz.model_validate(quiz_data(count))

    def test_actual_sdk_parses_quiz_and_builds_prompt(self):
        with self.fake_openai(self.response_body(quiz_data(3))):
            quiz = quiz_service.generate_quiz(COURSE, "test-key", 3, "10e")
        self.assertEqual(quiz.model_dump(), quiz_data(3))
        self.assertIn("exactement 3", self.request["instructions"])
        self.assertIn("10e", self.request["instructions"])
        self.assertIn("uniquement sur le document", self.request["instructions"])
        self.assertIn(COURSE, self.request["input"][0]["content"])
        self.assertTrue(self.request["text"]["format"]["strict"])
        self.assertFalse(self.request["store"])

    def test_full_api_workflow_with_mock_http(self):
        from fastapi.testclient import TestClient
        from backend.app.main import app

        with patch.dict("os.environ", {"OPENAI_API_KEY": "test-key"}), \
                self.fake_openai(self.response_body(quiz_data(2))), TestClient(app) as client:
            response = client.post("/api/quiz/generate", files={"file": ("cours.pdf", make_pdf(), "application/pdf")}, data={"question_count": 2})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(len(response.json()["questions"]), 2)

    def test_empty_wrong_count_duplicate_and_malformed_responses(self):
        duplicate = quiz_data()
        duplicate["questions"][1] = duplicate["questions"][0]
        invalid = quiz_data()
        invalid["questions"][0]["correct_answer"] = True
        cases = [(quiz_data(0), 422), (quiz_data(2), 502), (duplicate, 502), (invalid, 502), ({}, 502)]
        for data, status in cases:
            with self.subTest(data=data), self.fake_openai(self.response_body(data)):
                with self.assertRaises(ApiError) as error:
                    quiz_service.generate_quiz(COURSE, "test-key")
                self.assertEqual(error.exception.status_code, status)

    def test_refused_incomplete_and_non_json_response(self):
        malformed = self.response_body({})
        malformed["output"][0]["content"][0]["text"] = "pas du JSON"
        cases = [
            (self.response_body({}, refusal=True), 422),
            (self.response_body(quiz_data(), status="incomplete"), 502),
            (malformed, 502),
        ]
        for body, status in cases:
            with self.subTest(status=status), self.fake_openai(body):
                with self.assertRaises(ApiError) as error:
                    quiz_service.generate_quiz(COURSE, "test-key")
                self.assertEqual(error.exception.status_code, status)

    def test_provider_errors_are_sanitized(self):
        for upstream, expected in [(401, 503), (429, 503), (500, 502)]:
            body = {"error": {"message": "PRIVATE_TEST_VALUE", "type": "test_error"}}
            with self.subTest(upstream=upstream), self.fake_openai(body, status=upstream):
                with self.assertRaises(ApiError) as error:
                    quiz_service.generate_quiz(COURSE, "test-key")
                self.assertEqual(error.exception.status_code, expected)
                self.assertNotIn("PRIVATE_TEST_VALUE", str(error.exception))
        with self.fake_openai(timeout=True), self.assertRaises(ApiError) as error:
            quiz_service.generate_quiz(COURSE, "test-key")
        self.assertEqual(error.exception.status_code, 504)


if __name__ == "__main__":
    unittest.main()
