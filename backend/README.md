# Backend Quiz IA : FastAPI

Ce MVP du Module 248 reçoit un cours (PDF et/ou texte collé) et retourne un
quiz JSON. Il sert aussi l'interface web (`public/`) : une seule commande lance
tout le site.
Il reprend l'extraction `pypdf`, le prompt et les
modèles Pydantic validés dans `prototype-experimental/main.py`, en les adaptant
aux uploads HTTP et au nombre variable de questions. Le prototype expérimental
reste intact comme trace de l'expérience.

## Installation dans VS Code, Windows et Git Bash

Prérequis : Python 3.10 ou plus récent. Pour générer réellement un quiz,
il faut une clé API d'un fournisseur compatible OpenAI : **NVIDIA**,
**OpenRouter** ou **OpenAI**. Voir « Choisir le fournisseur IA » ci-dessous.
Les tests, `/health` et Swagger fonctionnent sans clé.

Depuis la racine du dépôt :

```bash
# Seulement si .venv n'existe pas encore :
python -m venv .venv

source .venv/Scripts/activate
python -m pip install -r backend/requirements.txt
cp -n backend/.env.example backend/.env
```

Si `python` n'est pas reconnu avant l'activation, utiliser `py -3 -m venv .venv`.
Dans `backend/.env`, renseigner `AI_API_KEY` avec la clé du fournisseur choisi.
Ne jamais la mettre dans le frontend, dans Git ou dans le chat.

### Choisir le fournisseur IA

Les trois fournisseurs parlent le même format que l'API OpenAI : le backend
utilise la bibliothèque `openai` et change seulement d'adresse. Dans
`backend/.env`, garder **un seul** bloc actif (voir `backend/.env.example`) :

| Fournisseur | `AI_BASE_URL` | `AI_MODEL` (exemple) | Où créer la clé |
|---|---|---|---|
| NVIDIA | `https://integrate.api.nvidia.com/v1` | `z-ai/glm-5.3` | build.nvidia.com, page du modèle, **Generate API Key** |
| OpenRouter | `https://openrouter.ai/api/v1` | `openai/gpt-4.1-mini` | openrouter.ai/keys |
| OpenAI | *(vide)* | `gpt-4.1-mini` (par défaut) | platform.openai.com |

Le nom exact du modèle est celui affiché par le fournisseur (champ `model=`
dans son exemple de code). L'ancienne variable `OPENAI_API_KEY` reste lue si
`AI_API_KEY` est vide. Les modèles gratuits (NVIDIA, modèles `:free`
d'OpenRouter) ont des limites de débit et peuvent être lents : le délai
maximum est de 120 secondes. Le texte du cours est envoyé au fournisseur
choisi : ne pas y mettre de données personnelles.

Le fichier `.env` est ignoré par le `.gitignore` existant. Les variables déjà
définies dans le terminal sont prioritaires. Le backend charge uniquement
`backend/.env`, pas le `.env` du prototype expérimental. Redémarrer le serveur
après une modification de sa configuration.

## Lancement

Depuis la racine du dépôt, avec l'environnement activé :

```bash
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```

- **Site (interface)** : http://127.0.0.1:8000/
- État de l'IA : http://127.0.0.1:8000/api/status
- Santé : http://127.0.0.1:8000/health
- Swagger : http://127.0.0.1:8000/docs
- ReDoc : http://127.0.0.1:8000/redoc
- Schéma OpenAPI : http://127.0.0.1:8000/openapi.json

Si le port est occupé, utiliser `--port 8001` et adapter les URL. Ctrl+C arrête
le serveur. Ce lancement écoute seulement sur la machine locale.

## Tester un PDF depuis Swagger

1. Ouvrir `/docs`, puis `POST /api/quiz/generate`.
2. Cliquer sur **Try it out**.
3. Choisir un PDF dans le champ `file`.
4. Renseigner `question_count`, par exemple `5`, et `level`, par exemple `10e`.
5. Cliquer sur **Execute** et lire le statut HTTP et le JSON retourné.

Sans clé, un PDF valide donnera `503 AI_NOT_CONFIGURED`. Avec une vraie clé,
ce test envoie le texte extrait au fournisseur IA et consomme le quota du compte.
Tester d'abord avec un cours autorisé, sans données personnelles d'élèves.

Le PDF doit contenir du texte sélectionnable. Pour la démonstration, prévoir
plusieurs faits distincts afin de permettre le nombre de questions demandé.

## Contrat HTTP

`GET /` et les autres chemins hors API servent les fichiers de `public/`.
`GET /health` retourne `{"status":"healthy"}` : il vérifie que le backend
répond, sans appeler l'IA ni vérifier le quota ou la validité de la clé.
`GET /api/status` retourne `{"aiConfigured": true}` si une clé et un modèle
sont configurés (sans appeler l'IA ni vérifier que la clé est valide).

`POST /api/quiz/generate` attend un formulaire **multipart/form-data** avec
au moins `file` **ou** `text` :

| Champ | Type | Valeur par défaut | Contraintes |
|---|---|---|---|
| `file` | fichier | facultatif | PDF de 5 Mio maximum |
| `text` | texte | facultatif | texte du cours collé ; avec un PDF, ajouté après son texte |
| `question_count` | entier | `5` | de 1 à 10 |
| `level` | texte | `cycle` | `primaire`, `cycle`, `9e`, `10e`, `11e` |

Exemple dans Git Bash, depuis la racine :

```bash
curl -X POST http://127.0.0.1:8000/api/quiz/generate \
  -F "file=@prototype-experimental/samples/cours.pdf;type=application/pdf" \
  -F "question_count=5" \
  -F "level=10e"
```

Avec du texte seul : remplacer la ligne `file` par `-F "text=Le cours..."`.
Le cours complet (PDF + texte) doit faire entre 200 et 60 000 caractères ;
avec un PDF et un texte, ce minimum porte sur l'ensemble.

Réponse HTTP 200, exemple pour `question_count=1` :

```json
{
  "questions": [
    {
      "question": "Que devient l'eau liquide pendant l'évaporation ?",
      "choices": ["De la vapeur", "De la glace", "De la neige", "Du givre"],
      "correct_answer": 0,
      "explanation": "Le cours précise : L'évaporation transforme l'eau liquide en vapeur."
    }
  ]
}
```

Les index sont **0, 1, 2, 3**, soit A, B, C, D. Il y a toujours exactement
4 choix distincts et le nombre de questions demandé dans une réponse 200.

Toutes les erreurs applicatives utilisent le même format :

```json
{
  "error": {
    "code": "INSUFFICIENT_TEXT",
    "message": "Le cours doit contenir au moins 200 caracteres de texte."
  }
}
```

| HTTP | Situations / codes principaux |
|---|---|
| 400 | ni PDF ni texte (`CONTENT_REQUIRED`), fichier sans nom (`FILE_REQUIRED`), formulaire HTTP mal formé |
| 413 | PDF > 5 Mio, corps HTTP trop gros, > 50 pages ou > 60 000 caractères |
| 415 | extension, type MIME ou signature non PDF (`INVALID_FILE_TYPE`) |
| 422 | fichier vide, PDF endommagé/protégé, aucun texte, texte trop court, nombre/niveau invalide |
| 422 | contenu insuffisant selon le LLM (`INSUFFICIENT_CONTENT`) ou refus (`AI_REFUSED`) |
| 502 | fournisseur indisponible ou quiz invalide/incomplet (`AI_INVALID_RESPONSE`) |
| 503 | clé absente/refusée (`AI_NOT_CONFIGURED`) ou quota/limite fournisseur atteint |
| 504 | délai du fournisseur IA dépassé (`AI_TIMEOUT`) |
| 500 | erreur inattendue, avec message générique sans trace Python |

Les erreurs brutes du fournisseur et les valeurs invalides soumises ne sont
pas renvoyées au client.

## Organisation et trajet de la requête

```text
backend/app/main.py                  routes, CORS, réponses d'erreur et service de public/
backend/app/models.py                structure des questions et du quiz
backend/app/config.py                limites et fournisseur IA (.env)
backend/app/errors.py                erreurs métier avec code HTTP
backend/app/middleware.py            limite du corps HTTP avant lecture multipart
backend/app/services/pdf_service.py  validation PDF et extraction du texte
backend/app/services/quiz_service.py  prompt, appel IA et validation du quiz
backend/tests/                      tests sans crédit API
```

**PDF → FastAPI → extraction → LLM → validation → JSON**

1. FastAPI reçoit le formulaire et valide ses champs. Le middleware limite le
   corps HTTP, même si l'envoi n'annonce pas sa taille.
2. Le service PDF vérifie le nom, le type, la taille et la signature `%PDF-`.
   `PdfReader` lit les pages et `extract_text()` récupère le texte.
3. Le service quiz donne au modèle IA le texte du cours et des consignes : niveau,
   nombre de questions, 4 choix et aucune information externe. Une liste vide
   est autorisée pour signaler que le contenu est insuffisant.
4. L'appel `chat.completions` (commun à NVIDIA, OpenRouter et OpenAI) renvoie
   du texte. Le service en extrait l'objet JSON (en ignorant un éventuel
   raisonnement `<think>` ou des balises Markdown), puis le schéma Pydantic le
   valide. Le service contrôle aussi le nombre de questions et les doublons.
5. FastAPI sérialise le modèle `Quiz` en JSON pour le frontend.

Les opérations PDF et IA sont synchrones, dans une route `def` exécutée
par FastAPI dans son pool de threads. Les routes de santé restent indépendantes.

## Limites du prototype

Les constantes sont dans `backend/app/config.py` : **5 Mio**, **50 pages**,
**200 à 60 000 caractères**, **1 à 10 questions**. Le corps HTTP total est
limité à 5 Mio + 64 Kio pour laisser de la place aux champs multipart.
Le fichier est lu avec une limite, et le cours trop long est refusé sans
troncature ni envoi partiel au LLM.

Les scans, illustrations et textes présents uniquement dans des images ne sont
pas lus : aucun OCR n'est inclus. Dans un PDF mixte, seul le texte extractible
sert de source. Le minimum de caractères ne prouve pas la richesse pédagogique.

La consigne demande des extraits du cours dans les explications, mais leur
exactitude n'est pas vérifiée automatiquement. Un JSON valide ne garantit pas
des réponses justes. Une relecture humaine reste nécessaire pour évaluer
l'incertitude pédagogique de ce MVP.

Le délai du fournisseur IA est de 120 secondes, sans nouvelle tentative
automatique. Le backend n'enregistre ni historique ni PDF
dans le projet ; les éventuels fichiers temporaires multipart sont fermés.
Il n'y a ni comptes, ni authentification, ni base de données, ni limite par
utilisateur. Ce MVP est prévu pour les essais locaux.

## Interface web et CORS

Le backend sert `public/` à la racine : l'interface et l'API ont la même
adresse, donc le navigateur n'a pas besoin de CORS. L'interface envoie un
`FormData` avec `file` et/ou `text`, `question_count` et `level` à
`/api/quiz/generate`. Elle convertit la réponse (`correct_answer` →
`correctIndex`) dans `public/js/quiz-logic.js` (`fromServerQuiz`) et remplace
les messages d'erreur par des textes pour les élèves (`public/js/api.js`).

`CORS_ORIGINS` dans `backend/.env` ne sert que si une autre page, sur une autre
adresse, appelle l'API. Il contient des origines séparées par des virgules
(protocole, hôte et port, sans chemin ni slash final). Éviter `*`.

## Tests

Depuis la racine du dépôt, avec `.venv` activé :

```bash
python -m unittest discover -s backend/tests -v
python -m unittest discover -s prototype-experimental/tests -v
git check-ignore backend/.env
```

Les tests créent des PDF en mémoire, vérifient les endpoints, les limites,
CORS, OpenAPI et les modèles, et simulent les réponses HTTP du fournisseur (NVIDIA, OpenRouter, OpenAI) avec le vrai
SDK. Ils ne consomment aucun crédit API. La qualité des questions nécessite
encore un essai avec une vraie clé et plusieurs cours réels.

Références : [fichiers et formulaires FastAPI](https://fastapi.tiangolo.com/tutorial/request-forms-and-files/)
et [sorties structurées OpenAI](https://developers.openai.com/api/docs/guides/structured-outputs).
