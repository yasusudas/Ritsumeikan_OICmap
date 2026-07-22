// 旧Vercelドメインから308で移動したときだけ、新しいお気に入り登録を案内する。

const MIGRATION_PARAM = 'oicmap_migrated';
const NEW_SITE_ORIGIN = 'https://rits-oic-map.app';

const params = new URLSearchParams(window.location.search);
if (params.get(MIGRATION_PARAM) === '1') {
  const language = (document.documentElement.lang || '').toLowerCase().startsWith('en')
    ? 'en'
    : 'ja';
  const copy = language === 'en'
    ? {
        title: 'The site URL has changed!',
        message: 'The site URL has changed to rits-oic-map.app. Use the button below to access it and register the new address as a bookmark or on your home screen.',
        link: 'Open the new site'
      }
    : {
        title: 'サイトのURLが新しくなりました！',
        message: 'サイトのURLがrits-oic-map.appに変更されました。以下のボタンからアクセスして、ブックマークやホーム画面に再登録してください！',
        link: '新しいサイトのURL'
      };

  const currentUrl = new URL(
    `${window.location.pathname}${window.location.search}${window.location.hash}`,
    NEW_SITE_ORIGIN
  );
  currentUrl.searchParams.delete(MIGRATION_PARAM);

  const notice = document.createElement('aside');
  notice.className = 'domain-migration-notice';
  notice.innerHTML = `
    <div class="domain-migration-notice-card" role="dialog" aria-modal="true" aria-labelledby="domain-migration-notice-title">
      <h2 id="domain-migration-notice-title" class="domain-migration-notice-title">${copy.title}</h2>
      <p class="domain-migration-notice-copy">${copy.message}</p>
      <a class="domain-migration-notice-link" href="${currentUrl.href}">${copy.link}<span aria-hidden="true"> →</span></a>
    </div>
  `;

  const link = notice.querySelector('.domain-migration-notice-link');
  const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const closeNotice = () => {
    notice.remove();
    document.body.classList.remove('domain-migration-is-open');
    previouslyFocused?.focus({ preventScroll: true });
  };
  notice.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeNotice();
    }
  });
  document.body.appendChild(notice);
  document.body.classList.add('domain-migration-is-open');
  requestAnimationFrame(() => link?.focus({ preventScroll: true }));

  // 案内を閉じた後や再読み込み時に、移行用パラメータを残さない。
  window.history.replaceState({}, '', currentUrl.href);
}
