// Tests de la logique du quiz (public/js/quiz-logic.js) et du quiz de démonstration.
// Lancer : node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  HISTORY_MAX,
  PDF_MAX_BYTES,
  TEXT_MAX_CHARS,
  TEXT_MIN_CHARS,
  TXT_MAX_BYTES,
  addToHistory,
  checkCourseInput,
  checkCourseText,
  checkTextFile,
  decodeText,
  fromServerQuiz,
  parseHistory,
  reviewFileName,
  reviewText,
  computeScore,
  countAnswered,
  firstUnanswered,
  formatDuration,
  isValidQuiz,
  prepareQuiz,
  resultMessage,
  sameCourse,
  shuffleChoices,
  titleFromFileName,
  wrongQuestions,
} from '../public/js/quiz-logic.js';
import { DEMO_COURSE, DEMO_QUIZ } from '../public/js/demo-quiz.js';

const sampleQuestion = {
  question: 'Quelle est la capitale de la Suisse ?',
  choices: ['Berne', 'Genève', 'Zurich', 'Lausanne'],
  correctIndex: 0,
  explanation: 'Berne est la ville fédérale.',
  sourceQuote: 'Berne est la ville fédérale.',
};

/** Générateur « aléatoire » prévisible pour les tests. */
function fixedRandom(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

test('shuffleChoices garde la bonne réponse, même après mélange', () => {
  for (const values of [[0], [0.99], [0.3, 0.7, 0.1], [0.5, 0.2, 0.9]]) {
    const shuffled = shuffleChoices(sampleQuestion, fixedRandom(values));
    assert.equal(shuffled.choices[shuffled.correctIndex], 'Berne');
    assert.deepEqual([...shuffled.choices].sort(), [...sampleQuestion.choices].sort());
  }
});

test('shuffleChoices ne modifie pas la question d’origine', () => {
  shuffleChoices(sampleQuestion, fixedRandom([0]));
  assert.deepEqual(sampleQuestion.choices, ['Berne', 'Genève', 'Zurich', 'Lausanne']);
  assert.equal(sampleQuestion.correctIndex, 0);
});

test('prepareQuiz mélange chaque question et garde le titre', () => {
  const quiz = prepareQuiz(DEMO_QUIZ, fixedRandom([0.42]));
  assert.equal(quiz.title, DEMO_QUIZ.title);
  quiz.questions.forEach((question, i) => {
    const original = DEMO_QUIZ.questions[i];
    assert.equal(question.choices[question.correctIndex], original.choices[original.correctIndex]);
  });
});

test('computeScore compte les bonnes réponses ; une absence de réponse compte comme fausse', () => {
  const questions = [
    { ...sampleQuestion, correctIndex: 0 },
    { ...sampleQuestion, correctIndex: 2 },
    { ...sampleQuestion, correctIndex: 3 },
    { ...sampleQuestion, correctIndex: 1 },
  ];
  assert.deepEqual(computeScore(questions, [0, 2, 1, null]), { correct: 2, total: 4, percent: 50 });
  assert.deepEqual(computeScore(questions, [0, 2, 3, 1]), { correct: 4, total: 4, percent: 100 });
  assert.deepEqual(computeScore(questions, [null, null, null, null]), { correct: 0, total: 4, percent: 0 });
});

test('wrongQuestions garde les réponses fausses ou absentes, dans l’ordre du quiz', () => {
  const questions = [0, 2, 3, 1].map((correctIndex, i) => ({ ...sampleQuestion, question: `Q${i + 1}`, correctIndex }));
  const wrong = wrongQuestions(questions, [0, 1, null, 1]); // juste, fausse, sans réponse, juste
  assert.deepEqual(wrong.map((question) => question.question), ['Q2', 'Q3']);
  assert.deepEqual(wrongQuestions(questions, [0, 2, 3, 1]), []);

  // La partie « questions ratées » remélange les choix sans perdre les bonnes réponses.
  const retry = prepareQuiz({ title: 'Révision', questions: wrong }, fixedRandom([0.9, 0.1, 0.6]));
  retry.questions.forEach((question, i) => {
    assert.equal(question.choices[question.correctIndex], wrong[i].choices[wrong[i].correctIndex]);
  });
});

test('sameCourse : même texte et même PDF, même choisi une deuxième fois', () => {
  const pdf = { name: 'eau.pdf', size: 1200, lastModified: 1 };
  const previous = { text: "Le cycle de l'eau", file: pdf, questions: ['Q1'] };
  assert.equal(sameCourse(previous, { text: "Le cycle de l'eau", file: { ...pdf } }), true);
  assert.equal(sameCourse(previous, { text: 'Un autre cours', file: pdf }), false);
  assert.equal(sameCourse(previous, { text: "Le cycle de l'eau", file: { ...pdf, size: 900 } }), false);
  assert.equal(sameCourse(previous, { text: "Le cycle de l'eau", file: null }), false);
  assert.equal(sameCourse({ text: 'Texte seul', file: null }, { text: 'Texte seul', file: null }), true);
  assert.equal(sameCourse(null, { text: 'Texte seul', file: null }), false); // aucun quiz généré avant
});

test('computeScore arrondit le pourcentage et gère un quiz vide', () => {
  const questions = [sampleQuestion, sampleQuestion, sampleQuestion];
  assert.equal(computeScore(questions, [0, 1, 1]).percent, 33);
  assert.deepEqual(computeScore([], []), { correct: 0, total: 0, percent: 0 });
});

test('countAnswered et firstUnanswered', () => {
  assert.equal(countAnswered([0, null, 3, null]), 2);
  assert.equal(firstUnanswered([0, null, 3, null]), 1);
  assert.equal(firstUnanswered([0, 1]), -1);
});

test('checkCourseText refuse un texte vide, trop court ou trop long', () => {
  assert.equal(checkCourseText('').ok, false);
  assert.equal(checkCourseText('     \n  ').ok, false);
  assert.equal(checkCourseText('a'.repeat(TEXT_MIN_CHARS - 1)).ok, false);
  assert.equal(checkCourseText('a'.repeat(TEXT_MAX_CHARS + 1)).ok, false);
  assert.match(checkCourseText('a'.repeat(TEXT_MAX_CHARS + 1)).message, /trop long/);
});

test('checkCourseText accepte un texte valide et ignore les espaces autour', () => {
  assert.equal(checkCourseText('a'.repeat(TEXT_MIN_CHARS)).ok, true);
  assert.equal(checkCourseText(`   ${'a'.repeat(TEXT_MIN_CHARS)}   `).ok, true);
  assert.equal(checkCourseText(`  ${'a'.repeat(TEXT_MIN_CHARS - 1)}  `).ok, false);
  assert.equal(checkCourseText(DEMO_COURSE).ok, true);
});

test('isValidQuiz accepte un quiz conforme au contrat', () => {
  assert.equal(isValidQuiz({ title: 'Test', questions: [sampleQuestion] }), true);
});

test('isValidQuiz refuse les réponses mal formées sans planter', () => {
  const invalid = [
    null,
    'du texte',
    {},
    { title: 'Test', questions: [] },
    { title: 'Test', questions: 'pas un tableau' },
    { title: 'Test', questions: [{ ...sampleQuestion, choices: ['A', 'B', 'C'] }] },
    { title: 'Test', questions: [{ ...sampleQuestion, choices: ['A', 'B', 'C', ''] }] },
    { title: 'Test', questions: [{ ...sampleQuestion, correctIndex: 4 }] },
    { title: 'Test', questions: [{ ...sampleQuestion, correctIndex: 1.5 }] },
    { title: 'Test', questions: [{ ...sampleQuestion, question: '   ' }] },
    { title: 'Test', questions: [{ ...sampleQuestion, explanation: undefined }] },
    { title: 'Test', questions: [null] },
  ];
  for (const quiz of invalid) {
    assert.equal(isValidQuiz(quiz), false, JSON.stringify(quiz));
  }
});

test('le quiz de démonstration respecte le contrat', () => {
  assert.equal(isValidQuiz(DEMO_QUIZ), true);
  assert.ok(DEMO_QUIZ.questions.length >= 15, 'il faut au moins 15 questions pour le réglage « 15 questions »');
});

test('chaque extrait du quiz de démonstration figure bien dans le cours d’exemple', () => {
  for (const question of DEMO_QUIZ.questions) {
    assert.ok(DEMO_COURSE.includes(question.sourceQuote), question.sourceQuote);
  }
});

test('resultMessage donne un message adapté au score', () => {
  assert.match(resultMessage(100).title, /Sans faute/);
  assert.match(resultMessage(80).title, /Bien joué/);
  assert.match(resultMessage(50).title, /bonne voie/);
  assert.match(resultMessage(10).title, /début/);
});

test('formatDuration affiche minutes et secondes', () => {
  assert.equal(formatDuration(0), '1 s');
  assert.equal(formatDuration(45_000), '45 s');
  assert.equal(formatDuration(72_000), '1 min 12 s');
  assert.equal(formatDuration(605_000), '10 min 05 s');
});

test('checkCourseInput : PDF et/ou texte collé', () => {
  const pdf = { name: 'Cours.PDF', size: 1000 };
  assert.equal(checkCourseInput('', null).field, 'text');
  assert.equal(checkCourseInput('', null).ok, false);
  assert.equal(checkCourseInput('trop court', null).ok, false);
  assert.equal(checkCourseInput(DEMO_COURSE, null).ok, true);
  // Avec un PDF, le texte est facultatif et peut être court : le serveur vérifie le total.
  assert.equal(checkCourseInput('', pdf).ok, true);
  assert.equal(checkCourseInput('note', pdf).ok, true);
  assert.equal(checkCourseInput('a'.repeat(TEXT_MAX_CHARS + 1), pdf).field, 'text');
  for (const file of [{ name: 'cours.docx', size: 10 }, { name: 'cours.pdf', size: 0 }, { name: 'cours.pdf', size: PDF_MAX_BYTES + 1 }]) {
    const check = checkCourseInput(DEMO_COURSE, file);
    assert.equal(check.ok, false, file.name);
    assert.equal(check.field, 'file');
  }
});

test('fromServerQuiz convertit le format du serveur', () => {
  const server = {
    questions: [{ question: 'Q ?', choices: ['A', 'B', 'C', 'D'], correct_answer: 2, explanation: 'Car C.' }],
  };
  assert.deepEqual(fromServerQuiz(server, 'Chapitre 1'), {
    title: 'Chapitre 1',
    questions: [{ question: 'Q ?', choices: ['A', 'B', 'C', 'D'], correctIndex: 2, explanation: 'Car C.', sourceQuote: '' }],
  });
  assert.equal(isValidQuiz(fromServerQuiz(server)), true);
});

test('fromServerQuiz refuse une réponse mal formée sans planter', () => {
  const good = { question: 'Q ?', choices: ['A', 'B', 'C', 'D'], correct_answer: 0, explanation: '' };
  for (const data of [null, 'texte', {}, { questions: [] }, { questions: [null] },
    { questions: [{ ...good, correct_answer: 4 }] }, { questions: [{ ...good, choices: ['A'] }] },
    { quiz: { title: 'Ancien format', questions: [] } }]) {
    assert.equal(fromServerQuiz(data), null, JSON.stringify(data));
  }
});

test('titleFromFileName', () => {
  assert.equal(titleFromFileName('Le_cycle-de-l_eau.PDF'), 'Le cycle de l eau');
  assert.equal(titleFromFileName('Chapitre 3.pdf'), 'Chapitre 3');
});

test('checkTextFile : seulement un .txt, ni vide ni trop lourd', () => {
  assert.equal(checkTextFile({ name: 'Cours.TXT', size: 1200 }).ok, true);
  assert.equal(checkTextFile({ name: 'cours.txt', size: TXT_MAX_BYTES }).ok, true);
  assert.match(checkTextFile({ name: 'cours.pdf', size: 1200 }).message, /Fichier PDF/);
  assert.match(checkTextFile({ name: 'cours.txt', size: 0 }).message, /vide/);
  assert.match(checkTextFile({ name: 'cours.txt', size: TXT_MAX_BYTES + 1 }).message, /256 Ko/);
});

test('decodeText : UTF-8, ancien Windows-1252 et UTF-16 du Bloc-notes', () => {
  const utf8 = new TextEncoder().encode('Évaporation : l’eau chauffée');
  assert.equal(decodeText(utf8), 'Évaporation : l’eau chauffée');
  assert.equal(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, ...utf8])), 'Évaporation : l’eau chauffée'); // BOM retiré
  assert.equal(decodeText(new Uint8Array([0x63, 0x61, 0x66, 0xe9])), 'café'); // « é » en Windows-1252
  assert.equal(decodeText(new Uint8Array([0xff, 0xfe, 0x65, 0x00, 0xe0, 0x00])), 'eà'); // UTF-16 LE
});

test('reviewText : en-tête, réponses, bonnes réponses et explications', () => {
  const questions = [sampleQuestion, { ...sampleQuestion, question: 'Q2 ?', explanation: 'Parce que.' }];
  const options = {
    title: 'Géographie',
    details: 'Quiz généré par IA · 2 questions · Facile',
    dateLabel: '6 octobre à 14:32',
    questions,
    answers: [0, 2],
    elapsedMs: 72_000,
    onlyWrong: false,
    disclaimer: 'Vérifie dans ton cours.',
  };
  assert.equal(
    reviewText(options),
    [
      'Quiz IA : corrigé',
      'Géographie',
      'Quiz généré par IA · 2 questions · Facile',
      'Le 6 octobre à 14:32',
      '',
      'Score : 1/2 (50 %)',
      'Temps : 1 min 12 s',
      '',
      '1. Quelle est la capitale de la Suisse ?',
      '   Ta réponse : Berne (juste)',
      '   Explication : Berne est la ville fédérale.',
      '',
      '2. Q2 ?',
      '   Ta réponse : Zurich (à revoir)',
      '   Bonne réponse : Berne',
      '   Explication : Parce que.',
      '',
      'Vérifie dans ton cours.',
    ].join('\n'),
  );
  // Filtre « À revoir » : seulement la question 2, numéro d'origine conservé.
  const wrongOnly = reviewText({ ...options, onlyWrong: true });
  assert.ok(wrongOnly.includes('Questions à revoir uniquement'));
  assert.ok(!wrongOnly.includes('1. Quelle est'));
  assert.ok(wrongOnly.includes('2. Q2 ?'));
  assert.ok(reviewText({ ...options, answers: [0, 0], onlyWrong: true }).includes('Aucune question à revoir'));
});

test('reviewFileName : sans accents ni espaces, avec la date du jour', () => {
  const date = new Date(2026, 9, 6, 14, 32);
  assert.equal(reviewFileName("Cycle de l'eau : étape 2", date), 'corrige-cycle-de-l-eau-etape-2-2026-10-06.txt');
  assert.equal(reviewFileName('', date), 'corrige-quiz-2026-10-06.txt');
});

test('historique : 5 résultats au plus, le plus récent en premier', () => {
  const entry = (date) => ({ date, correct: 3, total: 5, durationMs: 60_000, difficulty: 'facile', origin: 'ai', onlyWrong: false });
  let history = [];
  for (let date = 1; date <= HISTORY_MAX + 2; date++) history = addToHistory(history, entry(date));
  assert.equal(history.length, HISTORY_MAX);
  assert.deepEqual(history.map((item) => item.date), [7, 6, 5, 4, 3]);
  assert.deepEqual(parseHistory(JSON.stringify(history)), history);
});

test('parseHistory : ignore les données abîmées et les champs en trop', () => {
  const good = { date: 1, correct: 2, total: 5, durationMs: 1000, difficulty: 'difficile', origin: 'demo', onlyWrong: true };
  assert.deepEqual(parseHistory('pas du JSON'), []);
  assert.deepEqual(parseHistory('{"date": 1}'), []);
  assert.deepEqual(
    parseHistory(JSON.stringify([
      { ...good, cours: 'texte secret' }, // champ inconnu retiré : on ne garde jamais le cours
      { ...good, correct: 6 }, // plus de bonnes réponses que de questions
      { ...good, origin: 'autre' },
      null,
    ])),
    [good],
  );
});
