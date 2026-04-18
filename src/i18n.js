const LANGUAGE_STORAGE_KEY = 'oicmap:lang';
export const LANGUAGE_CHANGE_EVENT = 'oicmap:languagechange';

const dictionaries = {
  ja: {
    'meta.appName': '立命館OICマップ',
    'meta.title.viewer': '立命館OICマップ',
    'meta.title.editor': '立命館OICマップ編集',
    'meta.title.login': '編集ページログイン',
    'meta.description':
      '立命館大学大阪いばらきキャンパスの500以上の教室位置を検索できるフロアマップです。',
    'meta.schemaAlternateName': 'Ritsumeikan OIC Map',

    'lang.switchToEnglish': '英語に切り替え',
    'lang.switchToJapanese': '日本語に切り替え',

    'app.title.viewer': '立命館OICマップ',
    'app.title.editor': '立命館OICマップ編集',

    'fileMode.viewer.title': '立命館OICマップ',
    'fileMode.viewer.copy1':
      'このアプリは <strong>index.html を直接開く方式では動作しません</strong>。地図表示と操作機能はローカルサーバー経由で起動する必要があります。',
    'fileMode.viewer.copy2':
      '一番簡単なのは、プロジェクト直下の <code>start-map.command</code> をダブルクリックする方法です。',
    'fileMode.viewer.copy3':
      'ターミナルを使う場合は <code>npm run dev</code> のあと、<code>http://127.0.0.1:5173/</code> を開いてください。',
    'fileMode.editor.title': '立命館OICマップ編集',
    'fileMode.editor.copy1':
      'このアプリは <strong>index.html を直接開く方式では動作しません</strong>。地図表示と編集機能はローカルサーバー経由で起動する必要があります。',
    'fileMode.editor.copy2':
      'ターミナルで <code>npm run dev</code> を実行して、<code>http://127.0.0.1:5173/editor/</code> を開いてください。',
    'fileMode.editor.copy3': '閲覧用サイトは <code>http://127.0.0.1:5173/</code> です。',
    'fileMode.login.title': '編集ページログイン',
    'fileMode.login.copy':
      'このログイン画面はローカルサーバー経由で開く必要があります。<code>npm run dev</code> のあと <code>http://127.0.0.1:5173/editor/login/</code> を開いてください。',

    'search.label': '教室検索',
    'search.placeholder': '教室名を検索',
    'search.clear': '検索をクリア',
    'search.facilityActions': '施設アイコン',
    'search.feedback.default': '500以上の教室の位置を検索できます / 地図は拡大･縮小･移動できます',
    'search.feedback.loading': '検索データを読み込み中...',
    'search.feedback.noData': '検索データがまだありません',
    'search.feedback.noDataRegistered': '検索データがまだ登録されていません',
    'search.feedback.noDataShort': '検索データなし',
    'search.feedback.noMatches': '一致する教室候補がありません',
    'search.feedback.noMatchesShort': '一致候補なし',
    'search.feedback.inputHint': 'アルファベットと数字で検索できます',
    'search.feedback.inputRequired': '検索語を入力してください',
    'search.feedback.showing': '{label} を {floor} で表示中',
    'search.feedback.matches': '{count} 件の候補',
    'search.toiletLegend': '青色は男子トイレ、赤色は女子トイレ、黄色は多目的トイレです',

    'facility.toilet': 'トイレ',
    'facility.waterServer': 'ウォーターサーバー',
    'facility.vendingMachine': '自販機',
    'facility.printer': 'プリンター',
    'facility.stairs': '階段',
    'facility.escalator': 'エスカレーター',
    'facility.elevator': 'エレベーター',

    'floor.1F': '1F',
    'floor.2F': '2F',
    'floor.3F': '3F',
    'floor.4F': '4F',
    'floor.5F': '5F',
    'floor.A-6-9F': 'A棟6,7,8,9F',
    'floor.H-6-9F': 'H棟6,7,8,9F',
    'floor.printerMap': 'プリンター',
    'floor.primaryNav': 'フロア切替',
    'floor.secondaryNav': '棟別フロア切替',
    'floor.map': 'フロアマップ',
    'status.loading': '読み込み中...',
    'status.floorLoading': '{floor} を読み込み中...',
    'status.floorError': '地図の読み込みに失敗しました',

    'editor.logout': 'ログアウト',
    'editor.caption': '編集用URLです。地図をクリックして検索用テキストと位置を記録できます。',
    'editor.shellAria': '検索データ編集',
    'editor.noCoords': '位置未指定',
    'editor.field.displayName': '表示名',
    'editor.placeholder.displayName': '例: OIC Shop',
    'editor.action.save': 'この位置を記録',
    'editor.action.clearPoint': '位置をクリア',
    'editor.action.copy': 'JSONをコピー',
    'editor.action.export': 'JSONを保存',
    'editor.action.import': 'JSONを読み込み',
    'editor.action.publish': '編集を確定',
    'editor.ringTools': '蛍光リング編集',
    'editor.ringSettings': '蛍光リング設定',
    'editor.ringTarget': 'リング対象',
    'editor.ringColor': 'トイレリング色',
    'editor.ringClear': '選択中施設の現在階リングをクリア',
    'editor.feedback.default':
      '地図上の文字位置をクリックして表示名を記録できます。蛍光リング設定ボタンをオンにすると、地図タップで対応リングを設置または削除できます',
    'editor.jsonAria': '書き出し用JSON',
    'editor.move': '移動',
    'editor.delete': '削除',
    'editor.alias': '別名',
    'editor.rectMeta': '{count} rect{aliases}',
    'editor.aliasMeta': ' / 別名: {aliases}',
    'editor.noRingTool': '施設ボタンをオンにすると、その施設用のリングを追加・削除できます',
    'editor.noRings': '{floor} の {facility} リングはまだありません',
    'editor.ringLabel': '{facility} リング {index}',
    'editor.ringLabelWithColor': '{facility}({color}) リング {index}',
    'editor.ringHandleAria': '{facility} のリングを操作',
    'editor.ringHandleAriaWithColor': '{facility} {color}リングを操作',
    'editor.pinAria': '{label} を確認',
    'editor.noEntries': '{floor} の手入力データはまだありません',
    'editor.mode.on':
      '地図上の文字位置をクリックして表示名を記録できます。リング編集ボタンがオンの時はリングを追加・削除できます',
    'editor.mode.off': '編集モードをオンにして、地図上の文字位置をクリックしてください',
    'editor.ringModeToilet': 'トイレリング編集モードです。現在色: {color}',
    'editor.ringModeFacility':
      '{facility} のリング編集モードです。地図をタップすると追加、既存リングをタップすると削除します',
    'editor.ringModeOff': '地図上の文字位置をクリックして表示名を記録できます。リング編集モードはオフです',
    'editor.ringRecordFailed': 'リング位置を記録できませんでした',
    'editor.ringAdded': '{floor} に {facility} リングを追加しました',
    'editor.ringAddedWithColor': '{floor} に {facility}({color}) リングを追加しました',
    'editor.ringRemoved': '{floor} の {facility} リングを削除しました',
    'editor.ringRemovedWithColor': '{floor} の {facility}({color}) リングを削除しました',
    'editor.ringsCleared': '{floor} の {facility} リングを {count} 件クリアしました',
    'editor.ringSelected': '{floor} / {facility} リング',
    'editor.ringSelectedWithColor': '{floor} / {facility}({color}) リング',
    'editor.ringMoved': '{floor} / {facility} リングへ移動しました',
    'editor.ringMovedWithColor': '{floor} / {facility}({color}) リングへ移動しました',
    'editor.labelRequired': '表示名を入力してください',
    'editor.pointRequired': '先に地図上をクリックして位置を指定してください',
    'editor.entryCreateFailed': '入力値から検索データを作成できませんでした',
    'editor.entrySaved': '{label} を {floor} に記録しました',
    'editor.copied': 'JSON をクリップボードにコピーしました',
    'editor.copyFailed': '自動コピーに失敗したため、JSON を選択した状態にしました',
    'editor.exported': '{filename} を保存しました',
    'editor.imported':
      '{entries} 件の検索データと {rings} 件のリング下書きを読み込みました。「編集を確定」で閲覧用に反映されます',
    'editor.importedEmpty': '空の JSON を読み込みました。「編集を確定」で閲覧用からも削除されます',
    'editor.importFailed': 'JSON の読み込みに失敗しました',
    'editor.published': '{entries} 件の検索データと {rings} 件のリングを閲覧用サイトに反映しました',
    'editor.publishedEmpty': '閲覧用サイトの検索データとリングを空に反映しました',
    'editor.specialFloorEditDisabled': 'プリンター表示中は通常フロアの位置編集を無効にしています',
    'editor.outsideMap': '地図の外側は記録できません',
    'editor.pointCaptured': '位置を取得しました。表示名を入れて「この位置を記録」を押してください',
    'editor.pointCleared': '仮位置をクリアしました',

    'color.red': '赤',
    'color.blue': '青',
    'color.yellow': '黄',

    'login.aria': '編集ページログイン',
    'login.title': '編集ページにログイン',
    'login.password': 'パスワード',
    'login.submit': 'ログイン',
    'login.back': '閲覧用サイトへ戻る',
    'login.error.incorrect': 'パスワードが違います。',

    'footer.source':
      '出典：立命館大学「立命館大学 大阪いばらきキャンパス フロアガイド 日本語」（2025年3月発行、OIC地域連携課）',
    'footer.copyright': '© 2026 Issei Yasuda (立命館大学非公式)'
  },
  en: {
    'meta.appName': 'Ritsumeikan OIC Map',
    'meta.title.viewer': 'Ritsumeikan OIC Map',
    'meta.title.editor': 'Ritsumeikan OIC Map Editor',
    'meta.title.login': 'Editor Login',
    'meta.description':
      "A floor map for searching 500+ classroom locations at Ritsumeikan University's Osaka Ibaraki Campus.",
    'meta.schemaAlternateName': '立命館OICマップ',

    'lang.switchToEnglish': 'Switch to English',
    'lang.switchToJapanese': 'Switch to Japanese',

    'app.title.viewer': 'Ritsumeikan OIC Map',
    'app.title.editor': 'Ritsumeikan OIC Map Editor',

    'fileMode.viewer.title': 'Ritsumeikan OIC Map',
    'fileMode.viewer.copy1':
      'This app does <strong>not work when you open <code>index.html</code> directly</strong>. The map and its controls must be launched through a local server.',
    'fileMode.viewer.copy2':
      'The easiest option is to double-click <code>start-map.command</code> in the project root.',
    'fileMode.viewer.copy3':
      'If you prefer the terminal, run <code>npm run dev</code> and then open <code>http://127.0.0.1:5173/</code>.',
    'fileMode.editor.title': 'Ritsumeikan OIC Map Editor',
    'fileMode.editor.copy1':
      'This app does <strong>not work when you open <code>index.html</code> directly</strong>. The map and editor must be launched through a local server.',
    'fileMode.editor.copy2':
      'Run <code>npm run dev</code> in Terminal, then open <code>http://127.0.0.1:5173/editor/</code>.',
    'fileMode.editor.copy3': 'The viewer site is <code>http://127.0.0.1:5173/</code>.',
    'fileMode.login.title': 'Editor Login',
    'fileMode.login.copy':
      'This login page must be opened through a local server. After running <code>npm run dev</code>, open <code>http://127.0.0.1:5173/editor/login/</code>.',

    'search.label': 'Search Rooms & Facilities',
    'search.placeholder': 'Search by room or facility name',
    'search.clear': 'Clear search',
    'search.facilityActions': 'Facility filters',
    'search.feedback.default': 'Search 500+ rooms and campus locations. Zoom, pan, and explore the map.',
    'search.feedback.loading': 'Loading search data...',
    'search.feedback.noData': 'No search data is available yet.',
    'search.feedback.noDataRegistered': 'No search data is registered yet.',
    'search.feedback.noDataShort': 'No search data',
    'search.feedback.noMatches': 'No matching rooms or facilities.',
    'search.feedback.noMatchesShort': 'No matches',
    'search.feedback.inputHint': 'Search using letters and numbers.',
    'search.feedback.inputRequired': 'Enter a search term.',
    'search.feedback.showing': 'Showing {label} on {floor}',
    'search.feedback.matches': '{count} match{suffix}',
    'search.toiletLegend':
      "Blue rings mark men's restrooms, red rings mark women's restrooms, and yellow rings mark accessible restrooms.",

    'facility.toilet': 'Restroom',
    'facility.waterServer': 'Water Dispenser',
    'facility.vendingMachine': 'Vending Machine',
    'facility.printer': 'Printer',
    'facility.stairs': 'Staircase',
    'facility.escalator': 'Escalator',
    'facility.elevator': 'Elevator',

    'floor.1F': '1F',
    'floor.2F': '2F',
    'floor.3F': '3F',
    'floor.4F': '4F',
    'floor.5F': '5F',
    'floor.A-6-9F': 'Bldg A 6F-9F',
    'floor.H-6-9F': 'Bldg H 6F-9F',
    'floor.printerMap': 'Printer Map',
    'floor.primaryNav': 'Floor selector',
    'floor.secondaryNav': 'Upper-floor building selector',
    'floor.map': 'Floor map',
    'status.loading': 'Loading...',
    'status.floorLoading': 'Loading {floor}...',
    'status.floorError': 'Failed to load the map.',

    'editor.logout': 'Log Out',
    'editor.caption': 'This is the editor URL. Click the map to record searchable labels and their positions.',
    'editor.shellAria': 'Search data editor',
    'editor.noCoords': 'No location selected',
    'editor.field.displayName': 'Display Name',
    'editor.placeholder.displayName': 'Example: OIC Shop',
    'editor.action.save': 'Save This Location',
    'editor.action.clearPoint': 'Clear Location',
    'editor.action.copy': 'Copy JSON',
    'editor.action.export': 'Export JSON',
    'editor.action.import': 'Import JSON',
    'editor.action.publish': 'Publish Changes',
    'editor.ringTools': 'Highlight ring editor',
    'editor.ringSettings': 'Highlight Ring Settings',
    'editor.ringTarget': 'Ring type',
    'editor.ringColor': 'Restroom ring color',
    'editor.ringClear': 'Clear Rings for the Selected Facility on This Floor',
    'editor.feedback.default':
      'Click a text location on the map to save its label. Turn on a ring tool to add or remove highlight rings by tapping the map.',
    'editor.jsonAria': 'JSON export output',
    'editor.move': 'Move',
    'editor.delete': 'Delete',
    'editor.alias': 'Alias',
    'editor.rectMeta': '{count} rect{rectSuffix}{aliases}',
    'editor.aliasMeta': ' / aliases: {aliases}',
    'editor.noRingTool': 'Turn on a facility button to add or remove rings for that facility.',
    'editor.noRings': 'There are no {facility} rings on {floor} yet.',
    'editor.ringLabel': '{facility} Ring {index}',
    'editor.ringLabelWithColor': '{facility} ({color}) Ring {index}',
    'editor.ringHandleAria': 'Edit the {facility} ring',
    'editor.ringHandleAriaWithColor': 'Edit the {color} {facility} ring',
    'editor.pinAria': 'Review {label}',
    'editor.noEntries': 'There is no manually entered data on {floor} yet.',
    'editor.mode.on':
      'Click a text location on the map to record its label. When a ring tool is active, you can add or remove rings.',
    'editor.mode.off': 'Turn on edit mode, then click a text location on the map.',
    'editor.ringModeToilet': 'Restroom ring edit mode. Current color: {color}',
    'editor.ringModeFacility':
      '{facility} ring edit mode. Tap the map to add a ring, or tap an existing ring to remove it.',
    'editor.ringModeOff': 'Click a text location on the map to record its label. Ring edit mode is off.',
    'editor.ringRecordFailed': 'The ring location could not be recorded.',
    'editor.ringAdded': 'Added a {facility} ring on {floor}.',
    'editor.ringAddedWithColor': 'Added a {color} {facility} ring on {floor}.',
    'editor.ringRemoved': 'Removed the {facility} ring from {floor}.',
    'editor.ringRemovedWithColor': 'Removed the {color} {facility} ring from {floor}.',
    'editor.ringsCleared': 'Cleared {count} {facility} ring{suffix} from {floor}.',
    'editor.ringSelected': '{floor} / {facility} Ring',
    'editor.ringSelectedWithColor': '{floor} / {facility} ({color}) Ring',
    'editor.ringMoved': 'Moved to the {facility} ring on {floor}.',
    'editor.ringMovedWithColor': 'Moved to the {color} {facility} ring on {floor}.',
    'editor.labelRequired': 'Enter a display name.',
    'editor.pointRequired': 'Click the map first to choose a location.',
    'editor.entryCreateFailed': 'Search data could not be created from the input.',
    'editor.entrySaved': 'Saved {label} on {floor}.',
    'editor.copied': 'Copied JSON to the clipboard.',
    'editor.copyFailed': 'Automatic copy failed, so the JSON has been selected.',
    'editor.exported': 'Saved {filename}.',
    'editor.imported':
      'Loaded {entries} search entr{entrySuffix} and {rings} ring draft{ringSuffix}. Click "Publish Changes" to send them to the viewer.',
    'editor.importedEmpty': 'Loaded an empty JSON file. Click "Publish Changes" to clear the viewer data too.',
    'editor.importFailed': 'Failed to import JSON.',
    'editor.published': 'Published {entries} search entr{entrySuffix} and {rings} ring{ringSuffix} to the viewer site.',
    'editor.publishedEmpty': 'Published an empty set of search data and rings to the viewer site.',
    'editor.specialFloorEditDisabled': 'Location editing is disabled while the printer map is displayed.',
    'editor.outsideMap': 'Locations outside the map cannot be recorded.',
    'editor.pointCaptured': 'Location selected. Enter a label and click "Save This Location".',
    'editor.pointCleared': 'Cleared the temporary location.',

    'color.red': 'Red',
    'color.blue': 'Blue',
    'color.yellow': 'Yellow',

    'login.aria': 'Editor Login',
    'login.title': 'Sign In to the Editor',
    'login.password': 'Password',
    'login.submit': 'Log In',
    'login.back': 'Back to the Viewer',
    'login.error.incorrect': 'Incorrect password.',

    'footer.source':
      'Source: Ritsumeikan University, Osaka Ibaraki Campus Floor Guide (Japanese), published in March 2025 by the OIC Regional Partnerships Office.',
    'footer.copyright': '© 2026 Issei Yasuda (Unofficial Ritsumeikan University site)'
  }
};

let currentLang = readStoredLanguage();

function readStoredLanguage() {
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return stored === 'en' || stored === 'ja' ? stored : 'ja';
  } catch {
    return 'ja';
  }
}

function getPageKey() {
  const appMode = document.body?.dataset.appMode;

  if (appMode === 'editor') {
    return 'editor';
  }

  if (appMode === 'login' || window.location.pathname.startsWith('/editor/login')) {
    return 'login';
  }

  return 'viewer';
}

function interpolate(template, params = {}) {
  return String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match
  );
}

function setMetaContent(selector, content) {
  const node = document.querySelector(selector);

  if (node) {
    node.setAttribute('content', content);
  }
}

function updateJsonLd() {
  const script = document.querySelector('script[type="application/ld+json"][data-i18n-jsonld]');

  if (!script) {
    return;
  }

  script.textContent = JSON.stringify(
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: t('meta.title.viewer'),
      alternateName: t('meta.schemaAlternateName'),
      url: 'https://rits-oic-map.vercel.app/',
      inLanguage: currentLang
    },
    null,
    2
  );
}

function applyDocumentMeta() {
  const pageKey = getPageKey();
  const title = t(`meta.title.${pageKey}`);
  const appName = t('meta.appName');
  const description = t('meta.description');

  document.documentElement.lang = currentLang;
  document.title = title;

  setMetaContent('meta[name="application-name"]', appName);
  setMetaContent('meta[name="apple-mobile-web-app-title"]', appName);
  setMetaContent('meta[name="description"]', description);
  setMetaContent('meta[property="og:site_name"]', appName);
  setMetaContent('meta[property="og:title"]', t('meta.title.viewer'));
  setMetaContent('meta[property="og:description"]', description);
  setMetaContent('meta[name="twitter:title"]', t('meta.title.viewer'));
  setMetaContent('meta[name="twitter:description"]', description);
  updateJsonLd();
}

function updateLanguageToggles(root = document) {
  root.querySelectorAll('[data-lang-toggle]').forEach((button) => {
    const targetLang = currentLang === 'ja' ? 'en' : 'ja';
    button.textContent = targetLang.toUpperCase();
    button.setAttribute('aria-label', targetLang === 'en' ? t('lang.switchToEnglish') : t('lang.switchToJapanese'));
    button.setAttribute('title', targetLang === 'en' ? t('lang.switchToEnglish') : t('lang.switchToJapanese'));
  });
}

function setupLanguageToggles(root = document) {
  root.querySelectorAll('[data-lang-toggle]').forEach((button) => {
    if (button.dataset.langToggleReady === 'true') {
      return;
    }

    button.dataset.langToggleReady = 'true';
    button.addEventListener('click', () => {
      toggleLang();
    });
  });
}

export function getLang() {
  return currentLang;
}

export function getLocale() {
  return currentLang === 'en' ? 'en' : 'ja';
}

export function t(key, params = {}) {
  const dictionary = dictionaries[currentLang] ?? dictionaries.ja;
  const fallbackDictionary = dictionaries.ja;
  const template = dictionary[key] ?? fallbackDictionary[key] ?? key;
  return interpolate(template, params);
}

export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });

  root.querySelectorAll('[data-i18n-html]').forEach((node) => {
    node.innerHTML = t(node.dataset.i18nHtml);
  });

  root.querySelectorAll('[data-i18n-aria]').forEach((node) => {
    node.setAttribute('aria-label', t(node.dataset.i18nAria));
  });

  root.querySelectorAll('[data-i18n-placeholder]').forEach((node) => {
    node.setAttribute('placeholder', t(node.dataset.i18nPlaceholder));
  });

  root.querySelectorAll('[data-i18n-title]').forEach((node) => {
    node.setAttribute('title', t(node.dataset.i18nTitle));
  });

  applyDocumentMeta();
  updateLanguageToggles(root);
  setupLanguageToggles(root);
}

export function setLang(lang, { persist = true, notify = true } = {}) {
  const nextLang = lang === 'en' ? 'en' : 'ja';

  if (nextLang === currentLang) {
    applyI18n();
    return currentLang;
  }

  currentLang = nextLang;

  if (persist) {
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, currentLang);
    } catch {
      // Ignore storage failures; the page still switches language for this session.
    }
  }

  applyI18n();

  if (notify) {
    window.dispatchEvent(new CustomEvent(LANGUAGE_CHANGE_EVENT, { detail: { lang: currentLang } }));
  }

  return currentLang;
}

export function toggleLang() {
  return setLang(currentLang === 'ja' ? 'en' : 'ja');
}

export function onLanguageChange(handler) {
  window.addEventListener(LANGUAGE_CHANGE_EVENT, handler);
  return () => window.removeEventListener(LANGUAGE_CHANGE_EVENT, handler);
}

document.documentElement.lang = currentLang;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => applyI18n(), { once: true });
} else {
  applyI18n();
}

window.OIC_I18N = {
  applyI18n,
  getLang,
  setLang,
  t,
  toggleLang
};
