// IndexNow: tell Bing and the other participating search engines which URLs changed.
//
//   node scripts/indexnow-submit.mjs                    # print what would be sent (nothing is sent)
//   node scripts/indexnow-submit.mjs --submit           # send every URL in public/sitemap.xml
//   node scripts/indexnow-submit.mjs --submit <url>...  # send only the given URLs
//
// Run it after the change is live on the production host: IndexNow fetches the key file from the
// site before it accepts the URLs. The key file is public/<key>.txt, a file whose name and contents
// are the same string (IndexNow keys are public by design).
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = resolve(rootDir, 'public');
const host = 'rits-oic-map.app';
const endpoint = 'https://api.indexnow.org/indexnow';

function findKey() {
  const keys = readdirSync(publicDir)
    .filter((name) => /^[0-9a-f]{32}\.txt$/.test(name))
    .filter((name) => readFileSync(resolve(publicDir, name), 'utf8').trim() === name.slice(0, -4));

  if (keys.length !== 1) {
    throw new Error(`Expected exactly one IndexNow key file in public/, found ${keys.length}`);
  }

  return keys[0].slice(0, -4);
}

function readSitemapUrls() {
  const xml = readFileSync(resolve(publicDir, 'sitemap.xml'), 'utf8');
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].trim());
}

const args = process.argv.slice(2);
const submit = args.includes('--submit');
const explicitUrls = args.filter((arg) => !arg.startsWith('--'));
const urlList = explicitUrls.length > 0 ? explicitUrls : readSitemapUrls();

for (const url of urlList) {
  if (new URL(url).host !== host) {
    throw new Error(`IndexNow key only covers ${host}: ${url}`);
  }
}

const key = findKey();
const payload = {
  host,
  key,
  keyLocation: `https://${host}/${key}.txt`,
  urlList
};

console.log(`${submit ? 'Submitting' : 'Dry run, would submit'} ${urlList.length} URLs to ${endpoint}`);
console.log(JSON.stringify(payload, null, 2));

if (!submit) {
  console.log('Nothing was sent. Add --submit to send.');
  process.exit(0);
}

const response = await fetch(endpoint, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify(payload)
});

// 200 = accepted, 202 = accepted and the key is still being validated.
console.log(`IndexNow responded ${response.status} ${response.statusText}`);
if (response.status !== 200 && response.status !== 202) {
  console.log(await response.text());
  process.exit(1);
}
