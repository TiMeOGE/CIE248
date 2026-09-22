# CIE248 : Quiz IA

Projet du Module 248. Une plateforme web qui transforme un texte de cours en
quiz à choix multiples grâce à l'IA : l'élève répond, puis obtient son score
et un corrigé.

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
| `tests/` | Tests automatiques (`node --test`) |
| `prototype.html` | Maquette d'origine, **à ne pas modifier**. Visible sur https://timeoge.github.io/CIE248/prototype.html |

### Voir l'interface (en attendant le serveur)

```bash
python -m http.server 8080 --directory public
```

Puis ouvrir http://localhost:8080. Le quiz de démonstration fonctionne ; la
génération IA affichera « indisponible » tant que le serveur (étape 2) n'existe pas.

Lancer les tests : `node --test` (Node.js 24).

L'installation et le lancement complets du site seront décrits ici à l'étape 2.

## Prototype expérimental Python

L'expérience PDF vers quiz OpenAI fonctionne dans le terminal, indépendamment
du projet web. Son [README](prototype-experimental/README.md) explique
l'installation sous Windows avec Git Bash, la configuration et les tests.

Cette expérience utilise `feature/experimental-ai-quiz`, avec une Pull Request
vers `develop` pour intégration avant une éventuelle validation vers `main`.

## Sécurité

Ne jamais mettre de clé API dans le code, dans Git, dans un chat IA ou sur
Discord. Le repository est **public**.
