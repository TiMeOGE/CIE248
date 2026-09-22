"""Limites du MVP et configuration locale."""

from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
MODEL = "gpt-4.1-mini"
MAX_PDF_BYTES = 5 * 1024 * 1024
MAX_REQUEST_BYTES = MAX_PDF_BYTES + 64 * 1024  # Marge pour les champs multipart.
MAX_PDF_PAGES = 50
MIN_TEXT_CHARACTERS = 200
MAX_TEXT_CHARACTERS = 60_000
MIN_QUESTIONS = 1
MAX_QUESTIONS = 10
DEFAULT_ORIGINS = (
    "http://localhost:5500,http://127.0.0.1:5500,"
    "http://localhost:5173,http://127.0.0.1:5173"
)
