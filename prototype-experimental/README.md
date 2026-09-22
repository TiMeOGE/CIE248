# Prototype expérimental : PDF vers quiz IA

Expérience du Module 248 : vérifier si le texte d'un PDF pédagogique permet à
une IA de produire un quiz pertinent. Le programme affiche 5 QCM, leurs 4 choix,
la bonne réponse et une explication dans le terminal.

Ce prototype Python/OpenAI est indépendant du projet web Node.js/OpenRouter
décrit dans `../docs/PLAN.md`. La maquette `../prototype.html` reste la référence
visuelle du projet.

## Installation sous Windows avec Git Bash

Prérequis : Python 3.10 ou plus récent, Git, un PDF contenant du texte
sélectionnable et, pour la génération, une clé API OpenAI avec accès à
`gpt-4.1-mini`. Un appel réel utilise le quota de votre compte API.

Depuis la racine du dépôt dans le terminal Git Bash de VS Code :

```bash
python --version
python -m venv .venv
source .venv/Scripts/activate
python -m pip install -r prototype-experimental/requirements.txt
```

Si Windows reconnaît `py` mais pas `python`, utiliser `py -3 -m venv .venv`
pour créer l'environnement, puis l'activer comme ci-dessus.

Copier le fichier de configuration (une seule fois) :

```bash
cp -n prototype-experimental/.env.example prototype-experimental/.env
```

Dans VS Code, ouvrir `prototype-experimental/.env` et renseigner la valeur
de `OPENAI_API_KEY`. Ne pas ajouter de guillemets autour du nom de la variable.
Le fichier `.env` est ignoré par Git. Une variable `OPENAI_API_KEY` déjà définie
dans le terminal est prioritaire sur le fichier. Ne jamais partager la clé.

## Utilisation

Placer un document dans `prototype-experimental/samples/cours.pdf`, puis lancer :

```bash
python prototype-experimental/main.py prototype-experimental/samples/cours.pdf
```

Un PDF situé ailleurs fonctionne aussi, avec des guillemets si le chemin
contient des espaces :

```bash
python prototype-experimental/main.py "C:/Users/mateo/Documents/Mon cours.pdf"
```

Sans argument, le programme demande le chemin dans le terminal :

```bash
python prototype-experimental/main.py
```

Pour lire le PDF sans clé, sans Internet et sans appel API :

```bash
python prototype-experimental/main.py prototype-experimental/samples/cours.pdf --extract-only
```

L'aide est disponible avec `python prototype-experimental/main.py --help`.
Les chemins relatifs des PDF sont résolus depuis le dossier du terminal.
Le `.env` est toujours recherché à côté de `main.py`.

## Fonctionnement à expliquer

1. `extract_text` vérifie le fichier et utilise `pypdf.PdfReader` pour lire chaque
   page avec `extract_text()`, puis rassemble les textes.
2. `generate_quiz` construit les consignes et transmet le texte extrait à
   l'API OpenAI Responses. Aucune recherche web n'est utilisée.
3. Les classes Pydantic `Question` et `Quiz` décrivent la sortie JSON. Le SDK
   `responses.parse` transmet ce schéma et valide la réponse reçue.
4. Le script exige 5 questions, 4 choix distincts par question, des textes non
   vides et un entier `correct_answer` entre 0 et 3 (0=A, 1=B, 2=C, 3=D).
5. `display_quiz` affiche le quiz et son corrigé. Ce prototype ne collecte pas
   les réponses de l'élève et ne calcule pas de score.

Une liste vide est autorisée dans le schéma pour que l'IA puisse signaler un
document insuffisant ; le programme la traite comme une erreur explicite.

Le prompt impose de s'appuyer uniquement sur le document et de citer un court
extrait dans chaque explication. Le schéma vérifie la structure, pas la vérité
des réponses : la fidélité au cours reste à évaluer manuellement.

Références : [sorties structurées OpenAI](https://developers.openai.com/api/docs/guides/structured-outputs)
et [modèle GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini).

## Exemple de sortie

Exemple illustratif, si le cours dit que l'évaporation transforme l'eau liquide
en vapeur. Les 4 questions suivantes sont omises ici :

```text
Texte extrait : 2540 caracteres.
Preparation du quiz...

=== Quiz genere par IA : a verifier avec le document ===

Question 1 : Quel changement correspond a l'evaporation ?
  A. Liquide vers vapeur
  B. Vapeur vers liquide
  C. Liquide vers solide
  D. Solide vers liquide
Bonne reponse : A. Liquide vers vapeur
Explication : Le cours indique : "L'evaporation transforme l'eau liquide en vapeur."
```

## Limites et erreurs

- Un PDF scanné nécessite un OCR, non inclus. Les pages sans texte sont signalées
  et leurs images ne sont pas envoyées à l'IA.
- Les PDF protégés par mot de passe ou illisibles sont refusés.
- La génération accepte au maximum 60 000 caractères extraits. Au-delà, le
  script refuse l'envoi et demande un PDF plus court ; il ne tronque pas le cours.
- Le texte extrait est envoyé à OpenAI lors d'une génération. Utiliser des
  documents de test autorisés, sans données personnelles d'élèves.
- Une clé absente, un échec API ou une sortie invalide produisent une erreur
  lisible et un code de sortie 1. Ctrl+C annule avec le code 130.
- Le délai réseau est de 60 secondes, sans nouvelle tentative automatique.
- Le modèle peut encore inventer ou mal interpréter des informations, même
  lorsque le JSON est valide. Les citations ne sont pas vérifiées automatiquement.

## Vérifications

Depuis la racine, avec l'environnement activé :

```bash
python -m unittest discover -s prototype-experimental/tests -v
git check-ignore prototype-experimental/.env
```

Les tests fabriquent leurs PDF temporaires et simulent les réponses HTTP de
l'API avec le vrai SDK. Ils n'utilisent aucune clé réelle et aucun réseau.
Ils ne prouvent pas la qualité pédagogique du modèle.

Pour valider l'expérience, essayer trois cours différents avec une vraie clé.
Pour chacun, vérifier les 5 questions, l'unicité de la bonne réponse et les
extraits cités. Noter les réussites et erreurs dans le compte rendu du groupe.

## Git

Organisation : `main` pour les versions stables, `develop` pour l'intégration,
`feature/experimental-ai-quiz` pour cette expérience.

Après vérification locale, publier les branches depuis Git Bash :

```bash
git push -u origin develop
git push -u origin feature/experimental-ai-quiz
```

Créer ensuite une Pull Request de `feature/experimental-ai-quiz` vers `develop`
et la faire relire par le groupe. La fusion vers `main` vient après validation.
