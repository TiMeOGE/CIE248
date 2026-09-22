# Plan du projet Quiz IA (CIE 248)

> Document de référence de l'équipe. Il est mis à jour à chaque étape.
> Légende : `[ ]` à faire · `[x]` fait · ⚠️ à vérifier

## 1. Le produit

Un enseignant ou un élève colle un texte de cours. Le serveur demande à une IA
un quiz à choix multiples en JSON, le vérifie, puis l'élève joue et obtient son
score avec un corrigé (explication + extrait du cours). Chaque contenu généré
par l'IA est signalé comme « à vérifier ».

**Boucle à démontrer :**
texte collé → paramètres → génération IA → validation → quiz → score + corrigé

## 2. Décisions prises (22.09.2026)

| Sujet | Décision |
|---|---|
| Qui code | Claude code, l'équipe relit et teste chaque étape avant fusion |
| Serveur | ~~Node.js 24 + Express 5~~ → **Python + FastAPI** (`backend/`), repris du prototype expérimental (PR n°4) |
| Interface | HTML + CSS + JavaScript natif, sans framework ni étape de build, **servie par le backend** |
| Fournisseur IA | ~~OpenRouter seul~~ → tout fournisseur compatible OpenAI (`chat/completions`) : **NVIDIA**, OpenRouter ou OpenAI, choisi dans `backend/.env` |
| Prototype | `prototype.html` reste **intact** à la racine : c'est la référence visuelle |
| GitHub Pages | Reste actif et continue d'afficher `prototype.html` (maquette statique) |
| Hébergement réel | Raspberry Pi 5, accessible **publiquement sur Internet** |
| Format du quiz | Voir section 4 (**sans** extrait du cours pour l'instant : l'explication suffit) |
| Import du cours | PDF **et/ou** texte collé |

## 3. Architecture

```
Navigateur ──GET /──────────────────▶ Backend FastAPI (Raspberry Pi) : sert public/
Navigateur ──POST /api/quiz/generate─▶ Backend FastAPI
             (PDF et/ou texte)           1. vérifie le PDF, extrait son texte, ajoute le texte collé
                                         2. envoie prompt + format JSON au fournisseur IA
                                            (clé lue dans backend/.env, jamais envoyée au navigateur)
                                         3. valide les questions reçues (Pydantic)
Navigateur ◀──quiz ou erreur claire─────┘
    4. l'élève répond, le score est calculé dans le navigateur
```

## 4. Contrats

Le contrat détaillé (codes d'erreur compris) est dans
[`backend/README.md`](../backend/README.md#contrat-http). En résumé :

**État du serveur** `GET /api/status` : l'interface affiche un bandeau si l'IA n'est pas configurée.

```json
{ "aiConfigured": true }
```

**Requête** `POST /api/quiz/generate`, formulaire `multipart/form-data` :

- `file` : PDF avec du texte sélectionnable, 5 Mio maximum (facultatif si `text` est fourni)
- `text` : texte collé (facultatif si `file` est fourni) ; avec les deux, le texte est ajouté après celui du PDF
- le cours complet doit faire entre 200 et 60 000 caractères
- `question_count` : 1 à 10 (l'interface propose 5 ou 10)
- `level` : `primaire`, `cycle`, `9e`, `10e` ou `11e` (l'interface propose primaire et cycle)

**Réponse OK (200)**

```json
{
  "questions": [
    {
      "question": "Que se passe-t-il pendant la condensation ?",
      "choices": ["…", "…", "…", "…"],
      "correct_answer": 2,
      "explanation": "…"
    }
  ]
}
```

L'interface convertit ce format (`correct_answer` → `correctIndex`) dans
`public/js/quiz-logic.js` (`fromServerQuiz`). Le titre du quiz vient du nom du PDF.

**Réponse en erreur**

```json
{ "error": { "code": "AI_TIMEOUT", "message": "Message technique." } }
```

L'interface remplace ce message par un texte adapté aux élèves (`public/js/api.js`).

## 5. Structure prévue

> Structure d'origine, remplacée : le serveur est `backend/` (Python), voir son README.

```
prototype.html            maquette d'origine (NE PAS MODIFIER)
README.md  AGENTS.md  CLAUDE.md  .gitignore  .gitattributes  .env.example  package.json
docs/      PLAN.md  DESIGN.md  ARCHITECTURE.md  DECISIONS.md  DEPLOIEMENT-PI.md  DEMO.md
public/    index.html  css/styles.css  js/{app.js, api.js, quiz-logic.js, demo-quiz.js}
server/    index.js  app.js  config.js  errors.js  rate-limit.js
           ai/{generate-quiz.js, ai-client.js, prompt.js}
           quiz/{quiz-schema.js, validate-quiz.js}
tests/     fixtures/  *.test.js
```

## 6. Priorités

- **MUST (démo)** : texte collé · 5 ou 10 questions · niveau Primaire / CO ·
  génération IA + validation serveur · toutes les erreurs de la section 4 ·
  quiz, score, corrigé · mode démo hors ligne · limitation des générations
  (site public) · tests des parcours critiques · README, `.env.example`
- **SHOULD** : difficulté · import `.txt` · import PDF texte (dans le navigateur) ·
  vérification que `sourceQuote` existe dans le cours · 1 relance automatique
  si la réponse IA est invalide · CI GitHub Actions
- **NICE** : Vrai/Faux · historique local · import `.docx`
- **HORS PROTOTYPE** : comptes, base de données, classes, OCR,
  questions ouvertes corrigées par IA

## 7. Étapes

Chaque étape = une branche + une Pull Request relue par l'équipe.
Le nom de la branche est indiqué après « · ». Les branches existent déjà sur
GitHub : faire `git merge main` dedans avant de commencer (voir le README).

### Semaine 2 (22.09) : mise en place
- [x] Étape 0 : ce plan (PR #1, fusionnée)
- [ ] Étape 1 · `chore/mise-en-place` : `.gitignore`, `.gitattributes`, `.env.example`, README v1, `AGENTS.md`, `CLAUDE.md`
- [ ] Étape 2 · `feat/squelette-serveur` : squelette Express : `/api/status`, `/api/generate` en mode factice (`AI_PROVIDER=mock`), `npm run dev`, `npm test`
- [x] Étape 3 · `feat/interface` : interface dans `public/`, inspirée de `prototype.html` (accueil, quiz, résultat, mode démo). Design system et règles de rédaction : `docs/DESIGN.md`
- [ ] Étape 4 · `feat/test-openrouter` : premier appel réel à OpenRouter (script de test) pour choisir le modèle ⚠️ support du schéma JSON à vérifier
- **Jalon** : chacun lance le site en local et `npm test` passe

### Semaine 3 (29.09) : vraie génération IA · `feat/generation-ia`
- [ ] Prompt + schéma JSON + `validate-quiz.js`
- [ ] Gestion de toutes les erreurs (timeout, quota, JSON invalide, vide…)
- [ ] Tests avec réponses IA simulées (valides et invalides)
- [ ] Interface branchée : chargement, erreurs, avertissements
- [ ] Limitation des générations par visiteur · `feat/limitation-requetes`
- **Jalon** : boucle complète avec la vraie IA sur 3 cours tests

### Semaine 4 (06.10) : déploiement et finitions · `chore/deploiement-pi`
- [ ] Installation sur le Raspberry Pi 5 (Node 24, service `systemd`, `.env` créé à la main)
- [ ] Accès public via tunnel ⚠️ Tailscale Funnel ou Cloudflare Tunnel, à tester
- [ ] Fonctionnalités SHOULD selon le temps restant
- [ ] Passe accessibilité et UX
- **Jalon** : le site marche depuis un téléphone en 4G. **Gel des fonctionnalités.**

### Semaine 5 (13.10) : stabilisation, aucune nouvelle fonctionnalité · `chore/stabilisation-demo`
- [ ] Correction des bugs, `npm audit`, relecture complète
- [ ] Scénario de démo répété 3 fois + plan B (`docs/DEMO.md`)
- [ ] Vidéo de secours de la boucle complète
- [ ] Version `v1.0-demo` taguée et installée sur le Pi
- [ ] Documentation finale (README, ARCHITECTURE, DEPLOIEMENT-PI)

### Examen
- [ ] Démo + oral : chaque membre sait expliquer la boucle complète

## 8. Règles de sécurité

- La clé OpenRouter est **uniquement** dans `.env` (PC de développement et Pi).
  Jamais dans Git, le code du navigateur, un chat IA ou Discord.
- Le repo est **public** : une clé poussée par erreur est volée en quelques
  minutes. Il faut alors la révoquer immédiatement sur OpenRouter.
- ⚠️ Fixer une **limite de dépense** sur la clé OpenRouter : le site est public.
- Aucun compte, aucune base de données, aucun stockage des cours envoyés. On
  ne journalise pas le contenu, seulement sa longueur et les codes d'erreur.
- Tout texte venant de l'IA est affiché avec `textContent`, jamais `innerHTML`.
- Le Pi n'ouvre **aucun port** sur la box : l'accès public passe par un tunnel.
- ⚠️ Vérifier dans les paramètres OpenRouter la politique des modèles choisis
  sur l'usage des données.

## 9. Plan B pour la démo

1. Génération en direct avec un cours déjà testé
2. Si l'IA échoue : le message d'erreur s'affiche proprement, puis on lance le mode démo
3. Sans Internet : le site tourne en local avec `AI_PROVIDER=mock`
4. En dernier recours : la vidéo enregistrée en semaine 5

## 10. À faire par l'équipe (hors code)

- [ ] Ajouter les 2 coéquipiers comme collaborateurs du repo (Settings → Collaborators)
- [ ] Protéger `main` : Pull Request obligatoire + 1 validation (Settings → Rules)
- [ ] Timéo : retirer `credential.helper=store` (token stocké en clair) et configurer l'identité Git
- [ ] Créer la clé OpenRouter (membre majeur) avec une limite de dépense, et la garder hors du chat
- [ ] Préparer 3 cours tests (matières et niveaux différents)
- [ ] Rapport et pitch : prévoir du temps chaque semaine
