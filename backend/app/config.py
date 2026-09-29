"""Limites du MVP et configuration locale."""

import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
PUBLIC_DIR = BACKEND_DIR.parent / "public"
DEFAULT_OPENAI_MODEL = "gpt-4.1-mini"
# Delai de l'IA selon le travail demande (voir ai_timeout_seconds) : 120 s pour 5 questions faciles.
AI_TIMEOUT_BASE_SECONDS = 60
AI_TIMEOUT_PER_QUESTION_SECONDS = 12
AI_TIMEOUT_DIFFICULTY_FACTORS = {"facile": 1.0, "intermediaire": 1.25, "difficile": 1.5}
MAX_PDF_BYTES = 5 * 1024 * 1024
MAX_REQUEST_BYTES = MAX_PDF_BYTES + 64 * 1024  # Marge pour les champs multipart.
MAX_PDF_PAGES = 50
MIN_TEXT_CHARACTERS = 200
MAX_TEXT_CHARACTERS = 60_000
MIN_QUESTIONS = 1
MAX_QUESTIONS = 15

# OCR des pages scannees (services/ocr_service.py), regle pour un Raspberry Pi.
# Une page dont pypdf lit moins de lettres/chiffres que ce seuil passe a l'OCR.
OCR_MIN_PAGE_CHARACTERS = 50
OCR_DPI = 200  # 300 est un peu plus precis mais environ deux fois plus lent
OCR_MAX_PIXELS = 8_000_000  # plafond d'une image (A3 a 200 DPI) contre les pages demesurees
OCR_LANGUAGES = "fra+eng"  # paquets tesseract-ocr-fra et tesseract-ocr-eng
OCR_TIMEOUT_SECONDS = 60  # duree totale d'OCR par document, avant l'appel a l'IA
OCR_MAX_PARALLEL_PAGES = 1  # processus Tesseract simultanes sur tout le serveur
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


def ai_timeout_seconds(question_count: int, difficulty: str) -> float:
    """Plus de questions et une difficulte plus haute demandent plus de reflexion a l'IA.

    Meme calcul dans generateTimeoutMs (public/js/api.js) : garder les deux identiques.
    """
    seconds = AI_TIMEOUT_BASE_SECONDS + AI_TIMEOUT_PER_QUESTION_SECONDS * question_count
    return seconds * AI_TIMEOUT_DIFFICULTY_FACTORS[difficulty]
