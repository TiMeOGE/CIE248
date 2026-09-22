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


NVIDIA = {"AI_API_KEY": "test-key", "AI_BASE_URL": "https://integrate.api.nvidia.com/v1", "AI_MODEL": "nvidia/nemotron-3-super-120b-a12b"}


class ServiceTests(unittest.TestCase):
    def setUp(self):
        environment = patch.dict("os.environ", {**NVIDIA, "OPENAI_API_KEY": ""})
        environment.start()
        self.addCleanup(environment.stop)

    def response_body(self, data, finish_reason="stop", refusal=None, content=None):
        return {
            "id": "chatcmpl_test", "object": "chat.completion", "created": 0, "model": "test-model",
            "choices": [{"index": 0, "finish_reason": finish_reason, "message": {
                "role": "assistant", "refusal": refusal,
                "content": json.dumps(data) if content is None else content,
            }}],
        }

    def fake_openai(self, body=None, status=200, timeout=False):
        def handle(request):
            self.url = str(request.url)
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
            quiz = quiz_service.generate_quiz(COURSE, 3, "difficile")
        self.assertEqual(quiz.model_dump(), quiz_data(3))
        self.assertEqual(self.url, "https://integrate.api.nvidia.com/v1/chat/completions")
        self.assertEqual(self.request["model"], "nvidia/nemotron-3-super-120b-a12b")
        system, user = self.request["messages"]
        self.assertIn("exactement 3", system["content"])
        self.assertIn("Difficulte DIFFICILE", system["content"])
        self.assertIn("uniquement sur le document", system["content"])
        self.assertIn('"correct_answer"', system["content"])
        self.assertIn(COURSE, user["content"])

    def test_providers_are_configured_by_environment(self):
        cases = [
            ({"AI_BASE_URL": "https://openrouter.ai/api/v1", "AI_MODEL": "openai/gpt-4.1-mini"},
             "https://openrouter.ai/api/v1/chat/completions", "openai/gpt-4.1-mini"),
            ({"AI_API_KEY": "", "OPENAI_API_KEY": "test-key", "AI_BASE_URL": "", "AI_MODEL": ""},
             "https://api.openai.com/v1/chat/completions", "gpt-4.1-mini"),
        ]
        for environment, url, model in cases:
            with self.subTest(url=url), patch.dict("os.environ", environment), \
                    self.fake_openai(self.response_body(quiz_data(1))):
                quiz_service.generate_quiz(COURSE, 1)
                self.assertEqual((self.url, self.request["model"]), (url, model))

    def test_missing_key_or_model(self):
        for environment in ({"AI_API_KEY": ""}, {"AI_MODEL": ""}):
            with self.subTest(environment=environment), patch.dict("os.environ", environment), \
                    self.fake_openai(self.response_body(quiz_data())):
                with self.assertRaises(ApiError) as error:
                    quiz_service.generate_quiz(COURSE)
                self.assertEqual(error.exception.code, "AI_NOT_CONFIGURED")

    def test_each_difficulty_changes_the_prompt(self):
        prompts = set()
        for difficulty in ("facile", "intermediaire", "difficile"):
            with self.subTest(difficulty=difficulty), self.fake_openai(self.response_body(quiz_data(1))):
                quiz_service.generate_quiz(COURSE, 1, difficulty)
                system = self.request["messages"][0]["content"]
                self.assertIn(f"Difficulte {difficulty.upper()}", system)
                prompts.add(system)
        self.assertEqual(len(prompts), 3)

    def test_json_wrapped_in_reasoning_or_markdown(self):
        fence = "`" * 3
        wrapped = "<think>Je lis le cours {brouillon}</think>" + fence + "json " + json.dumps(quiz_data(2)) + fence
        with self.fake_openai(self.response_body(None, content=wrapped)):
            self.assertEqual(quiz_service.generate_quiz(COURSE, 2).model_dump(), quiz_data(2))

    def test_full_api_workflow_with_mock_http(self):
        from fastapi.testclient import TestClient
        from backend.app.main import app

        with patch.dict("os.environ", NVIDIA), \
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
                    quiz_service.generate_quiz(COURSE)
                self.assertEqual(error.exception.status_code, status)

    def test_refused_incomplete_and_non_json_response(self):
        cases = [
            (self.response_body(None, refusal="Document insuffisant", content=""), 422),
            (self.response_body(quiz_data(), finish_reason="length"), 502),
            (self.response_body(None, content="pas du JSON"), 502),
            (self.response_body(None, content=""), 502),
        ]
        for body, status in cases:
            with self.subTest(status=status), self.fake_openai(body):
                with self.assertRaises(ApiError) as error:
                    quiz_service.generate_quiz(COURSE)
                self.assertEqual(error.exception.status_code, status)

    def test_provider_errors_are_sanitized(self):
        for upstream, expected in [(401, 503), (429, 503), (500, 502)]:
            body = {"error": {"message": "PRIVATE_TEST_VALUE", "type": "test_error"}}
            with self.subTest(upstream=upstream), self.fake_openai(body, status=upstream):
                with self.assertRaises(ApiError) as error:
                    quiz_service.generate_quiz(COURSE)
                self.assertEqual(error.exception.status_code, expected)
                self.assertNotIn("PRIVATE_TEST_VALUE", str(error.exception))
        with self.fake_openai(timeout=True), self.assertRaises(ApiError) as error:
            quiz_service.generate_quiz(COURSE)
        self.assertEqual(error.exception.status_code, 504)


if __name__ == "__main__":
    unittest.main()
