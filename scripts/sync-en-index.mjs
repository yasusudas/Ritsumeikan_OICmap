import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = resolve(rootDir, 'index.html');
const targetPath = resolve(rootDir, 'en/index.html');
const i18nPath = resolve(rootDir, 'src/i18n.js');
const siteBaseUrl = 'https://rits-oic-map.vercel.app/';
const englishUrl = `${siteBaseUrl}en/`;

const shouldCheck = process.argv.includes('--check');

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function readDictionaries() {
  const source = readFileSync(i18nPath, 'utf8');
  const startMarker = 'const dictionaries = ';
  const endMarker = '\n\nlet currentLang = ';
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);

  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Could not locate dictionaries in src/i18n.js');
  }

  const objectSource = source
    .slice(start + startMarker.length, end)
    .replace(/;\s*$/, '');

  return vm.runInNewContext(`(${objectSource})`);
}

function replaceOrInsertAttribute(tag, attributeName, value) {
  const escapedValue = escapeHtml(value);
  const attributePattern = new RegExp(`(^|\\s)${escapeRegExp(attributeName)}="[^"]*"`);

  if (attributePattern.test(tag)) {
    return tag.replace(attributePattern, `$1${attributeName}="${escapedValue}"`);
  }

  return tag.replace(/>$/, ` ${attributeName}="${escapedValue}">`);
}

function replaceTagAttribute(html, tagName, matchAttribute, matchValue, targetAttribute, targetValue) {
  const tagPattern = new RegExp(
    `<${tagName}\\b(?=[^>]*\\b${escapeRegExp(matchAttribute)}="${escapeRegExp(matchValue)}")[^>]*>`,
    'g'
  );

  return html.replace(tagPattern, (tag) => replaceOrInsertAttribute(tag, targetAttribute, targetValue));
}

function renderElementContent(openTag, originalContent, closeTag, value, { allowHtml = false } = {}) {
  const nextContent = allowHtml ? String(value) : escapeHtml(value);
  const leadingIndent = originalContent.match(/^\n([ \t]*)/)?.[1];
  const closingIndent = originalContent.match(/\n([ \t]*)$/)?.[1];

  if (leadingIndent !== undefined && closingIndent !== undefined) {
    return `${openTag}\n${leadingIndent}${nextContent}\n${closingIndent}${closeTag}`;
  }

  return `${openTag}${nextContent}${closeTag}`;
}

function replaceI18nElementContent(html, dictionary, attributeName, options = {}) {
  const elementPattern = new RegExp(
    `(<([a-zA-Z0-9]+)\\b[^>]*\\b${escapeRegExp(attributeName)}="([^"]+)"[^>]*>)([\\s\\S]*?)(</\\2>)`,
    'g'
  );

  return html.replace(elementPattern, (match, openTag, _tagName, key, content, closeTag) => {
    if (!Object.prototype.hasOwnProperty.call(dictionary, key)) {
      return match;
    }

    return renderElementContent(openTag, content, closeTag, dictionary[key], options);
  });
}

function replaceI18nAttribute(html, dictionary, i18nAttributeName, targetAttributeName) {
  const tagPattern = new RegExp(
    `<[^>]*\\b${escapeRegExp(i18nAttributeName)}="([^"]+)"[^>]*>`,
    'g'
  );

  return html.replace(tagPattern, (tag, key) => {
    if (!Object.prototype.hasOwnProperty.call(dictionary, key)) {
      return tag;
    }

    return replaceOrInsertAttribute(tag, targetAttributeName, dictionary[key]);
  });
}

function replaceJsonLd(html, dictionary) {
  const jsonLd = JSON.stringify(
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: dictionary['meta.title.viewer'],
      alternateName: dictionary['meta.schemaAlternateName'],
      description: dictionary['meta.description'],
      url: englishUrl,
      inLanguage: 'en'
    },
    null,
    2
  )
    .split('\n')
    .map((line) => `      ${line}`)
    .join('\n');

  return html.replace(
    /(<script type="application\/ld\+json" data-i18n-jsonld>\n)[\s\S]*?(\n    <\/script>)/,
    `$1${jsonLd}$2`
  );
}

function buildEnglishIndex() {
  const dictionaries = readDictionaries();
  const english = dictionaries.en;
  let html = readFileSync(sourcePath, 'utf8');

  html = html.replace('<html lang="ja">', '<html lang="en">');
  html = replaceTagAttribute(html, 'link', 'rel', 'canonical', 'href', englishUrl);
  html = replaceTagAttribute(html, 'meta', 'name', 'application-name', 'content', english['meta.appName']);
  html = replaceTagAttribute(html, 'meta', 'name', 'apple-mobile-web-app-title', 'content', english['meta.appName']);
  html = replaceTagAttribute(html, 'meta', 'name', 'description', 'content', english['meta.description']);
  html = replaceTagAttribute(html, 'meta', 'property', 'og:url', 'content', englishUrl);
  html = replaceTagAttribute(html, 'meta', 'property', 'og:site_name', 'content', english['meta.appName']);
  html = replaceTagAttribute(html, 'meta', 'property', 'og:title', 'content', english['meta.title.viewer']);
  html = replaceTagAttribute(html, 'meta', 'property', 'og:description', 'content', english['meta.description']);
  html = replaceTagAttribute(html, 'meta', 'name', 'twitter:title', 'content', english['meta.title.viewer']);
  html = replaceTagAttribute(html, 'meta', 'name', 'twitter:description', 'content', english['meta.description']);
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(english['meta.title.viewer'])}</title>`);
  html = replaceJsonLd(html, english);

  html = html.replace('<script>\n', "<script>\n      window.__DEFAULT_LANG__ = 'en';\n");
  html = html.replace(
    "const lang = normalizeLang(localStorage.getItem('oicmap:lang')) ?? readBrowserLang();",
    "const lang = 'en';"
  );
  html = html.replace(
    'run <code>npm run dev</code> and then open <code>http://127.0.0.1:5173/</code>.',
    'run <code>npm run dev</code> and then open <code>http://127.0.0.1:5173/en/</code>.'
  );

  html = html.replace(
    /(<button class="lang-toggle" data-lang-toggle type="button" )aria-label="[^"]*"/,
    '$1aria-label="Switch language"'
  );

  html = replaceI18nElementContent(html, english, 'data-i18n');
  html = replaceI18nElementContent(html, english, 'data-i18n-html', { allowHtml: true });
  html = replaceI18nAttribute(html, english, 'data-i18n-aria', 'aria-label');
  html = replaceI18nAttribute(html, english, 'data-i18n-placeholder', 'placeholder');

  return html;
}

const nextHtml = buildEnglishIndex();
const currentHtml = readFileSync(targetPath, 'utf8');

if (shouldCheck) {
  if (currentHtml !== nextHtml) {
    console.error('en/index.html is out of sync. Run `node scripts/sync-en-index.mjs`.');
    process.exit(1);
  }

  process.exit(0);
}

if (currentHtml !== nextHtml) {
  writeFileSync(targetPath, nextHtml);
}
