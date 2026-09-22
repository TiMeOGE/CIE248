"""Routes HTTP ; les traitements synchrones tournent dans le pool FastAPI."""

import os
from typing import Annotated

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

from .config import BACKEND_DIR, DEFAULT_ORIGINS, MAX_PDF_BYTES, MAX_QUESTIONS, MIN_QUESTIONS
from .errors import ApiError
from .middleware import RequestSizeLimit
from .models import ErrorResponse, Quiz, SchoolLevel
from .services.pdf_service import extract_text, validate_upload
from .services.quiz_service import generate_quiz


def error_response(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}})


def create_app() -> FastAPI:
    load_dotenv(BACKEND_DIR / ".env", override=False)
    app = FastAPI(title="Quiz IA API", version="0.1.0", debug=False)
    app.add_middleware(RequestSizeLimit)
    origins = [origin.strip() for origin in os.getenv("CORS_ORIGINS", DEFAULT_ORIGINS).split(",") if origin.strip()]
    app.add_middleware(
        CORSMiddleware, allow_origins=origins, allow_credentials=False,
        allow_methods=["GET", "POST"], allow_headers=["Content-Type"],
    )

    @app.exception_handler(ApiError)
    async def service_error(request: Request, error: ApiError):
        return error_response(error.status_code, error.code, error.message)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, error: RequestValidationError):
        fields = {item["loc"][-1] for item in error.errors()}
        if "file" in fields:
            return error_response(400, "FILE_REQUIRED", "Fournir un fichier PDF dans le champ file.")
        if "question_count" in fields:
            return error_response(422, "INVALID_QUESTION_COUNT", "question_count doit etre un entier entre 1 et 10.")
        if "level" in fields:
            return error_response(422, "INVALID_LEVEL", "Choisir primaire, cycle, 9e, 10e ou 11e.")
        return error_response(422, "INVALID_INPUT", "Les champs de la requete sont invalides.")

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, error: HTTPException):
        return error_response(error.status_code, "HTTP_ERROR", "Requete ou route invalide.")

    @app.exception_handler(Exception)
    async def unexpected_error(request: Request, error: Exception):
        return error_response(500, "INTERNAL_ERROR", "Une erreur interne est survenue.")

    @app.get("/")
    async def root():
        return {"status": "ok", "service": "Quiz IA API"}

    @app.get("/health")
    async def health():
        return {"status": "healthy"}

    @app.post(
        "/api/quiz/generate", response_model=Quiz,
        responses={status: {"model": ErrorResponse} for status in (400, 413, 415, 422, 500, 502, 503, 504)},
    )
    def generate(
        file: Annotated[UploadFile, File(description="PDF contenant du texte, maximum 5 Mio.")],
        question_count: Annotated[int, Form(ge=MIN_QUESTIONS, le=MAX_QUESTIONS)] = 5,
        level: Annotated[SchoolLevel, Form()] = "cycle",
    ) -> Quiz:
        try:
            validate_upload(file.filename, file.content_type, file.size or 0)
            data = file.file.read(MAX_PDF_BYTES + 1)
        finally:
            file.file.close()
        text = extract_text(data)
        return generate_quiz(text, os.getenv("OPENAI_API_KEY", ""), question_count, level)

    return app


app = create_app()
