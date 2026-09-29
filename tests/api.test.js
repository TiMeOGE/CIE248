// Tests du délai d'attente de la génération (public/js/api.js).
// Lancer : node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { generateTimeoutMs } from '../public/js/api.js';

test('generateTimeoutMs : 60 s d\'OCR + délai IA selon les réglages + 10 s de marge', () => {
  // Mêmes délais IA que ai_timeout_seconds() dans backend/app/config.py (test_services.py).
  const expectedAiSeconds = [
    [5, 'facile', 120], [5, 'intermediaire', 150], [5, 'difficile', 180],
    [10, 'facile', 180], [10, 'intermediaire', 225], [10, 'difficile', 270],
  ];
  for (const [count, difficulty, aiSeconds] of expectedAiSeconds) {
    assert.equal(generateTimeoutMs(count, difficulty), (60 + aiSeconds + 10) * 1000, `${count} ${difficulty}`);
  }
});

test('generateTimeoutMs : une difficulté inconnue prend le délai le plus long', () => {
  assert.equal(generateTimeoutMs(5, 'inconnue'), generateTimeoutMs(5, 'difficile'));
});
