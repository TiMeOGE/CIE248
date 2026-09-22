// Logique du quiz : uniquement des fonctions « pures ».
// Elles ne touchent pas à la page (pas de document, pas de fetch), ce qui permet
// de les tester avec Node : voir tests/quiz-logic.test.js.

// Mêmes limites que le serveur (backend/app/config.py).
export const TEXT_MIN_CHARS = 200;
export const TEXT_MAX_CHARS = 60000;
export const PDF_MAX_BYTES = 5 * 1024 * 1024;
export const CHOICES_PER_QUESTION = 4;

const numberFormat = new Intl.NumberFormat('fr-CH');

/** Formate un nombre en français (Suisse) : 15000 → « 15 000 » (avec une espace fine). */
export function formatNumber(value) {
  return numberFormat.format(value);
}

/**
 * Vérifie le texte du cours avant l'envoi au serveur.
 * La longueur est comptée sans les espaces du début et de la fin.
 * Renvoie { ok: true } ou { ok: false, message } avec un message prêt à afficher.
 */
export function checkCourseText(text) {
  const length = text.trim().length;
  if (length === 0) {
    return { ok: false, message: "Colle d'abord le texte de ton cours." };
  }
  if (length < TEXT_MIN_CHARS) {
    return {
      ok: false,
      message: `Ton texte est trop court (${formatNumber(length)} caractères). Il en faut au moins ${formatNumber(TEXT_MIN_CHARS)} pour créer de bonnes questions.`,
    };
  }
  if (length > TEXT_MAX_CHARS) {
    return {
      ok: false,
      message: `Ton texte est trop long (${formatNumber(length)} caractères, maximum ${formatNumber(TEXT_MAX_CHARS)}). Garde un seul chapitre à la fois.`,
    };
  }
  return { ok: true, message: '' };
}

/**
 * Vérifie le cours avant l'envoi : un PDF, un texte collé, ou les deux.
 * `file` est un objet { name, size } (un File du navigateur) ou null.
 * Avec un PDF, le texte collé est facultatif : le serveur vérifie la longueur totale.
 * Renvoie { ok, message, field } où field vaut 'file' ou 'text' (champ à signaler).
 */
export function checkCourseInput(text, file) {
  if (!file) {
    if (text.trim() === '') {
      return { ok: false, field: 'text', message: 'Choisis un PDF ou colle le texte de ton cours.' };
    }
    return { ...checkCourseText(text), field: 'text' };
  }
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    return { ok: false, field: 'file', message: 'Le fichier doit être un PDF.' };
  }
  if (file.size === 0) {
    return { ok: false, field: 'file', message: 'Ce PDF est vide. Choisis un autre fichier.' };
  }
  if (file.size > PDF_MAX_BYTES) {
    return { ok: false, field: 'file', message: 'Ce PDF est trop lourd (5 Mo maximum). Garde un seul chapitre à la fois.' };
  }
  if (text.trim().length > TEXT_MAX_CHARS) {
    return { ...checkCourseText(text), field: 'text' };
  }
  return { ok: true, field: '', message: '' };
}

/**
 * Convertit la réponse du serveur ({ questions: [{ ..., correct_answer }] })
 * au format de l'interface ({ title, questions: [{ ..., correctIndex, sourceQuote }] }).
 * Le serveur ne renvoie ni titre ni extrait du cours : on les complète.
 * Renvoie null si la réponse n'a pas la forme attendue.
 */
export function fromServerQuiz(data, title = '') {
  if (!isObject(data) || !Array.isArray(data.questions)) return null;
  const quiz = {
    title,
    questions: data.questions.map((question) =>
      isObject(question)
        ? {
            question: question.question,
            choices: question.choices,
            correctIndex: question.correct_answer,
            explanation: question.explanation,
            sourceQuote: '',
          }
        : question,
    ),
  };
  return isValidQuiz(quiz) ? quiz : null;
}

/** Titre du quiz tiré du nom du PDF : « cycle-de-l_eau.pdf » → « cycle de l eau ». */
export function titleFromFileName(name) {
  return name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Vérifie qu'un quiz reçu a bien la forme attendue.
 * Le serveur le valide déjà ; on revérifie ici pour que l'interface ne plante jamais,
 * même si elle reçoit une réponse inattendue.
 */
export function isValidQuiz(quiz) {
  return (
    isObject(quiz) &&
    typeof quiz.title === 'string' &&
    Array.isArray(quiz.questions) &&
    quiz.questions.length > 0 &&
    quiz.questions.every(isValidQuestion)
  );
}

function isValidQuestion(question) {
  return (
    isObject(question) &&
    isFilledString(question.question) &&
    Array.isArray(question.choices) &&
    question.choices.length === CHOICES_PER_QUESTION &&
    question.choices.every(isFilledString) &&
    Number.isInteger(question.correctIndex) &&
    question.correctIndex >= 0 &&
    question.correctIndex < question.choices.length &&
    typeof question.explanation === 'string' &&
    typeof question.sourceQuote === 'string'
  );
}

function isObject(value) {
  return typeof value === 'object' && value !== null;
}

function isFilledString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * Mélange les choix d'une question sans perdre la bonne réponse (algorithme de Fisher-Yates).
 * Utile car une IA a tendance à placer la bonne réponse toujours au même endroit.
 * `random` peut être remplacé dans les tests pour obtenir un résultat prévisible.
 */
export function shuffleChoices(question, random = Math.random) {
  const items = question.choices.map((text, index) => ({
    text,
    isCorrect: index === question.correctIndex,
  }));
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return {
    ...question,
    choices: items.map((item) => item.text),
    correctIndex: items.findIndex((item) => item.isCorrect),
  };
}

/** Prépare un quiz pour une partie : copie le titre et mélange les choix de chaque question. */
export function prepareQuiz(quiz, random = Math.random) {
  return {
    title: quiz.title,
    questions: quiz.questions.map((question) => shuffleChoices(question, random)),
  };
}

/**
 * Calcule le score. `answers[i]` contient l'index du choix de l'élève
 * pour la question i, ou null s'il n'a pas répondu (compté comme faux).
 */
export function computeScore(questions, answers) {
  const total = questions.length;
  const correct = questions.filter((question, i) => answers[i] === question.correctIndex).length;
  const percent = total === 0 ? 0 : Math.round((correct / total) * 100);
  return { correct, total, percent };
}

/** Nombre de questions auxquelles l'élève a répondu. */
export function countAnswered(answers) {
  return answers.filter((answer) => answer !== null).length;
}

/** Index de la première question sans réponse, ou -1 si tout est répondu. */
export function firstUnanswered(answers) {
  return answers.findIndex((answer) => answer === null);
}

/** Message d'encouragement affiché selon le pourcentage de réussite. */
export function resultMessage(percent) {
  if (percent === 100) {
    return {
      title: 'Sans faute, bravo !',
      text: 'Tu as répondu juste à toutes les questions. Relis les explications pour bien retenir.',
    };
  }
  if (percent >= 70) {
    return {
      title: 'Bien joué !',
      text: "Tu maîtrises l'essentiel. Relis les questions à revoir pour consolider tes connaissances.",
    };
  }
  if (percent >= 40) {
    return {
      title: 'Tu es sur la bonne voie.',
      text: "Relis le corrigé : chaque erreur t'indique une notion à retravailler.",
    };
  }
  return {
    title: "C'est un début.",
    text: 'Relis ton cours et le corrigé, puis refais le quiz pour progresser.',
  };
}

/** Formate une durée : 72 000 ms → « 1 min 12 s ». Au moins 1 seconde. */
export function formatDuration(milliseconds) {
  const seconds = Math.max(1, Math.round(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes === 0) return `${rest} s`;
  return `${minutes} min ${String(rest).padStart(2, '0')} s`;
}
