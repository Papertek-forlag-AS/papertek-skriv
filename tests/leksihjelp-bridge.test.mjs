import test from 'node:test';
import assert from 'node:assert/strict';
import { initLeksihjelpBridge } from '../public/js/app/leksihjelp-bridge.js';

test('requestExtensionPanel posts the cross-repo open-panel message', () => {
  const posted = [];
  globalThis.window = {
    location: { origin: 'https://skriv.papertek.app' },
    postMessage: (msg, origin) => posted.push({ msg, origin }),
    addEventListener() {},
    removeEventListener() {},
  };
  try {
    // detectGraceMs: 1 keeps any lingering detect timer trivial even if the
    // assertion throws before destroy() runs (RED phase).
    const bridge = initLeksihjelpBridge({ detectGraceMs: 1 });
    bridge.requestExtensionPanel();
    bridge.destroy();
    assert.equal(posted.length, 1);
    assert.deepEqual(posted[0].msg, {
      type: 'skriv:leksihjelp:openPanel',
      source: 'skriv',
    });
    assert.equal(posted[0].origin, 'https://skriv.papertek.app');
  } finally {
    delete globalThis.window;
  }
});

test('detectStatus yields to extension via data-lexi-present DOM attribute (isolated-world fix)', async () => {
  // Extension content script runs in the isolated world, so window.__lexiPresent
  // does NOT cross to Skriv's main world — only the shared-DOM attribute does.
  globalThis.window = { location: { origin: 'https://skriv.papertek.app' }, addEventListener() {}, removeEventListener() {} };
  globalThis.document = { documentElement: { getAttribute: (k) => (k === 'data-lexi-present' ? 'extension' : null) } };
  try {
    const bridge = initLeksihjelpBridge({ detectGraceMs: 5 });
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(bridge.getStatus(), 'extension', 'must yield to the extension via the DOM attribute');
    bridge.destroy();
  } finally { delete globalThis.window; delete globalThis.document; }
});

test('detectStatus reports embedded (not extension) when DOM attribute absent but vendored seam present', async () => {
  globalThis.window = { location: { origin: 'https://skriv.papertek.app' }, addEventListener() {}, removeEventListener() {}, __lexiVocab: {} };
  globalThis.document = { documentElement: { getAttribute: () => null } };
  try {
    const bridge = initLeksihjelpBridge({ detectGraceMs: 5 });
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(bridge.getStatus(), 'embedded', 'standalone Skriv (no extension attribute) stays embedded');
    bridge.destroy();
  } finally { delete globalThis.window; delete globalThis.document; }
});
