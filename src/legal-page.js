import './style.css';

const LANGUAGE_STORAGE_KEY = 'oicmap:lang';

function getLegalPageSlug() {
  const path = window.location.pathname.replace(/\/+$/, '/');

  if (path === '/access/' || path === '/en/access/') {
    return 'access';
  }

  if (path === '/privacy/' || path === '/en/privacy/') {
    return 'privacy';
  }

  return 'terms';
}

function getLegalPageLanguage() {
  return window.location.pathname === '/en' || window.location.pathname.startsWith('/en/')
    ? 'en'
    : 'ja';
}

function getLegalPagePath(lang) {
  const slug = getLegalPageSlug();
  return lang === 'en' ? `/en/${slug}/` : `/${slug}/`;
}

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
  window.location.href = getLegalPagePath(nextLang);
}

function setupLegalLanguageToggles() {
  const currentLang = getLegalPageLanguage();

  document.querySelectorAll('[data-legal-lang-toggle]').forEach((button) => {
    button.querySelectorAll('[data-legal-lang-option]').forEach((option) => {
      const isActive = option.dataset.legalLangOption === currentLang;
      option.classList.toggle('is-active', isActive);
      option.setAttribute('aria-current', isActive ? 'true' : 'false');
    });

    button.addEventListener('click', (event) => {
      const option = event.target instanceof Element
        ? event.target.closest('[data-legal-lang-option]')
        : null;
      navigateToLanguage(option?.dataset.legalLangOption ?? 'en');
    });
  });
}

/* ------------------------------------------------------------------ */
/*  Dialogs (About / Contact) on legal pages                          */
/* ------------------------------------------------------------------ */

const DEFAULT_CONTACT_FORM_EMBED_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSdRZNEfH7hRLTylhvTLKUIJjXszWI8i3bq2VelAp7sfmH8fhQ/viewform?usp=dialog';

function normalizeGoogleFormEmbedUrl(value) {
  const url = String(value ?? '').trim();
  if (!url) return '';
  try {
    const parsed = new URL(url, window.location.href);
    if (parsed.hostname === 'docs.google.com' && parsed.pathname.includes('/forms/')) {
      parsed.searchParams.set('embedded', 'true');
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

const DIALOG_TEXT = {
  ja: {
    aboutTitle: 'このサイトについて',
    aboutClose: '説明を閉じる',
    aboutIntro:
      '立命館OICマップは、立命館大学大阪いばらきキャンパス(OIC)の教室・施設をすばやく探せる非公式キャンパスマップです。OICのフロアマップを切り替えながら、目的の場所を確認できます。',
    aboutRooms:
      '教室検索では、500以上の教室、研究室、ラウンジ、ホール、学生利用スペースを検索し、1Fから5F、A棟6〜9F、H棟6〜9Fの地図上で位置を確認できます。',
    aboutFacilities:
      'トイレ、エレベーター、階段、エスカレーター、プリンター、自販機、ウォーターサーバーなど、キャンパス内でよく探される施設の場所も確認できます。',
    contactTitle: 'お問い合わせ',
    contactClose: 'フォームを閉じる',
    contactIframeTitle: 'お問い合わせ',
    contactFallback:
      'フォームURLがまだ設定されていません。Google Forms の埋め込みURLを設定してください。',
  },
  en: {
    aboutTitle: 'About this map',
    aboutClose: 'Close description',
    aboutIntro:
      "Ritsumeikan OIC Map is an unofficial campus map for quickly finding rooms and facilities at Ritsumeikan University's Osaka Ibaraki Campus (OIC). Switch between OIC floor maps to check where you need to go.",
    aboutRooms:
      'The room search covers 500+ classrooms, labs, lounges, halls, and student spaces across 1F to 5F, Building A 6F-9F, and Building H 6F-9F.',
    aboutFacilities:
      'You can also find frequently searched campus facilities, including restrooms, elevators, stairs, escalators, printers, vending machines, and water dispensers.',
    contactTitle: 'Contact',
    contactClose: 'Close form',
    contactIframeTitle: 'Contact',
    contactFallback:
      'The form URL is not configured yet. Set the Google Forms embed URL to enable this form.',
  },
};

function createDialogs() {
  const lang = getLegalPageLanguage();
  const t = DIALOG_TEXT[lang] || DIALOG_TEXT.ja;
  const contactFormEmbedUrl = normalizeGoogleFormEmbedUrl(DEFAULT_CONTACT_FORM_EMBED_URL);

  // About dialog
  const aboutBackdrop = document.createElement('div');
  aboutBackdrop.id = 'about-dialog';
  aboutBackdrop.className = 'about-dialog-backdrop';
  aboutBackdrop.hidden = true;
  aboutBackdrop.innerHTML = `
    <section class="about-dialog" role="dialog" aria-modal="true" aria-labelledby="about-dialog-title">
      <div class="about-dialog-header">
        <h2 id="about-dialog-title" class="about-dialog-title">${t.aboutTitle}</h2>
        <button id="about-dialog-close" class="about-dialog-close" type="button" aria-label="${t.aboutClose}">×</button>
      </div>
      <div class="about-dialog-body">
        <p>${t.aboutIntro}</p>
        <p>${t.aboutRooms}</p>
        <p>${t.aboutFacilities}</p>
      </div>
      <footer class="about-dialog-footer">
        <p class="about-dialog-version">Ver. 2.5</p>
      </footer>
    </section>`;
  document.body.appendChild(aboutBackdrop);

  // Contact form dialog
  const contactBackdrop = document.createElement('div');
  contactBackdrop.id = 'contact-form-dialog';
  contactBackdrop.className = 'about-dialog-backdrop contact-form-dialog-backdrop';
  contactBackdrop.hidden = true;

  const iframeSrc = contactFormEmbedUrl ? '' : '';
  const iframeHidden = contactFormEmbedUrl ? ' hidden' : ' hidden';
  const fallbackHidden = contactFormEmbedUrl ? ' hidden' : '';

  contactBackdrop.innerHTML = `
    <section class="about-dialog contact-form-dialog" role="dialog" aria-modal="true" aria-labelledby="contact-form-dialog-title">
      <div class="about-dialog-header">
        <h2 id="contact-form-dialog-title" class="about-dialog-title">${t.contactTitle}</h2>
        <button id="contact-form-dialog-close" class="about-dialog-close" type="button" aria-label="${t.contactClose}">×</button>
      </div>
      <div class="contact-form-dialog-body">
        <iframe id="contact-form-frame" class="contact-form-frame" title="${t.contactIframeTitle}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" hidden></iframe>
        <p id="contact-form-fallback" class="contact-form-fallback"${fallbackHidden}>${t.contactFallback}</p>
      </div>
    </section>`;
  document.body.appendChild(contactBackdrop);

  return { aboutBackdrop, contactBackdrop, contactFormEmbedUrl };
}

function setupDialogs() {
  const { aboutBackdrop, contactBackdrop, contactFormEmbedUrl } = createDialogs();

  const aboutClose = aboutBackdrop.querySelector('#about-dialog-close');
  const contactClose = contactBackdrop.querySelector('#contact-form-dialog-close');
  const contactFrame = contactBackdrop.querySelector('#contact-form-frame');
  const contactFallback = contactBackdrop.querySelector('#contact-form-fallback');
  const menuDetails = document.querySelector('.legal-menu');

  function closeMenu() {
    if (menuDetails) menuDetails.open = false;
  }

  function setAboutOpen(isOpen) {
    aboutBackdrop.hidden = !isOpen;
    if (isOpen) {
      closeMenu();
      aboutClose?.focus();
    }
  }

  function setContactOpen(isOpen) {
    contactBackdrop.hidden = !isOpen;
    if (isOpen) {
      closeMenu();
      if (contactFormEmbedUrl && contactFrame) {
        if (contactFrame.getAttribute('src') !== contactFormEmbedUrl) {
          contactFrame.setAttribute('src', contactFormEmbedUrl);
        }
        contactFrame.hidden = false;
      }
      if (contactFallback) {
        contactFallback.hidden = Boolean(contactFormEmbedUrl);
      }
      contactClose?.focus();
    }
  }

  // Menu button handlers
  document.querySelectorAll('[data-dialog]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.dialog;
      if (target === 'about') setAboutOpen(true);
      if (target === 'contact') setContactOpen(true);
    });
  });

  // Close button handlers
  aboutClose?.addEventListener('click', () => setAboutOpen(false));
  contactClose?.addEventListener('click', () => setContactOpen(false));

  // Backdrop click to close
  aboutBackdrop.addEventListener('click', (e) => {
    if (e.target === aboutBackdrop) setAboutOpen(false);
  });
  contactBackdrop.addEventListener('click', (e) => {
    if (e.target === contactBackdrop) setContactOpen(false);
  });

  // Escape key to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!aboutBackdrop.hidden) setAboutOpen(false);
      if (!contactBackdrop.hidden) setContactOpen(false);
    }
  });
}

/* ------------------------------------------------------------------ */

function init() {
  setupLegalLanguageToggles();
  setupDialogs();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
