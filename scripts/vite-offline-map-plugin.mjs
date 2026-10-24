import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

// Public map assets only: editor data, PDFs and live APIs are not downloaded.
const PUBLIC_FILES = ['manifest.webmanifest', 'analytics-init.js'];
const PUBLIC_DIRECTORIES = ['food-marks', 'iconsvg', 'icon'];

async function publicAssets(directory, prefix = '') {
  const assets = [];
  for (const entry of await readdir(resolve(directory, prefix), { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const name = `${prefix}${entry.name}`;
    if (entry.isDirectory()) assets.push(...await publicAssets(directory, `${name}/`));
    else assets.push({ fileName: name, source: await readFile(resolve(directory, name)) });
  }
  return assets;
}

export function offlineMapPlugin() {
  let config;
  return {
    name: 'rits-oic-offline-map',
    apply: 'build',
    enforce: 'post',
    configResolved(value) { config = value; },
    async generateBundle(_options, bundle) {
      const pages = new Set(['index.html', 'en/index.html']);
      const resources = Object.values(bundle).filter(item => pages.has(item.fileName) || item.fileName.startsWith('assets/'));
      resources.push(...await Promise.all(PUBLIC_FILES.map(async fileName => ({
        fileName, source: await readFile(resolve(config.publicDir, fileName)),
      }))));
      for (const directory of PUBLIC_DIRECTORIES) resources.push(...await publicAssets(config.publicDir, `${directory}/`));
      resources.sort((a, b) => a.fileName.localeCompare(b.fileName, 'en'));
      const template = await readFile(resolve(config.publicDir, 'sw.js'), 'utf8');
      const hash = createHash('sha256').update(template);
      for (const resource of resources) {
        hash.update(resource.fileName).update('\0').update(resource.type === 'chunk' ? resource.code : resource.source).update('\0');
      }
      const source = template
        .replace("const PRECACHE_REVISION = 'development';", `const PRECACHE_REVISION = '${hash.digest('hex').slice(0, 16)}';`)
        .replace('const APP_SHELL_URLS = [];', `const APP_SHELL_URLS = ${JSON.stringify(resources.map(item => `/${item.fileName}`))};`);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}
