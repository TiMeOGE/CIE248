// Communication avec le serveur (backend). Toutes les requêtes réseau passent par ici.
// Le navigateur ne parle JAMAIS directement à l'IA : la clé API reste sur le serveur.
// Contrat des routes : backend/README.md, section « Contrat HTTP ».

import { fromServerQuiz } from './quiz-logic.js';

// Le serveur coupe lui-même l'appel à l'IA après 120 s ; celui-ci est une sécurité de plus.
const GENERATE_TIMEOUT_MS = 130_000;
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
 * Demande la génération d'un quiz à partir d'un PDF, d'un texte collé, ou des deux.
 * @param {{ text: string, file: File|null, count: number, level: string, title: string }} params
 * @param {AbortSignal} cancelSignal  signal déclenché quand l'utilisateur clique sur « Annuler »
 * @returns {Promise<{ quiz: object, warnings: string[] }>}
 * @throws {ApiError} avec un message compréhensible par l'utilisateur
 */
export async function requestQuiz({ text, file, count, level, title }, cancelSignal) {
  const signal = AbortSignal.any([cancelSignal, AbortSignal.timeout(GENERATE_TIMEOUT_MS)]);

  // FormData : le navigateur choisit lui-même l'en-tête multipart (ne pas définir Content-Type).
  const form = new FormData();
  if (file) form.append('file', file);
  if (text) form.append('text', text);
  form.append('question_count', String(count));
  form.append('level', level);

  let response;
  try {
    response = await fetch('/api/quiz/generate', { method: 'POST', body: form, signal });
  } catch (error) {
    if (cancelSignal.aborted) {
      throw new ApiError('CANCELLED', 'Génération annulée.');
    }
    if (error.name === 'TimeoutError') {
      throw new ApiError('AI_TIMEOUT', "L'IA met trop de temps à répondre. Réessaie dans un instant, ou avec un cours plus court.");
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
    const code = typeof serverError?.code === 'string' ? serverError.code : 'SERVER_ERROR';
    throw new ApiError(code, errorMessage(code, response.status));
  }

  const quiz = fromServerQuiz(data, title);
  if (!quiz) {
    throw new ApiError('AI_INVALID_RESPONSE', 'Le quiz reçu est incomplet. Relance la génération.');
  }
  return { quiz, warnings: [] };
}

// Messages du serveur réécrits pour les élèves (le serveur répond sans accents, en style technique).
const ERROR_MESSAGES = {
  CONTENT_REQUIRED: 'Choisis un PDF ou colle le texte de ton cours.',
  INVALID_FILE_TYPE: "Ce fichier n'est pas un PDF valide. Choisis un autre fichier.",
  PDF_TOO_LARGE: 'Ce PDF est trop lourd (5 Mo maximum).',
  REQUEST_TOO_LARGE: 'Ce PDF est trop lourd (5 Mo maximum).',
  EMPTY_PDF: 'Ce PDF est vide. Choisis un autre fichier.',
  INVALID_PDF: 'Ce PDF est illisible ou endommagé. Essaie un autre fichier, ou colle le texte.',
  ENCRYPTED_PDF: 'Ce PDF est protégé par un mot de passe. Utilise une version sans mot de passe, ou colle le texte.',
  TOO_MANY_PAGES: 'Ce PDF a trop de pages (50 maximum). Garde un seul chapitre à la fois.',
  NO_TEXT: "Aucun texte n'a pu être lu dans ce PDF (c'est peut-être un scan). Colle plutôt le texte du cours.",
  INSUFFICIENT_TEXT: 'Ton cours est trop court (au moins 200 caractères) pour créer de bonnes questions.',
  TEXT_TOO_LONG: 'Ton cours est trop long (60 000 caractères maximum). Garde un seul chapitre à la fois.',
  INSUFFICIENT_CONTENT: "Ton cours ne contient pas assez d'informations pour ce nombre de questions. Essaie avec 5 questions ou un cours plus complet.",
  AI_REFUSED: "L'IA n'a pas pu créer de quiz à partir de ce cours. Essaie avec un autre texte.",
  AI_NOT_CONFIGURED: "La génération IA n'est pas configurée sur le serveur. Tu peux jouer au quiz de démonstration.",
  AI_QUOTA_EXCEEDED: "Le service d'IA est très sollicité en ce moment. Réessaie dans quelques minutes.",
  AI_TIMEOUT: "L'IA met trop de temps à répondre. Réessaie dans un instant, ou avec un cours plus court.",
  AI_UNAVAILABLE: "Le service d'IA ne répond pas pour le moment. Réessaie dans un instant.",
  AI_INVALID_RESPONSE: 'Le quiz reçu est incomplet. Relance la génération.',
};

function errorMessage(code, status) {
  return ERROR_MESSAGES[code] ?? `Le serveur a rencontré un problème (erreur ${status}). Réessaie dans un instant.`;
}

/** Lit le corps JSON d'une réponse ; renvoie null s'il n'est pas du JSON valide. */
async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
