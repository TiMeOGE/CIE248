# Design system et rédaction : Quiz IA

> Référence pour toute modification de l'interface (`public/`).
> Les valeurs vivent dans `public/css/styles.css`, section 1 « Design tokens ».
> Règle : on utilise les variables (`var(--color-primary)`), jamais une couleur ou une taille en dur.

## 1. Principes

1. **Clair avant tout** : le public va de l'élève de primaire à l'enseignant. Une action principale par écran.
2. **Accessible (WCAG AA)** : contraste ≥ 4,5:1 pour le texte, cadre de focus visible, zones cliquables ≥ 44 px, texte ≥ 14 px (16 px pour le texte courant).
3. **Honnête sur l'IA** : un quiz généré est toujours signalé comme tel, avec l'extrait du cours pour vérifier.
4. **Sobre et rapide** : polices du système (aucune requête vers Google Fonts, fonctionne hors ligne), icônes SVG (jamais d'emoji comme icône), pas de bibliothèque.
5. **Clair et sombre** : le thème suit automatiquement le réglage de l'appareil.

## 2. Design tokens

### Couleurs

| Token | Clair | Sombre | Usage |
|---|---|---|---|
| `--color-bg` | `#f7f8fc` | `#11121c` | Fond de page |
| `--color-surface` | `#ffffff` | `#1a1c2b` | Cartes, champs |
| `--color-surface-muted` | `#f3f4f9` | `#232638` | Survol, fonds discrets |
| `--color-border` | `#e2e4ee` | `#2e3148` | Bordures décoratives |
| `--color-border-input` | `#8a8ea7` | `#6b7090` | Contour des champs et choix (≥ 3:1) |
| `--color-text` | `#20233e` | `#eceefb` | Texte principal |
| `--color-text-muted` | `#5d6178` | `#a9adc8` | Texte secondaire |
| `--color-primary` | `#5956dc` | `#908dff` | Actions, éléments actifs |
| `--color-primary-soft` | `#eeedff` | `#2a2a52` | Fond d'un élément sélectionné |
| `--color-on-primary` | `#ffffff` | `#11121c` | Texte sur fond primaire |
| `--color-success` / `-soft` | `#147a64` / `#e6f6ef` | `#4fd1a5` / `#173a31` | Bonne réponse |
| `--color-warning` / `-soft` | `#975418` / `#fff4e6` | `#f2b66d` / `#3d2e1a` | Avertissement |
| `--color-danger` / `-soft` | `#b3373e` / `#fdeeee` | `#ff8b91` / `#3f1f24` | Erreur, mauvaise réponse |
| `--color-focus` | `#7b78f5` | `#b4b2ff` | Cadre de focus clavier |

**Contrastes mesurés dans le navigateur (22.09.2026)** :

| Paire | Clair | Sombre |
|---|---|---|
| Bouton principal (texte / fond) | 5,54:1 | 6,60:1 |
| Texte secondaire sur carte | 6,09:1 | 7,63:1 |
| Lien « ghost » sur carte | 5,54:1 | 5,98:1 |
| Titre d'avertissement sur bandeau | 5,38:1 | 7,29:1 |
| Contour des champs sur carte | 3,23:1 | 3,49:1 |

La couleur n'est **jamais** le seul indicateur : bonne ou mauvaise réponse = icône ✓/✗ + texte (« Juste », « À revoir », « Bonne réponse : … »).

### Typographie, espacements, formes

| Famille | Tokens |
|---|---|
| Police | `--font-sans` : police du système (Segoe UI, San Francisco, Roboto…) |
| Tailles | `--text-sm` 14 px · `--text-base` 16 px · `--text-lg` 18 px · `--text-xl` 22 px · `--text-2xl` 28 px · `--text-hero` 32 à 46 px |
| Graisses | `--weight-medium` 600 · `--weight-bold` 750 |
| Espacements | `--space-1` à `--space-7` : 4, 8, 12, 16, 24, 32, 48 px |
| Rayons | `--radius-sm` 8 · `-md` 12 · `-lg` 16 · `-xl` 22 px · `-full` |
| Ombres | `--shadow-sm` (boutons) · `-md` (cartes) · `-lg` (fenêtre d'aide) |
| Mouvement | `--duration` 180 ms, `--ease`. Tout est coupé si l'appareil demande moins d'animations. |
| Dimensions | `--control-height` 44 px (zone cliquable minimale) · `--container` 72rem · `--container-narrow` 46rem |

## 3. Composants

| Composant | Classes | Variantes / états | Accessibilité |
|---|---|---|---|
| Bouton | `.btn` | `--primary`, `--secondary`, `--ghost` ; tailles `--sm`, `--lg` ; `--block`, `--icon` ; survol, focus, désactivé, `aria-busy` pendant le chargement | Toujours un texte ou un `aria-label` |
| Carte | `.card`, `.card__head` | | Titre `h2` |
| Champ | `.field`, `.input`, `.textarea`, `.select` | aide, compteur (`.is-over`), erreur (`aria-invalid` + `.field__error`) | `<label for>` ; aide et erreur liées par `aria-describedby` |
| Choix exclusif | `.segmented` | sélectionné, focus | Vrais boutons radio dans un `fieldset` + `legend` |
| Bandeau | `.banner` | `--info`, `--warning`, `--danger` ; actions | `role="status"` (info) ou `role="alert"` (erreur) |
| Pastille | `.pill` | `--primary` | |
| Étapes | `.stepper` | `is-done`, `is-current` | `aria-current="step"` |
| Progression | `.progress` | | `role="progressbar"` + `aria-valuenow/max/text` |
| Choix de réponse | `.choice` | survol, coché, focus | Bouton radio natif (flèches du clavier) |
| Navigation par numéro | `.dots__btn` | `is-answered`, actuelle | `aria-label` « Question 3, répondue » |
| Chargement | `.loading-panel`, `.spinner` | message qui change après 40 s | Annonce vocale via `#live-status` ; focus sur « Annuler » |
| Score | `.score-ring` | animation du cercle | Le SVG est décoratif ; le score est écrit en texte |
| Corrigé | `.review-item` | juste / à revoir (déplié d'office) | `<details>` / `<summary>` natifs |
| Aide | `.dialog` | | `<dialog>` natif : Échap ferme, le focus est piégé |

## 4. Rédaction (UX copy)

**Ton** : on tutoie, on encourage sans en faire trop, on reste concret. Pas de jargon (« JSON », « API », « token »).

**Vocabulaire fixe** (toujours les mêmes mots pour les mêmes choses) :

| On dit | On ne dit pas |
|---|---|
| cours, texte du cours | document, contenu, input |
| générer le quiz | créer, lancer l'IA, soumettre |
| quiz de démonstration | démo, mode hors ligne |
| question, choix, réponse | item, option |
| corrigé | correction, solutions |
| résultat, score | note, évaluation |
| « à revoir » | faux, raté |

**Structures** :

- **Bouton** = un verbe d'action : « Générer le quiz », « Refaire le quiz », « Jouer au quiz de démonstration ».
- **Erreur** = ce qui s'est passé + comment s'en sortir. Ex. : « Ton texte est trop court (25 caractères). Il en faut au moins 200 pour créer de bonnes questions. »
- **Chargement** = ce qui se passe + combien de temps : « L'IA lit ton cours et prépare 5 questions… En général entre 10 et 30 secondes. »
- **État vide** = pourquoi c'est vide + quoi faire : « Aucune question à revoir : toutes tes réponses sont justes ! »
- **Confirmation** = l'action + la conséquence : « Quitter le quiz ? Tes réponses seront perdues. »

**Messages clés** (où les modifier) :

| Situation | Message | Fichier |
|---|---|---|
| Texte vide / trop court / trop long | « Colle d'abord le texte de ton cours. », etc. | `js/quiz-logic.js` |
| Serveur ou IA indisponible | « La génération IA est indisponible pour le moment… » | `js/app.js` |
| Erreurs de génération | Message envoyé par le serveur, sinon message de secours | `js/api.js` |
| Score | « Sans faute, bravo ! », « Bien joué ! », « Tu es sur la bonne voie. », « C'est un début. » | `js/quiz-logic.js` |
| Avertissement IA | « Ce quiz a été créé par une IA… vérifie dans ton cours ou demande à ton enseignant·e. » | `js/app.js` |

**Typographie française** : espace avant `:` `?` `!`, guillemets « », nombres formatés par `formatNumber()` (« 15 000 »).

## 5. Vérifications avant chaque PR d'interface

- [ ] Aucune couleur, taille ou durée en dur hors des tokens
- [ ] Testé en 375 px (mobile) et en ordinateur, sans défilement horizontal
- [ ] Testé en thème clair **et** sombre
- [ ] Tout est utilisable au clavier (Tab, Entrée, Espace, flèches, Échap) avec le focus visible
- [ ] Les textes venant de l'IA passent par `textContent`, jamais `innerHTML`
- [ ] Les nouveaux textes respectent la section 4
