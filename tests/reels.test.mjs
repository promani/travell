// Reels: links shared from Instagram/TikTok are kept clean, and the MCP checks them like the app does.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installBrowserStubs } from './helpers.mjs';
import { readBase, resolveBatch } from '../server/tripdata.mjs';

installBrowserStubs();
globalThis.window = globalThis; globalThis.L = {};
const { reelUrl, platformOf } = await import('../js/views/reels.js');

test('the reel link is found in the shared text, without tracking parameters', () => {
  assert.equal(reelUrl('Mirá esto https://www.instagram.com/reel/DAbc123/?igsh=MWx0 genial'), 'https://www.instagram.com/reel/DAbc123/');
  assert.equal(reelUrl('https://vm.tiktok.com/ZMabc/?_t=8x&_r=1'), 'https://vm.tiktok.com/ZMabc/');
  assert.equal(reelUrl('https://example.com/x https://www.tiktok.com/@a/video/1'), 'https://www.tiktok.com/@a/video/1');
  assert.equal(reelUrl('https://youtube.com/shorts/x'), null);
  assert.equal(reelUrl(''), null);
  assert.equal(platformOf('https://instagram.com/p/x'), 'Instagram');
  assert.equal(platformOf('https://notinstagram.com/p/x'), null);
});

test('the MCP accepts a reel with or without a day, and rejects a bad day or link', () => {
  const base = readBase(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data'));
  const reel = (data) => resolveBatch(base, [{ op: 'put', col: 'resources', id: 'rl-x', data: { title: 'Fideos', kind: 'reel', url: 'https://www.instagram.com/reel/X/', ...data } }]);
  assert.ok(!reel({ dayId: null }).error);
  assert.ok(!reel({ dayId: 'd04' }).error);
  assert.match(reel({ dayId: 'd99' }).error, /no existe/);
  assert.match(reel({ url: 'https://example.com/x' }).error, /Instagram o TikTok/);
});
