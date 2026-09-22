# Backend Quiz IA : FastAPI

Ce MVP du Module 248 reçoit un PDF pédagogique et retourne un quiz JSON.
Il reprend l'extraction `pypdf`, le prompt, l'appel OpenAI Responses et les
modèles Pydantic validés dans `prototype-experimental/main.py`, en les adaptant
aux uploads HTTP et au nombre variable de questions. Le prototype expérimental
reste intact comme trace de l'expérience.

## Installation dans VS Code, Windows et Git Bash

Prérequis : Python 3.10 ou plus récent. Pour générer réellement un quiz,
il faut une clé API OpenAI et l'accès au modèle `gpt-4.1-mini`.
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
Dans `backend/.env`, renseigner `OPENAI_API_KEY` avec la clé du compte API.
Ne jamais la mettre dans le frontend, dans Git ou dans le chat.

Le fichier `.env` est ignoré par le `.gitignore` existant. Les variables déjà
définies dans le terminal sont prioritaires. Le backend charge uniquement
`backend/.env`, pas le `.env` du prototype expérimental. Redémarrer le serveur
après une modification de sa configuration.

## Lancement

Depuis la racine du dépôt, avec l'environnement activé :

```bash
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```

- API : http://127.0.0.1:8000/
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
ce test envoie le texte extrait à OpenAI et consomme le quota API du compte.
Tester d'abord avec un cours autorisé, sans données personnelles d'élèves.

Le PDF doit contenir du texte sélectionnable. Pour la démonstration, prévoir
plusieurs faits distincts afin de permettre le nombre de questions demandé.

## Contrat HTTP

`GET /` retourne `{"status":"ok","service":"Quiz IA API"}`.
`GET /health` retourne `{"status":"healthy"}` : il vérifie que le backend
répond, sans appeler l'IA ni vérifier le quota ou la validité de la clé.

`POST /api/quiz/generate` attend un formulaire **multipart/form-data** :

| Champ | Type | Valeur par défaut | Contraintes |
|---|---|---|---|
| `file` | fichier | obligatoire | PDF de 5 Mio maximum |
| `question_count` | entier | `5` | de 1 à 10 |
| `level` | texte | `cycle` | `primaire`, `cycle`, `9e`, `10e`, `11e` |

Exemple dans Git Bash, depuis la racine :

```bash
curl -X POST http://127.0.0.1:8000/api/quiz/generate \
  -F "file=@prototype-experimental/samples/cours.pdf;type=application/pdf" \
  -F "question_count=5" \
  -F "level=10e"
```

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
| 400 | fichier absent (`FILE_REQUIRED`), formulaire HTTP mal formé |
| 413 | PDF > 5 Mio, corps HTTP trop gros, > 50 pages ou > 60 000 caractères |
| 415 | extension, type MIME ou signature non PDF (`INVALID_FILE_TYPE`) |
| 422 | fichier vide, PDF endommagé/protégé, aucun texte, texte trop court, nombre/niveau invalide |
| 422 | contenu insuffisant selon le LLM (`INSUFFICIENT_CONTENT`) ou refus (`AI_REFUSED`) |
| 502 | fournisseur indisponible ou quiz invalide/incomplet (`AI_INVALID_RESPONSE`) |
| 503 | clé absente/refusée (`AI_NOT_CONFIGURED`) ou quota/limite fournisseur atteint |
| 504 | délai réseau OpenAI dépassé (`AI_TIMEOUT`) |
| 500 | erreur inattendue, avec message générique sans trace Python |

Les erreurs brutes du fournisseur et les valeurs invalides soumises ne sont
pas renvoyées au client.

## Organisation et trajet de la requête

```text
backend/app/main.py                  routes, CORS et réponses d'erreur
backend/app/models.py                structure des questions et du quiz
backend/app/config.py                limites et modèle OpenAI
backend/app/errors.py                erreurs métier avec code HTTP
backend/app/middleware.py            limite du corps HTTP avant lecture multipart
backend/app/services/pdf_service.py  validation PDF et extraction du texte
backend/app/services/quiz_service.py  prompt, OpenAI et validation du quiz
backend/tests/                      tests sans crédit API
```

**PDF → FastAPI → extraction → LLM → validation → JSON**

1. FastAPI reçoit le formulaire et valide ses champs. Le middleware limite le
   corps HTTP, même si l'envoi n'annonce pas sa taille.
2. Le service PDF vérifie le nom, le type, la taille et la signature `%PDF-`.
   `PdfReader` lit les pages et `extract_text()` récupère le texte.
3. Le service quiz donne à OpenAI le texte du cours et des consignes : niveau,
   nombre de questions, 4 choix et aucune information externe. Une liste vide
   est autorisée pour signaler que le contenu est insuffisant.
4. `responses.parse` utilise le schéma Pydantic pour analyser et valider la
   réponse. Le service contrôle aussi le nombre de questions et les doublons.
5. FastAPI sérialise le modèle `Quiz` en JSON pour le frontend.

Les opérations PDF et OpenAI sont synchrones, dans une route `def` exécutée
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

Le délai réseau OpenAI est de 45 secondes, sans nouvelle tentative automatique.
L'appel utilise `store=False`. Le backend n'enregistre ni historique ni PDF
dans le projet ; les éventuels fichiers temporaires multipart sont fermés.
Il n'y a ni comptes, ni authentification, ni base de données, ni limite par
utilisateur. Ce MVP est prévu pour les essais locaux.

## CORS et frontend séparé

`CORS_ORIGINS` dans `backend/.env` contient des origines séparées par des
virgules. Par défaut, `localhost` et `127.0.0.1` sur les ports **5500** et
**5173** sont autorisés. Une origine comprend le protocole, l'hôte et le port,
sans chemin ni slash final. Ajouter l'origine exacte du serveur frontend puis
redémarrer le backend. Éviter `*`.

Le frontend doit envoyer un objet JavaScript `FormData` avec `file`,
`question_count` et `level` à l'URL complète du backend. Ne pas définir
manuellement `Content-Type` : le navigateur doit ajouter la frontière multipart.

**Compatibilité :** l'interface présente sur `origin/main` lors de l'inspection
utilise encore `/api/status` et `/api/generate`, avec du texte JSON et des champs
`correctIndex`, `sourceQuote`. Le backend demandé ici expose le nouveau contrat
PDF `/api/quiz/generate` avec `correct_answer`. Le raccordement de cette interface
reste à faire séparément ; la maquette HTML n'a pas été modifiée.

## Tests

Depuis la racine du dépôt, avec `.venv` activé :

```bash
python -m unittest discover -s backend/tests -v
python -m unittest discover -s prototype-experimental/tests -v
git check-ignore backend/.env
```

Les tests créent des PDF en mémoire, vérifient les endpoints, les limites,
CORS, OpenAPI et les modèles, et simulent les réponses HTTP OpenAI avec le vrai
SDK. Ils ne consomment aucun crédit API. La qualité des questions nécessite
encore un essai avec une vraie clé et plusieurs cours réels.

Références : [fichiers et formulaires FastAPI](https://fastapi.tiangolo.com/tutorial/request-forms-and-files/)
et [sorties structurées OpenAI](https://developers.openai.com/api/docs/guides/structured-outputs).
