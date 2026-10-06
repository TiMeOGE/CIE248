// Thème clair ou sombre (docs/DESIGN.md, principe 5).
// Script classique chargé dans <head> sans defer : data-theme est posé sur <html>
// avant le premier affichage, donc la page ne s'affiche jamais dans le mauvais thème.
(() => {
  const STORAGE_KEY = 'quiz-ia-theme';
  const root = document.documentElement;
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

  // Choix fait avec le bouton, gardé dans le navigateur. Sans choix, on suit l'appareil.
  function savedTheme() {
    try {
      const theme = localStorage.getItem(STORAGE_KEY);
      return theme === 'light' || theme === 'dark' ? theme : null;
    } catch {
      return null; // stockage bloqué (navigation privée, réglages du navigateur)
    }
  }

  function applyTheme(theme) {
    root.dataset.theme = theme;
    // L'icône change en CSS ; ici, le texte lu par les lecteurs d'écran et la bulle d'aide.
    const button = document.getElementById('theme-toggle');
    if (button) {
      const label = theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre';
      button.setAttribute('aria-label', label);
      button.title = label;
    }
  }

  applyTheme(savedTheme() ?? (systemDark.matches ? 'dark' : 'light'));

  // Si l'appareil change de thème (ex. le soir) et que l'élève n'a rien choisi, on suit.
  systemDark.addEventListener('change', (event) => {
    if (!savedTheme()) applyTheme(event.matches ? 'dark' : 'light');
  });

  // Impression : toujours le thème clair (texte foncé sur papier blanc), puis retour au thème choisi.
  let themeBeforePrint = null;
  window.addEventListener('beforeprint', () => {
    themeBeforePrint = root.dataset.theme;
    root.dataset.theme = 'light';
  });
  window.addEventListener('afterprint', () => {
    if (themeBeforePrint) root.dataset.theme = themeBeforePrint;
    themeBeforePrint = null;
  });

  document.addEventListener('DOMContentLoaded', () => {
    applyTheme(root.dataset.theme); // le bouton n'existait pas encore au premier appel
    document.getElementById('theme-toggle').addEventListener('click', () => {
      const theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(STORAGE_KEY, theme);
      } catch {
        // Stockage bloqué : le thème change quand même, mais seulement jusqu'au rechargement.
      }
      applyTheme(theme);
    });
  });
})();
