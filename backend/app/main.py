"""Routes HTTP et interface web ; les traitements synchrones tournent dans le pool FastAPI."""

import os
from typing import Annotated

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException

from .config import (
    BACKEND_DIR, DEFAULT_ORIGINS, MAX_PDF_BYTES, MAX_QUESTIONS, MAX_TEXT_CHARACTERS, MIN_QUESTIONS,
    MIN_TEXT_CHARACTERS, PUBLIC_DIR, ai_settings,
)
from .errors import ApiError
from .middleware import RequestSizeLimit
from .models import Difficulty, ErrorResponse, Quiz
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
            return error_response(415, "INVALID_FILE_TYPE", "Le champ file doit contenir un fichier PDF.")
        if "question_count" in fields:
            return error_response(422, "INVALID_QUESTION_COUNT", "question_count doit etre un entier entre 1 et 10.")
        if "difficulty" in fields:
            return error_response(422, "INVALID_DIFFICULTY", "Choisir facile, intermediaire ou difficile.")
        return error_response(422, "INVALID_INPUT", "Les champs de la requete sont invalides.")

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, error: HTTPException):
        return error_response(error.status_code, "HTTP_ERROR", "Requete ou route invalide.")

    @app.exception_handler(Exception)
    async def unexpected_error(request: Request, error: Exception):
        return error_response(500, "INTERNAL_ERROR", "Une erreur interne est survenue.")

    @app.get("/health")
    async def health():
        return {"status": "healthy"}

    @app.get("/api/status")
    async def status():
        # Indique seulement si une cle et un modele sont configures, sans appeler l'IA.
        api_key, _, model = ai_settings()
        return {"aiConfigured": bool(api_key and model)}

    @app.post(
        "/api/quiz/generate", response_model=Quiz,
        responses={status: {"model": ErrorResponse} for status in (400, 413, 415, 422, 500, 502, 503, 504)},
    )
    def generate(
        file: Annotated[UploadFile | None, File(description="PDF contenant du texte, maximum 5 Mio.")] = None,
        text: Annotated[str, Form(description="Texte du cours colle, seul ou en complement du PDF.")] = "",
        question_count: Annotated[int, Form(ge=MIN_QUESTIONS, le=MAX_QUESTIONS)] = 5,
        difficulty: Annotated[Difficulty, Form()] = "intermediaire",
    ) -> Quiz:
        pasted = text.strip()
        parts = []
        if file is not None:
            try:
                validate_upload(file.filename, file.content_type, file.size or 0)
                data = file.file.read(MAX_PDF_BYTES + 1)
            finally:
                file.file.close()
            # Avec un texte colle, le minimum de caracteres porte sur l'ensemble.
            parts.append(extract_text(data, min_characters=0 if pasted else MIN_TEXT_CHARACTERS))
        if pasted:
            parts.append(pasted)
        if not parts:
            raise ApiError(400, "CONTENT_REQUIRED", "Fournir un PDF ou coller le texte du cours.")
        course = "\n\n".join(parts)
        if len(course) > MAX_TEXT_CHARACTERS:
            raise ApiError(413, "TEXT_TOO_LONG", "Le cours depasse 60 000 caracteres.")
        if len(course) < MIN_TEXT_CHARACTERS:
            raise ApiError(422, "INSUFFICIENT_TEXT", "Le cours doit contenir au moins 200 caracteres de texte.")
        return generate_quiz(course, question_count, difficulty)

    # Interface web (public/) servie a la racine, apres les routes de l'API.
    app.mount("/", StaticFiles(directory=PUBLIC_DIR, html=True), name="public")

    return app


app = create_app()
