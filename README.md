# CIE248 : Quiz IA

Projet du Module 248. Une plateforme web qui transforme un cours (PDF ou texte) en
quiz à choix multiples grâce à l'IA : l'élève répond, puis obtient son score
et un corrigé.

## 🚀 Lancer le site

**Adresse du site, une fois lancé : http://127.0.0.1:8000**

Le serveur Python (`backend/`) affiche aussi l'interface : une seule commande
lance tout. Toutes les commandes se tapent **dans le dossier du projet**
(celui qui contient ce README). Il faut Python 3.10 ou plus récent.

### 1. Installer (une seule fois)

Git Bash ou MobaXterm :

```bash
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r backend/requirements.txt
cp -n backend/.env.example backend/.env
```

PowerShell :

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
Copy-Item backend\.env.example backend\.env
```

Si `python` n'est pas reconnu, remplacer `python` par `py -3` sur la première ligne.

### 2. Mettre la clé API

La clé va dans le fichier **`backend/.env`**, dans le dossier `backend` du projet.
Mais avant il faut renomer le fichier .env.example en .env avant de continuer
Exemple de chemin complet : `C:\Users\<nom>\Desktop\QuizIA\backend\.env`.
Ce fichier est créé à l'étape 1 à partir de `backend/.env.example`.

Pour l'ouvrir avec le Bloc-notes (dans PowerShell, avec le chemin entre guillemets) :

```powershell
notepad "backend\.env"
```

Coller la clé **juste après `AI_API_KEY=`**, sans espace ni guillemets, puis
enregistrer (Ctrl+S) :

```text
AI_BASE_URL=https://integrate.api.nvidia.com/v1
AI_MODEL=nvidia/nemotron-3-super-120b-a12b
AI_API_KEY=nvapi-...votre-clé...
```

- **Clé NVIDIA** (gratuite) : https://build.nvidia.com, ouvrir un modèle, puis **Generate API Key**.
- **Clé OpenRouter** : https://openrouter.ai/keys. Dans `backend/.env`, mettre
  `#` devant les trois lignes NVIDIA et enlever le `#` des trois lignes OpenRouter.

⚠️ `backend/.env` est ignoré par Git : la clé ne part jamais sur GitHub. Ne la
mettez jamais dans le code, dans une capture d'écran ni dans un chat. Si c'est
arrivé, supprimez-la sur le site du fournisseur et créez-en une nouvelle.

### 3. Lancer

Git Bash ou MobaXterm :

```bash
.venv/Scripts/python.exe -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```

PowerShell :

```powershell
.venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```

Attendre la ligne `Uvicorn running on http://127.0.0.1:8000`, puis ouvrir
**http://127.0.0.1:8000**. Laisser le terminal ouvert : **Ctrl+C** arrête le site.
Après une modification de `backend/.env`, arrêter (Ctrl+C) et relancer.

Liens utiles :

| Adresse | Rôle |
|---|---|
| http://127.0.0.1:8000 | Le site Quiz IA |
| http://127.0.0.1:8000/api/status | `{"aiConfigured":true}` si une clé est lue dans `.env` |
| http://127.0.0.1:8000/docs | Documentation de l'API (tests techniques) |

### En cas de problème

| Ce qu'on voit | Cause et solution |
|---|---|
| « 127.0.0.1 refused to connect » | Le serveur n'est pas lancé (étape 3), ou son terminal a été fermé. |
| `bash: syntax error near unexpected token '&'` | Commande PowerShell tapée dans Git Bash : utiliser la version Git Bash. |
| Bandeau « La génération IA n'est pas encore configurée » | Pas de clé dans `backend/.env` (étape 2), ou serveur pas relancé après l'avoir ajoutée. |
| « L'IA met trop de temps à répondre » | Modèle gratuit saturé. Dans `backend/.env`, essayer `AI_MODEL=deepseek-ai/deepseek-v4.1-flash`, puis relancer. |
| « La génération IA n'est pas configurée sur le serveur » après un clic | Clé refusée par le fournisseur : vérifier qu'elle est complète, ou en créer une nouvelle. |

Sans clé ou sans Internet, le bouton **Jouer au quiz de démonstration** fonctionne toujours.

Tests : `node --test` (interface, Node.js 24) et
`.venv/Scripts/python.exe -m unittest discover -s backend/tests -v` (backend).

## 👉 Pour continuer le projet, lire d'abord : [docs/PLAN.md](docs/PLAN.md)

Ce fichier est la référence de l'équipe (humains et assistants IA). Il contient :

- les décisions prises et l'architecture ;
- le format exact des échanges entre l'interface, le serveur et l'IA ;
- **les étapes à faire, dans l'ordre, avec des cases à cocher** ;
- les règles de sécurité et le plan B pour la démo.

**Étape en cours : Étape 1 (mise en place du repo), branche `chore/mise-en-place`.**

> Assistants IA (Claude, ChatGPT, Codex…) : lisez `docs/PLAN.md` avant toute
> modification. Ne supposez jamais qu'un changement discuté ailleurs existe :
> seul ce repository fait foi.

## Branches

Chaque étape du plan a sa propre branche. On ne travaille jamais directement sur `main`.

| Branche | Étape du plan |
|---|---|
| `chore/mise-en-place` | S2 · Étape 1 : `.gitignore`, `.env.example`, README, `AGENTS.md` |
| `feat/squelette-serveur` | S2 · Étape 2 : serveur Express en mode factice, `npm test` |
| `feat/interface` | S2 · Étape 3 : interface dans `public/`, inspirée de `prototype.html` |
| `feat/test-openrouter` | S2 · Étape 4 : premier appel réel à OpenRouter, choix du modèle |
| `feat/generation-ia` | S3 : prompt, schéma JSON, validation, gestion des erreurs |
| `feat/limitation-requetes` | S3 : limite de générations par visiteur (site public) |
| `chore/deploiement-pi` | S4 : installation sur le Raspberry Pi 5 + accès public |
| `chore/stabilisation-demo` | S5 : bugs, tests, scénario de démo, plan B |

### Travailler sur une étape

```bash
git switch main
git pull
git switch feat/nom-de-la-branche
git merge main
```

`git merge main` récupère le travail déjà fusionné, car les branches ont été
créées à l'avance. Ensuite : commits, `git push`, puis Pull Request vers `main`,
relue par un autre membre avant la fusion.

## Contenu actuel

| Fichier | Rôle |
|---|---|
| `docs/PLAN.md` | Plan du projet et étapes à suivre |
| `docs/DESIGN.md` | Design system (couleurs, composants) et règles de rédaction des textes |
| `public/` | Interface (HTML, CSS, JavaScript) : écrans Créer → Quiz → Résultat |
| `backend/` | Serveur FastAPI : génération du quiz par l'IA et service de l'interface |
| `tests/` | Tests automatiques (`node --test`) |
| `prototype.html` | Maquette d'origine, **à ne pas modifier**. Visible sur https://timeoge.github.io/CIE248/prototype.html |

## Prototype expérimental Python

L'expérience PDF vers quiz OpenAI fonctionne dans le terminal, indépendamment
du projet web. Son [README](prototype-experimental/README.md) explique
l'installation sous Windows avec Git Bash, la configuration et les tests.

Cette expérience utilise `feature/experimental-ai-quiz`, avec une Pull Request
vers `develop` pour intégration avant une éventuelle validation vers `main`.

## Sécurité

Ne jamais mettre de clé API dans le code, dans Git, dans un chat IA ou sur
Discord. Le repository est **public**.
