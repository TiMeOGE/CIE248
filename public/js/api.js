// Communication avec le serveur (backend). Toutes les requêtes réseau passent par ici.
// Le navigateur ne parle JAMAIS directement à l'IA : la clé API reste sur le serveur.
// Contrat des routes : docs/PLAN.md, section 4.

import { isValidQuiz } from './quiz-logic.js';

// Le serveur coupe lui-même l'appel à l'IA avant ce délai ; celui-ci est une sécurité de plus.
const GENERATE_TIMEOUT_MS = 60_000;
const STATUS_TIMEOUT_MS = 5_000;

/** Erreur avec un code (ex. AI_TIMEOUT) et un message prêt à afficher. */
export class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

/**
 * Demande au serveur s'il fonctionne et si la génération IA est configurée.
 * Ne lève jamais d'erreur : en cas de problème, indique simplement « injoignable ».
 */
export async function fetchStatus() {
  try {
    const response = await fetch('/api/status', { signal: AbortSignal.timeout(STATUS_TIMEOUT_MS) });
    if (!response.ok) return { reachable: false, aiConfigured: false };
    const data = await response.json();
    return { reachable: true, aiConfigured: data.aiConfigured === true };
  } catch {
    return { reachable: false, aiConfigured: false };
  }
}

/**
 * Demande la génération d'un quiz.
 * @param {{ text: string, count: number, level: string }} params
 * @param {AbortSignal} cancelSignal  signal déclenché quand l'utilisateur clique sur « Annuler »
 * @returns {Promise<{ quiz: object, warnings: string[] }>}
 * @throws {ApiError} avec un message compréhensible par l'utilisateur
 */
export async function requestQuiz({ text, count, level }, cancelSignal) {
  const signal = AbortSignal.any([cancelSignal, AbortSignal.timeout(GENERATE_TIMEOUT_MS)]);

  let response;
  try {
    response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, count, level }),
      signal,
    });
  } catch (error) {
    if (cancelSignal.aborted) {
      throw new ApiError('CANCELLED', 'Génération annulée.');
    }
    if (error.name === 'TimeoutError') {
      throw new ApiError('AI_TIMEOUT', "L'IA met trop de temps à répondre. Réessaie dans un instant, ou avec un texte plus court.");
    }
    throw new ApiError('NETWORK_ERROR', 'Le serveur ne répond pas. Vérifie ta connexion Internet, puis réessaie.');
  }

  const data = await readJson(response);

  if (!response.ok) {
    // Route absente : le site est servi sans serveur (ex. simple hébergement de fichiers).
    if ([404, 405, 501].includes(response.status)) {
      throw new ApiError('API_UNAVAILABLE', "La génération IA n'est pas disponible sur ce site. Tu peux jouer au quiz de démonstration.");
    }
    const serverError = data?.error;
    throw new ApiError(
      typeof serverError?.code === 'string' ? serverError.code : 'SERVER_ERROR',
      typeof serverError?.message === 'string'
        ? serverError.message
        : `Le serveur a rencontré un problème (erreur ${response.status}). Réessaie dans un instant.`,
    );
  }

  if (!isValidQuiz(data?.quiz)) {
    throw new ApiError('AI_INVALID_RESPONSE', 'Le quiz reçu est incomplet. Relance la génération.');
  }

  const warnings = Array.isArray(data.warnings) ? data.warnings.filter((w) => typeof w === 'string') : [];
  return { quiz: data.quiz, warnings };
}

/** Lit le corps JSON d'une réponse ; renvoie null s'il n'est pas du JSON valide. */
async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
