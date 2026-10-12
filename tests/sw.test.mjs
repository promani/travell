// The offline precache list in sw.js is kept by hand: make sure it is complete and points to real files.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers.mjs';

const src = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const core = [...src.slice(src.indexOf('const CORE'), src.indexOf('];', src.indexOf('const CORE'))).matchAll(/'([^']+)'/g)].map((m) => m[1]);

test('every precached file exists', () => {
  for (const f of core) if (f !== './') assert.ok(fs.existsSync(path.join(ROOT, f)), `missing ${f}`);
});

test('every app module and data file is precached', () => {
  const js = [...fs.readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js')).map((f) => `js/${f}`),
    ...fs.readdirSync(path.join(ROOT, 'js/views')).map((f) => `js/views/${f}`)];
  const data = fs.readdirSync(path.join(ROOT, 'data')).filter((f) => f.endsWith('.json')).map((f) => `data/${f}`);
  for (const f of [...js, ...data]) assert.ok(core.includes(f), `${f} is not in CORE (it would not work offline)`);
});
