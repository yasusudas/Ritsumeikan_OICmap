import { build } from 'vite';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, symlink, realpath } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const root = process.cwd(), output = resolve('output/version31-combined-safari-2026-10-24');
await mkdir(output, { recursive: true });
const git = (...args) => execFileSync('git', ['-c', 'core.fsmonitor=false', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
assert.equal(git('branch', '--show-current'), 'Version3.1');
const commit = 'cb403e0a0c882b0de79ae0182a3a98988f9097e4';
const exported = await realpath(await mkdtemp('/tmp/oic-version31-dev-'));
execFileSync('tar', ['-x', '-C', exported], { input: execFileSync('git', ['archive', commit], { maxBuffer: 128 * 1024 * 1024 }) });
await symlink(join(root, 'node_modules'), join(exported, 'node_modules'));
const baseline = '/tmp/oic-version31-comparison-dev', candidate = '/tmp/oic-version31-comparison-current';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const source = await readFile('src/main.js');
await build({ root: exported, configFile: join(exported, 'vite.config.js'), build: { outDir: baseline, manifest: true, emptyOutDir: true } });
await build({ root, configFile: join(root, 'vite.config.js'), build: { outDir: candidate, manifest: true, emptyOutDir: true } });
assert.equal(sha(source), sha(await readFile('src/main.js')));
const a = JSON.parse(await readFile(join(baseline, '.vite/manifest.json'), 'utf8'));
const b = JSON.parse(await readFile(join(candidate, '.vite/manifest.json'), 'utf8'));
const images = [];
for (const [key, asset] of Object.entries(a)) {
  const raw = key.match(/^src\/assets\/floors\/(ja|en)\/([^/]+)\.svg$/), food = key.match(/^_food-map-(ja|en)-/);
  if (!raw && !food) continue;
  const counterpart = raw ? b[key] : Object.entries(b).find(([name]) => name.startsWith(`_food-map-${food[1]}-`))?.[1];
  assert.ok(counterpart, key);
  const before = await readFile(join(baseline, asset.file)), after = await readFile(join(candidate, counterpart.file));
  images.push({ source: key, file: asset.file, candidateFile: counterpart.file, language: raw?.[1] ?? food[1], floor: raw?.[2] ?? '1F-viewer',
    baselineSha256: sha(before), candidateSha256: sha(after), baselineBytes: before.length, candidateBytes: after.length });
}
assert.equal(images.length, 18);
const evidence = { baselineCommit: commit, candidateHead: git('rev-parse', 'HEAD'), branch: 'Version3.1',
  candidateWorkingTree: git('status', '--short'), exported, baseline, candidate, candidateMainSha256: sha(source), images,
  note: 'Actual Version3.1 working tree, including its existing GPS/offline/UI changes; not a three-change-only causal control.',
  builtAt: new Date().toISOString() };
await writeFile(join(output, 'build-evidence.json'), JSON.stringify(evidence, null, 2));
await writeFile(join(output, 'candidate-main.js'), source);
await writeFile(join(output, 'candidate-working-tree.patch'), git('diff') + '\n');
console.log(JSON.stringify({ baseline, candidate, images: images.length, output }));
