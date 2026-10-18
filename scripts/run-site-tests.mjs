import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('../', import.meta.url));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
// One entry point; finish independent stages even if a previous check failed.
const stages = [
  ['translation parity', ['run', 'check:en']],
  ['canonical search data', ['run', 'check:search-data']],
  ['page/action inventory', ['run', 'test:inventory']],
  ['unit/regression tests', ['test']],
  ['built-site browser tests', ['run', 'test:e2e', '--', ...process.argv.slice(2)]],
];
const results = [];
for (const [label, args] of stages) {
  console.log(`\n[site-test] ${label}`);
  const status = await new Promise(resolve => {
    const child = spawn(npm, args, { cwd, stdio: 'inherit', env: process.env });
    const onSignal = signal => child.kill(signal);
    const interrupt = () => onSignal('SIGINT');
    process.once('SIGINT', interrupt);
    child.once('error', error => { console.error(error.message); resolve(1); });
    child.once('exit', (code, signal) => {
      process.removeListener('SIGINT', interrupt);
      resolve(signal ? 130 : code ?? 1);
    });
  });
  results.push({ stage: label, status });
  if (status === 130) break;
}
console.table(results);
process.exitCode = results.some(result => result.status !== 0) ? 1 : 0;
