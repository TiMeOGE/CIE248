// Tests de la logique du quiz (public/js/quiz-logic.js) et du quiz de démonstration.
// Lancer : node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  TEXT_MAX_CHARS,
  TEXT_MIN_CHARS,
  checkCourseText,
  computeScore,
  countAnswered,
  firstUnanswered,
  formatDuration,
  isValidQuiz,
  prepareQuiz,
  resultMessage,
  shuffleChoices,
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
  assert.ok(DEMO_QUIZ.questions.length >= 10, 'il faut au moins 10 questions pour le réglage « 10 questions »');
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
