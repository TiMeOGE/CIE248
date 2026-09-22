"""Limites du MVP et configuration locale."""

import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
PUBLIC_DIR = BACKEND_DIR.parent / "public"
DEFAULT_OPENAI_MODEL = "gpt-4.1-mini"
AI_TIMEOUT_SECONDS = 120.0
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


def ai_settings() -> tuple[str, str | None, str]:
    """Cle, adresse et modele d'un fournisseur compatible OpenAI (NVIDIA, OpenRouter, OpenAI)."""
    api_key = os.getenv("AI_API_KEY", "").strip() or os.getenv("OPENAI_API_KEY", "").strip()
    base_url = os.getenv("AI_BASE_URL", "").strip() or None
    # Sans adresse, le SDK vise OpenAI : on garde alors l'ancien modele par defaut.
    model = os.getenv("AI_MODEL", "").strip() or ("" if base_url else DEFAULT_OPENAI_MODEL)
    return api_key, base_url, model
