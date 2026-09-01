import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { initLeksihjelpBridge } from '../public/js/app/leksihjelp-bridge.js';

function createFakeBridge(writingLang) {
  let currentWritingLang = writingLang;
  const writingListeners = new Set();
  const lookupListeners = new Set();
  const examListeners = new Set();
  const statusListeners = new Set();

  return {
    getWritingLang: () => currentWritingLang,
    getLookupLang: () => 'nb',
    getExamMode: () => false,
    getStatus: () => 'embedded',
    setWritingLang(lang) {
      currentWritingLang = lang;
      for (const listener of writingListeners) listener(lang);
    },
    setLookupLang() {},
    setExamMode() {},
    onWritingLangChange(listener) {
      writingListeners.add(listener);
      return () => writingListeners.delete(listener);
    },
    onLookupLangChange(listener) {
      lookupListeners.add(listener);
      return () => lookupListeners.delete(listener);
    },
    onExamModeChange(listener) {
      examListeners.add(listener);
      return () => examListeners.delete(listener);
    },
    onStatusChange(listener) {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
  };
}

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

test('destroy releases the active bridge from the embedded shim', () => {
  let boundBridge = null;
  let unboundBridge = null;
  globalThis.window = {
    location: { origin: 'https://skriv.papertek.app' },
    addEventListener() {},
    removeEventListener() {},
    __skrivLeksihjelpShim: {
      bindBridge: (bridge) => { boundBridge = bridge; },
      unbindBridge: (bridge) => { unboundBridge = bridge; },
    },
  };
  try {
    const bridge = initLeksihjelpBridge({ detectGraceMs: 1 });
    assert.equal(boundBridge, bridge);
    bridge.destroy();
    assert.equal(unboundBridge, bridge);
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

test('embedded host config rebinds to each document bridge instead of keeping stale language state', () => {
  // The loader is now a config around leksihjelp's shared embed runtime, so
  // the runtime has to be in the context first — exactly the order the
  // generated block in index.html loads them.
  const runtimeSource = readFileSync(
    new URL('../public/js/leksihjelp/embed/host-runtime.js', import.meta.url), 'utf8');
  const loaderSource = readFileSync(
    new URL('../public/js/leksihjelp-loader.js', import.meta.url), 'utf8');

  const context = vm.createContext({ console, queueMicrotask, setTimeout, Promise, Map, Set, URL });
  context.self = context;
  context.window = context;
  vm.runInContext(runtimeSource, context, { filename: 'embed/host-runtime.js' });
  vm.runInContext(loaderSource, context, { filename: 'leksihjelp-loader.js' });

  const shim = context.window.__skrivLeksihjelpShim;
  const setting = (key) => shim.runtime.store.get(key)[key];

  assert.equal(
    setting('personalizationEnabled'),
    false,
    'embedded Skriv must not expose ephemeral personalization controls',
  );
  assert.equal(
    context.chrome.runtime.id,
    undefined,
    'the host config must never claim to be a real extension',
  );

  const firstDocument = createFakeBridge('nn');
  const secondDocument = createFakeBridge('en');

  shim.bindBridge(firstDocument);
  assert.equal(setting('lang.spellcheck'), 'nn');

  shim.bindBridge(secondDocument);
  assert.equal(setting('lang.spellcheck'), 'en');

  firstDocument.setWritingLang('de');
  assert.equal(setting('lang.spellcheck'), 'en', 'old document must be detached');

  secondDocument.setWritingLang('es');
  assert.equal(setting('lang.spellcheck'), 'es');

  shim.unbindBridge(secondDocument);
  assert.equal(shim.isBound, false);
});
