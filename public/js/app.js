// Interface de Quiz IA : gère les 3 écrans Créer → Quiz → Résultat.
//
// Organisation du fichier :
//   1. État de l'application
//   2. Petits outils (création d'éléments, annonces pour lecteurs d'écran)
//   3. Navigation entre les écrans
//   4. Écran 1 : Créer (PDF et/ou texte, réglages, génération, démo)
//   5. Écran 2 : Quiz
//   6. Écran 3 : Résultat et corrigé
//   7. Aide et démarrage
//
// Sécurité : tout texte venant de l'IA est inséré avec textContent, jamais innerHTML.
// Un texte piégé ne peut donc pas injecter de code dans la page.

import { DEMO_COURSE, DEMO_QUIZ } from './demo-quiz.js';
import { ApiError, fetchStatus, requestQuiz } from './api.js';
import {
  TEXT_MAX_CHARS,
  checkCourseInput,
  computeScore,
  countAnswered,
  firstUnanswered,
  formatDuration,
  formatNumber,
  prepareQuiz,
  resultMessage,
  titleFromFileName,
} from './quiz-logic.js';

const $ = (id) => document.getElementById(id);

const LEVEL_LABELS = { primaire: 'École primaire', cycle: "Cycle d'orientation" };
const LETTERS = ['A', 'B', 'C', 'D'];
const RING_LENGTH = 2 * Math.PI * 54; // circonférence de l'anneau de score (rayon 54 dans le SVG)
const SLOW_GENERATION_SECONDS = 40;

/* 1. État de l'application ------------------------------------ */
// Une seule source de vérité : l'affichage est toujours recalculé à partir de cet objet.
const state = {
  generation: null, // pendant une génération : { controller, startedAt, timer }
  quiz: null, // quiz en cours : { title, questions }
  origin: 'demo', // 'ai' (généré par l'IA) ou 'demo' (préparé à l'avance)
  level: 'primaire',
  warnings: [],
  answers: [], // pour chaque question : index du choix de l'élève, ou null
  current: 0, // index de la question affichée
  startedAt: 0,
  reviewFilter: 'all', // corrigé : 'all' (toutes) ou 'wrong' (à revoir)
};

/* 2. Petits outils -------------------------------------------- */
function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
}

/** Fait lire un message par les lecteurs d'écran, sans rien afficher. */
function announce(message) {
  const region = $('live-status');
  region.textContent = '';
  setTimeout(() => {
    region.textContent = message;
  }, 50);
}

/* 3. Navigation entre les écrans ------------------------------ */
function showScreen(name, focusId) {
  for (const screen of ['home', 'quiz', 'results']) {
    $(`screen-${screen}`).hidden = screen !== name;
  }
  window.scrollTo(0, 0);
  // Placer le focus sur le titre annonce le nouvel écran aux lecteurs d'écran.
  $(focusId).focus();
}

function goHome() {
  showScreen('home', 'home-title');
}

/* 4. Écran 1 : Créer ------------------------------------------ */
const courseText = $('course-text');
const courseFile = $('course-file');

function updateCounter() {
  const length = courseText.value.trim().length;
  $('course-count').textContent = `${formatNumber(length)} / ${formatNumber(TEXT_MAX_CHARS)}`;
  $('course-count').classList.toggle('is-over', length > TEXT_MAX_CHARS);
}

/** Affiche une erreur sous le champ concerné : 'file' (PDF) ou 'text' (texte collé). */
function showFieldError(field, message) {
  const [input, prefix] = field === 'file' ? [courseFile, 'file'] : [courseText, 'course'];
  $(`${prefix}-error-text`).textContent = message;
  $(`${prefix}-error`).hidden = false;
  input.setAttribute('aria-invalid', 'true');
  input.focus();
}

function clearFieldError() {
  for (const [input, prefix] of [[courseText, 'course'], [courseFile, 'file']]) {
    $(`${prefix}-error`).hidden = true;
    input.removeAttribute('aria-invalid');
  }
}

function selectedFile() {
  return courseFile.files[0] ?? null;
}

function updateFileUi() {
  const file = selectedFile();
  $('file-clear').hidden = !file;
  $('text-optional').hidden = !file;
  courseFile.closest('.file-picker').classList.toggle('has-file', Boolean(file));
}

function clearFile() {
  courseFile.value = '';
  updateFileUi();
  clearFieldError();
  courseFile.focus();
}

function selectedCount() {
  return Number(document.querySelector('input[name="count"]:checked').value);
}

function fillExample() {
  const current = courseText.value.trim();
  if (current && current !== DEMO_COURSE && !confirm("Remplacer ton texte par le cours d'exemple ?")) return;
  courseText.value = DEMO_COURSE;
  updateCounter();
  clearFieldError();
  courseText.focus();
  courseText.setSelectionRange(0, 0);
  courseText.scrollTop = 0;
}

async function handleGenerate(event) {
  event.preventDefault();
  if (state.generation) return;
  hideGenerateError();

  const file = selectedFile();
  const check = checkCourseInput(courseText.value, file);
  if (!check.ok) {
    showFieldError(check.field, check.message);
    return;
  }
  clearFieldError();

  const count = selectedCount();
  const level = $('level').value;
  const title = file ? titleFromFileName(file.name) : '';
  startGenerationUi(count);
  try {
    const { quiz, warnings } = await requestQuiz(
      { text: courseText.value.trim(), file, count, level, title },
      state.generation.controller.signal,
    );
    stopGenerationUi();
    startQuiz(quiz, { origin: 'ai', level, warnings });
  } catch (error) {
    stopGenerationUi();
    if (error instanceof ApiError && error.code === 'CANCELLED') {
      announce('Génération annulée.');
      $('generate-btn').focus();
      return;
    }
    if (!(error instanceof ApiError)) console.error(error);
    showGenerateError(error instanceof ApiError ? error.message : 'Une erreur inattendue est survenue. Réessaie.');
  }
}

function startGenerationUi(count) {
  state.generation = { controller: new AbortController(), startedAt: Date.now(), timer: 0 };
  $('create-fields').disabled = true;
  $('generate-btn').setAttribute('aria-busy', 'true');
  $('generate-icon').toggleAttribute('hidden', true);
  $('generate-spinner').hidden = false;
  $('generate-label').textContent = 'Génération en cours…';
  $('generation-text').textContent = `L'IA lit ton cours et prépare ${count} questions…`;
  $('generation-hint').textContent = "En général moins d'une minute.";
  $('generation-time').textContent = '0 s';
  $('generation-panel').hidden = false;
  state.generation.timer = setInterval(updateGenerationTime, 1000);
  announce(`Génération en cours. L'IA prépare ${count} questions.`);
  $('cancel-btn').focus();
}

function updateGenerationTime() {
  const seconds = Math.round((Date.now() - state.generation.startedAt) / 1000);
  $('generation-time').textContent = `${seconds} s`;
  if (seconds === SLOW_GENERATION_SECONDS) {
    $('generation-hint').textContent = "C'est plus long que d'habitude. Tu peux patienter encore un peu, ou annuler.";
  }
}

function stopGenerationUi() {
  clearInterval(state.generation.timer);
  state.generation = null;
  $('create-fields').disabled = false;
  $('generate-btn').removeAttribute('aria-busy');
  $('generate-icon').toggleAttribute('hidden', false);
  $('generate-spinner').hidden = true;
  $('generate-label').textContent = 'Générer le quiz';
  $('generation-panel').hidden = true;
}

function showGenerateError(message) {
  $('generate-error-text').textContent = message;
  $('generate-error').hidden = false;
  $('generate-error').focus();
}

function hideGenerateError() {
  $('generate-error').hidden = true;
}

function startDemo() {
  hideGenerateError();
  const questions = DEMO_QUIZ.questions.slice(0, selectedCount());
  startQuiz({ title: DEMO_QUIZ.title, questions }, { origin: 'demo', level: $('level').value, warnings: [] });
}

/** Affiche un bandeau si le serveur ou l'IA ne sont pas disponibles. */
async function checkServer() {
  const status = await fetchStatus();
  if (status.reachable && status.aiConfigured) {
    $('status-banner').hidden = true;
    return;
  }
  $('status-title').textContent = status.reachable
    ? "La génération IA n'est pas encore configurée."
    : 'La génération IA est indisponible pour le moment.';
  $('status-text').textContent = status.reachable
    ? "Le serveur fonctionne, mais aucune clé d'IA n'y est installée. Tu peux jouer au quiz de démonstration."
    : 'Le serveur ne répond pas. Tu peux jouer au quiz de démonstration en attendant.';
  $('status-banner').hidden = false;
}

/* 5. Écran 2 : Quiz ------------------------------------------- */
function startQuiz(quiz, { origin, level, warnings }) {
  state.quiz = prepareQuiz(quiz); // mélange les choix de chaque question
  state.origin = origin;
  state.level = level;
  state.warnings = warnings;
  state.answers = Array(state.quiz.questions.length).fill(null);
  state.current = 0;
  state.startedAt = Date.now();

  const total = state.quiz.questions.length;
  $('quiz-origin').textContent = origin === 'ai' ? 'Quiz généré par IA' : 'Quiz de démonstration';
  $('quiz-title').textContent = state.quiz.title.trim() || 'Ton quiz';
  $('quiz-meta').textContent =
    origin === 'ai'
      ? `${total} questions · ${LEVEL_LABELS[level] ?? ''}`
      : `${total} questions · Préparé à l'avance, sans IA`;

  $('quiz-warnings-text').replaceChildren(...warnings.map((warning) => element('p', '', warning)));
  $('quiz-warnings').hidden = warnings.length === 0;

  renderQuestion({ focus: false });
  showScreen('quiz', 'quiz-title');
}

function renderQuestion({ focus = true } = {}) {
  const question = state.quiz.questions[state.current];
  $('question-text').textContent = question.question;
  $('choice-list').replaceChildren(...question.choices.map(renderChoice));
  updateQuizProgress();
  if (focus) $('question-text').focus();
}

function renderChoice(text, index) {
  const label = element('label', 'choice');
  const input = element('input', 'choice__input');
  input.type = 'radio';
  input.name = 'answer';
  input.value = String(index);
  input.checked = state.answers[state.current] === index;
  input.addEventListener('change', () => {
    state.answers[state.current] = index;
    updateQuizProgress();
  });

  const box = element('span', 'choice__box');
  const letter = element('span', 'choice__letter', LETTERS[index]);
  letter.setAttribute('aria-hidden', 'true');
  box.append(letter, element('span', 'choice__text', text));
  label.append(input, box);
  return label;
}

function updateQuizProgress() {
  const total = state.quiz.questions.length;
  const answered = countAnswered(state.answers);
  const isLast = state.current === total - 1;

  $('question-count').textContent = `Question ${state.current + 1} sur ${total}`;
  $('answered-count').textContent = `Répondues : ${answered} sur ${total}`;
  $('progress-fill').style.width = `${(answered / total) * 100}%`;
  $('progress').setAttribute('aria-valuemax', String(total));
  $('progress').setAttribute('aria-valuenow', String(answered));
  $('progress').setAttribute('aria-valuetext', `${answered} questions répondues sur ${total}`);

  $('prev-btn').disabled = state.current === 0;
  $('next-btn').disabled = state.answers[state.current] === null;
  if (!isLast) {
    $('next-label').textContent = 'Suivante';
  } else {
    $('next-label').textContent = answered === total ? 'Voir mon résultat' : 'Aller aux questions restantes';
  }
  renderDots();
}

function renderDots() {
  const buttons = state.quiz.questions.map((_, index) => {
    const answered = state.answers[index] !== null;
    const button = element('button', answered ? 'dots__btn is-answered' : 'dots__btn', String(index + 1));
    button.type = 'button';
    button.setAttribute('aria-label', `Question ${index + 1}, ${answered ? 'répondue' : 'sans réponse'}`);
    if (index === state.current) button.setAttribute('aria-current', 'step');
    button.addEventListener('click', () => goToQuestion(index));
    return button;
  });
  $('dots').replaceChildren(...buttons);
}

function goToQuestion(index) {
  state.current = index;
  renderQuestion();
}

function handleNext() {
  if (state.answers[state.current] === null) return;
  if (state.current < state.quiz.questions.length - 1) {
    goToQuestion(state.current + 1);
    return;
  }
  const missing = firstUnanswered(state.answers);
  if (missing !== -1) {
    goToQuestion(missing);
    return;
  }
  finishQuiz();
}

function quitQuiz() {
  if (countAnswered(state.answers) > 0 && !confirm('Quitter le quiz ? Tes réponses seront perdues.')) return;
  goHome();
}

/* 6. Écran 3 : Résultat et corrigé ---------------------------- */
function finishQuiz() {
  const elapsedMs = Date.now() - state.startedAt;
  const { correct, total, percent } = computeScore(state.quiz.questions, state.answers);
  const message = resultMessage(percent);

  $('results-title').textContent = message.title;
  $('results-meta').textContent = `${$('quiz-title').textContent} · ${$('quiz-origin').textContent}`;
  $('score-fraction').textContent = `${correct}/${total}`;
  $('score-text').textContent = message.text;
  $('score-percent').textContent = `${percent} %`;
  $('score-time').textContent = formatDuration(elapsedMs);
  $('review-disclaimer').textContent =
    state.origin === 'ai'
      ? 'Ce quiz a été créé par une IA à partir de ton texte. Il peut contenir des erreurs : en cas de doute, vérifie dans ton cours ou demande à ton enseignant·e.'
      : "Quiz de démonstration préparé à l'avance, sans IA. Le score sert seulement à t'entraîner.";

  state.reviewFilter = 'all';
  renderReview();
  showScreen('results', 'results-title');
  animateScoreRing(correct / total);
}

function animateScoreRing(ratio) {
  const arc = $('score-arc');
  arc.style.strokeDasharray = String(RING_LENGTH);
  arc.style.strokeDashoffset = String(RING_LENGTH);
  arc.getBoundingClientRect(); // force le navigateur à appliquer l'état « vide » avant l'animation
  arc.style.strokeDashoffset = String(RING_LENGTH * (1 - ratio));
}

function setReviewFilter(filter) {
  state.reviewFilter = filter;
  renderReview();
}

function renderReview() {
  const questions = state.quiz.questions;
  const wrongCount = questions.filter((question, i) => state.answers[i] !== question.correctIndex).length;
  $('filter-all').textContent = `Toutes (${questions.length})`;
  $('filter-wrong').textContent = `À revoir (${wrongCount})`;
  $('filter-all').setAttribute('aria-pressed', String(state.reviewFilter === 'all'));
  $('filter-wrong').setAttribute('aria-pressed', String(state.reviewFilter === 'wrong'));

  const items = [];
  questions.forEach((question, index) => {
    const isGood = state.answers[index] === question.correctIndex;
    if (state.reviewFilter === 'wrong' && isGood) return;
    items.push(renderReviewItem(question, index, isGood));
  });
  if (items.length === 0) {
    items.push(element('p', 'empty-state', 'Aucune question à revoir : toutes tes réponses sont justes !'));
  }
  $('review-list').replaceChildren(...items);
}

function renderReviewItem(question, index, isGood) {
  const details = element('details', 'review-item');
  details.open = !isGood; // les erreurs sont dépliées d'office

  const summary = element('summary', 'review-item__summary');
  const badge = element('span', `review-item__icon ${isGood ? 'is-good' : 'is-bad'}`);
  badge.append(icon(isGood ? 'check' : 'x'));
  const chevron = icon('chevron');
  chevron.classList.add('review-item__chevron');
  summary.append(
    badge,
    element('span', 'review-item__title', `${index + 1}. ${question.question}`),
    element('span', 'review-item__status', isGood ? 'Juste' : 'À revoir'),
    chevron,
  );

  const content = element('div', 'review-item__content');
  content.append(answerLine(`Ta réponse : ${question.choices[state.answers[index]]}`, isGood));
  if (!isGood) {
    content.append(answerLine(`Bonne réponse : ${question.choices[question.correctIndex]}`, true));
  }
  if (question.explanation.trim()) {
    content.append(element('p', '', question.explanation));
  }
  if (question.sourceQuote.trim()) {
    const quote = element('blockquote', 'source-quote');
    quote.append(element('span', 'source-quote__label', 'Extrait du cours'), document.createTextNode(question.sourceQuote));
    content.append(quote);
  }

  details.append(summary, content);
  return details;
}

function answerLine(text, isGood) {
  const line = element('p', `answer-line ${isGood ? 'is-good' : 'is-bad'}`);
  line.append(icon(isGood ? 'check' : 'x'), element('span', '', text));
  return line;
}

/* 7. Aide et démarrage ---------------------------------------- */
function setupHelpDialog() {
  const dialog = $('help-dialog');
  $('help-open').addEventListener('click', () => dialog.showModal());
  $('help-close').addEventListener('click', () => dialog.close());
  $('help-done').addEventListener('click', () => dialog.close());
  // Un clic en dehors de la fenêtre (sur le fond grisé) la ferme.
  dialog.addEventListener('click', (event) => {
    const box = dialog.getBoundingClientRect();
    const outside =
      event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
    if (event.target === dialog && outside) dialog.close();
  });
}

function init() {
  // Écran 1
  $('create-form').addEventListener('submit', handleGenerate);
  courseText.addEventListener('input', () => {
    updateCounter();
    clearFieldError();
  });
  courseFile.addEventListener('change', () => {
    updateFileUi();
    clearFieldError();
  });
  $('file-clear').addEventListener('click', clearFile);
  $('example-btn').addEventListener('click', fillExample);
  $('demo-btn').addEventListener('click', startDemo);
  $('error-demo-btn').addEventListener('click', startDemo);
  $('cancel-btn').addEventListener('click', () => state.generation?.controller.abort());

  // Écran 2
  $('prev-btn').addEventListener('click', () => goToQuestion(state.current - 1));
  $('next-btn').addEventListener('click', handleNext);
  $('quit-btn').addEventListener('click', quitQuiz);

  // Écran 3
  $('retry-btn').addEventListener('click', () =>
    startQuiz(state.quiz, { origin: state.origin, level: state.level, warnings: state.warnings }),
  );
  $('new-btn').addEventListener('click', goHome);
  $('filter-all').addEventListener('click', () => setReviewFilter('all'));
  $('filter-wrong').addEventListener('click', () => setReviewFilter('wrong'));

  // Logo : retour à l'accueil sans recharger la page (et sans perdre un quiz par erreur)
  document.querySelector('.brand').addEventListener('click', (event) => {
    event.preventDefault();
    if (!$('screen-quiz').hidden) quitQuiz();
    else goHome();
  });

  setupHelpDialog();
  updateCounter();
  updateFileUi(); // le navigateur peut garder le PDF choisi après un rechargement
  checkServer();
}

init();
