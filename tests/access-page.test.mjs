import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// The Keihan Bus item transcribes the "京阪バスでお越しの方は" diagram: two bus stops, one campus stop.
const BUS = {
  'access/index.html': {
    title: '京阪バス',
    goal: '立命館大学（岩倉公園前）',
    rows: [['枚方市駅北口', '約45分'], ['阪急茨木', '約7分']],
    note: '※所要時間に乗り換え時間は含みません。',
  },
  'en/access/index.html': {
    title: 'Keihan Bus',
    goal: 'Ritsumeikan Univ. (Iwakura-koen-mae)',
    rows: [['Hirakata-shi N. Exit', 'about 45 min'], ['Hankyu Ibaraki', 'about 7 min']],
    note: 'Travel times do not include transfer time.',
  },
};

test('the access page ends its railway diagram with the Keihan Bus item, in both languages', () => {
  for (const [file, bus] of Object.entries(BUS)) {
    const html = read(file);
    const start = html.indexOf('<section class="route-group route-group--bus"');
    assert.ok(start > html.indexOf('route-group--monorail"'), `${file}: the bus group comes after the monorail group`);
    const end = html.indexOf('</section>', start);
    const group = html.slice(start, end);
    assert.match(group, new RegExp(`id="route-group-bus">${bus.title}</h3>`));
    assert.equal((group.match(/<li class="route">/g) || []).length, bus.rows.length);
    for (const [origin, minutes] of bus.rows) {
      assert.ok(group.includes(`<span class="route-origin">${origin}</span>`), `${file}: ${origin}`);
      assert.ok(group.includes(`<span class="route-leg">${minutes}</span>`), `${file}: ${minutes}`);
    }
    assert.equal((group.match(new RegExp(`class="route-goal route-goal--stop">${bus.goal.replace(/[()]/g, '\\$&')}</span>`, 'g')) || []).length, 2);
    // The diagram's own note about transfer time stays last and covers the bus rows too.
    assert.ok(html.indexOf(bus.note) > end, `${file}: the note stays under the bus group`);
    assert.equal((html.match(/route-map-note/g) || []).length, 1);
  }
});

test('the bus group has its own line color, taken from the diagram, and a campus-stop chip style', () => {
  const css = read('src/styles/pages.css');
  assert.match(css, /--line-bus: #9ac344;/);
  assert.match(css, /\.route-group--bus \{\s*--route-color: var\(--line-bus\);/);
  assert.match(css, /\.route-goal--stop \{/);
  // Same layout hooks as the other groups, so the narrow layouts need no special case.
  for (const lang of ['ja', 'en'])
    assert.equal((read(lang === 'ja' ? 'access/index.html' : 'en/access/index.html').match(/class="route-rows"/g) || []).length, 4);
});
