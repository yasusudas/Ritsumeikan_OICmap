import './style.css';

const LANGUAGE_STORAGE_KEY = 'oicmap:lang';

function storeLanguage(lang) {
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch {
    // The navigation still works if storage is unavailable.
  }
}

function navigateToLanguage(lang) {
  const nextLang = lang === 'en' ? 'en' : 'ja';
  storeLanguage(nextLang);
  window.location.href = nextLang === 'en' ? '/en/' : '/';
}

function setupLegalLanguageToggles() {
  document.querySelectorAll('[data-legal-lang-toggle]').forEach((button) => {
    button.addEventListener('click', (event) => {
      const option = event.target instanceof Element
        ? event.target.closest('[data-legal-lang-option]')
        : null;
      navigateToLanguage(option?.dataset.legalLangOption ?? 'en');
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupLegalLanguageToggles, { once: true });
} else {
  setupLegalLanguageToggles();
}
