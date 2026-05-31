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
