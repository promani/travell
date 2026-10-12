// Minimal browser stand-ins so the app's ES modules can run under node:test.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function installBrowserStubs() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    key: (i) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  };
  Object.defineProperty(globalThis.localStorage, Symbol.iterator, { value: () => store.keys() });
  globalThis.location = { search: '', href: 'http://localhost/index.html', origin: 'http://localhost', pathname: '/index.html', hash: '' };
  globalThis.fetch = async (url) => {
    const file = path.join(ROOT, String(url));
    if (!fs.existsSync(file)) return { ok: false, status: 404, json: async () => null };
    return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) };
  };
  return store;
}
