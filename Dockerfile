# Site Quiz IA (API FastAPI + interface public/) avec OCR Tesseract.
# Image officielle multi-architecture : se construit telle quelle sur un Raspberry Pi (arm64) ou un PC (amd64).
FROM python:3.13-slim-bookworm

# Tesseract et ses langues (voir OCR_LANGUAGES dans backend/app/config.py), sans paquets recommandes.
RUN apt-get update \
    && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-fra tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app
# Dependances d'abord : Docker les garde en cache tant que requirements.txt ne change pas.
COPY backend/requirements.txt backend/requirements.txt
RUN pip install -r backend/requirements.txt

# backend/.env (cle API) est exclu par .dockerignore : la cle se passe avec --env-file.
COPY backend backend
COPY public public

# Le serveur tourne sans droits administrateur.
RUN useradd --system --no-create-home quiz
USER quiz

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4)"]
CMD ["python", "-m", "uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
