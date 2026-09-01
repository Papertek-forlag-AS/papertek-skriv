/**
 * Leksihjelp — Embed Host Runtime (trelagsarkitekturen, fase 4)
 *
 * DEN eine delte chrome-API-emuleringa for alle vertar som embed-ar
 * leksihjelp utanfor den ekte extensionen (web-appen, lockdown, skriv).
 * Avløyser tre handskrivne shimmar som drifta kvar for seg:
 *   - backend/public/app/shim.js + inline-duplikatet i index.html
 *   - lockdown/public/js/leksihjelp-loader.js (1096 linjer)
 *   - skriv/public/js/leksihjelp-loader.js (279 linjer)
 *
 * Semantikk-fasiten er web-appens inline-shim, som bar dei hardt tilkjempa
 * detaljane:
 *   - chrome.storage.local.get UTELATER fråverande nøklar (aldri
 *     {key: undefined} — `'key' in res`-brukarar fekk «Behold ordet»-
 *     bugen av det).
 *   - onChanged-dispatch er ASYNKRON (setTimeout 0), som ekte chrome.
 *   - sendMessage: registrert handler for msg.type vinn (FETCH_TTS,
 *     SEND_REPORT, …); elles kringkastast til onMessage-lyttarane og
 *     resolvast {} — kringkastinga er det vocab-seamens lexi:hydration og
 *     LANGUAGE_CHANGED-flyten lever av i embed.
 *   - Kvar lyttar er try/catch-isolert (éin kastande lyttar skal ikkje
 *     svelte resten — lockdown-lærdom).
 *
 * SENTINEL-REGELEN (sjå .planning/2026-08-26-tre-lag-arkitektur.md):
 * chrome.runtime.id er DEFAULT FRÅVERANDE. Nærværet av id er signalet
 * vocab-seam.js brukar for å identifisere ekte extension — ein embed-vert
 * som set han, gjer at __lexiPresent='extension' blir publisert og at
 * t.d. skrivs bridge feilaktig yield-ar. `runtimeId` i konfig finst berre
 * som eksplisitt, dokumentert unntak (web-appen i påvente av fase 5-
 * avgjerda). check-host-runtime handhevar defaulten dynamisk.
 *
 * CAPABILITIES er eit FROSE nøkkelsett:
 *   { network, tts, report, policySource, identity }
 * policySource og identity er FØREBUDDE saumar (Geirs avgrensing
 * 2026-08-26): dei er alltid null i dag — lærarstyring og valfri
 * Leksihjelp-innlogging kjem seinare og skal då berre fylle saumane,
 * ikkje byggje om vertar. Ukjende nøklar kastar.
 *
 * Verts-lesarane frå fase 3 (__lexiExamModeReader, __lexiUiLangReader,
 * __lexiDetectVocabLoader) og fase 9-saumen __lexiVocabDataLoader (all
 * bundla vocab-datalast; kontrakten er resolve-null-aldri-reject, oppfylt
 * av dataSource.loadJson sin catch→null) blir installerte store-/
 * dataSource-bundne her, FØR vocab-seam.js lastar — så vocab-seamens
 * chrome-baserte defaults aldri treng slå inn i embed.
 *
 * Dual-eksport som resten av repoet: module.exports i Node,
 * self.__lexiHostRuntime i nettlesar. Den ekte extensionen lastar ALDRI
 * denne fila (check-embed-inventory handhevar fråvær frå manifest.json).
 */
(function () {
  'use strict';

  const CAPABILITY_KEYS = ['network', 'tts', 'report', 'policySource', 'identity'];
  const CAPABILITY_DEFAULTS = Object.freeze({
    network: false,
    tts: false,
    report: false,
    policySource: null,   // førebudd saum — lærarstyrte innstillingar (IKKJE implementert)
    identity: null,       // førebudd saum — valfri Leksihjelp-innlogging (IKKJE implementert)
  });

  /**
   * Minne-backa store med chrome.storage.local-semantikk — for vertar utan
   * eigen persistens-backend (skriv i dag). Same kontrakt som
   * backend/public/app/storage.js sin createLocalStore:
   *   - get UTELATER fråverande nøklar; objekt-form fyller inn defaults
   *   - set(undefined) = remove (poison-verdi-vernet)
   *   - subscribe(fn) får chrome-forma {key: {oldValue, newValue}}
   */
  function createMemoryStore(defaults) {
    const data = Object.assign({}, defaults || {});
    const subs = [];

    function fire(changes) {
      subs.forEach((fn) => { try { fn(changes); } catch (_) { /* isolert */ } });
    }

    return {
      get(keys) {
        if (keys == null) return Object.assign({}, data);
        if (typeof keys === 'string') {
          return (keys in data && data[keys] !== undefined) ? { [keys]: data[keys] } : {};
        }
        if (Array.isArray(keys)) {
          const out = {};
          keys.forEach((k) => { if (k in data && data[k] !== undefined) out[k] = data[k]; });
          return out;
        }
        const out = {};
        Object.keys(keys).forEach((k) => {
          out[k] = (k in data && data[k] !== undefined) ? data[k] : keys[k];
        });
        return out;
      },
      set(obj) {
        const changes = {};
        Object.keys(obj || {}).forEach((k) => {
          if (obj[k] === undefined) {
            if (k in data) { changes[k] = { oldValue: data[k], newValue: undefined }; delete data[k]; }
          } else {
            changes[k] = { oldValue: data[k], newValue: obj[k] };
            data[k] = obj[k];
          }
        });
        if (Object.keys(changes).length) fire(changes);
      },
      remove(key) {
        const keys = Array.isArray(key) ? key : [key];
        const changes = {};
        keys.forEach((k) => {
          if (k in data) { changes[k] = { oldValue: data[k], newValue: undefined }; delete data[k]; }
        });
        if (Object.keys(changes).length) fire(changes);
      },
      subscribe(fn) {
        subs.push(fn);
        return () => { const i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); };
      },
    };
  }

  /**
   * Bygg runtimen.
   *
   * @param {Object} config
   * @param {string} config.assetBase   — URL-prefiks for bundla ressursar
   *                                      (t.d. '/lexi' eller '/js/leksihjelp')
   * @param {string} [config.version]   — versjonsstreng; brukt av getManifest
   *                                      og (når sett) som ?v=-cache-buster
   * @param {Object} [config.store]     — {get,set,remove,subscribe} med
   *                                      chrome-semantikk; default: memory-store
   * @param {Object} [config.handlers]  — {MSG_TYPE: (msg) => resultat|Promise};
   *                                      typar med handler blir IKKJE kringkasta
   * @param {Function} [config.uiLang]  — () => språkkode; default 'nb'
   * @param {Object} [config.dataSource]— {loadJson(relPath) => Promise<json|null>};
   *                                      default: fetch(assetBase/relPath);
   *                                      MÅ resolve null ved feil — aldri
   *                                      rejecte eller kaste synkront
   *                                      (vocab-seam-kallstadene har inga catch)
   * @param {Object} [config.capabilities] — delmengd av det frosne settet;
   *                                      ukjende nøklar kastar
   * @param {string} [config.runtimeId] — SET ALDRI DENNE i ein embed-vert
   *                                      utan grunn dokumentert i planen
   *                                      (sentinel-regelen)
   * @returns {{ chrome, capabilities, store, install, uninstall,
   *             seedSettings, onSettingChange }}
   */
  function createHostRuntime(config) {
    if (!config || typeof config.assetBase !== 'string' || !config.assetBase) {
      throw new Error('[lexi-host-runtime] config.assetBase (string) er påkravd');
    }
    const assetBase = config.assetBase.replace(/\/+$/, '');
    // Versjonen kan vere streng ELLER funksjon: vertar som løyser versjonen
    // asynkront (web-appen les manifest.json etter at chrome må stå klar,
    // lockdown les __lexiBundleVersion frå bundle.js) treng live-oppslag —
    // getURL/getManifest les ved KALLTID, ikkje skapingstid.
    const versionOf = typeof config.version === 'function'
      ? () => String(config.version() || '')
      : () => String(config.version || '');
    const store = config.store || createMemoryStore();
    const handlers = config.handlers || {};
    const uiLang = typeof config.uiLang === 'function' ? config.uiLang : () => 'nb';

    // Capabilities: frose nøkkelsett, ukjende kastar.
    const capIn = config.capabilities || {};
    for (const k of Object.keys(capIn)) {
      if (!CAPABILITY_KEYS.includes(k)) {
        throw new Error('[lexi-host-runtime] ukjend capability «' + k + '» — det frosne settet er: ' + CAPABILITY_KEYS.join(', '));
      }
    }
    if (capIn.policySource != null || capIn.identity != null) {
      // Saumane er førebudde men IKKJE implementerte — ver høglydt heller
      // enn å late som noko verkar (Geirs avgrensing 2026-08-26).
      throw new Error('[lexi-host-runtime] policySource/identity er førebudde saumar og må vere null inntil vidare');
    }
    const capabilities = Object.freeze(Object.assign({}, CAPABILITY_DEFAULTS, capIn));

    const vq = () => { const v = versionOf(); return v ? '?v=' + encodeURIComponent(v) : ''; };

    const dataSource = config.dataSource || {
      loadJson(relPath) {
        try {
          if (typeof fetch !== 'function') return Promise.resolve(null);
          const clean = String(relPath).replace(/^\/+/, '');
          return fetch(assetBase + '/' + clean + vq())
            .then((r) => (r && r.ok ? r.json() : null))
            .catch(() => null);
        } catch (_) {
          return Promise.resolve(null);
        }
      },
    };

    const msgListeners = [];
    const changedListeners = [];
    const unsubscribeStore = store.subscribe((changes) => {
      // Asynkron dispatch som ekte chrome — kallarar som set-så-les skal
      // ikkje få onChanged midt i sitt eige kall.
      setTimeout(() => {
        changedListeners.forEach((fn) => { try { fn(changes, 'local'); } catch (_) { /* isolert */ } });
      }, 0);
    });

    // Sesjonslager: per-fane og ikkje-persistent — eit friskt objekt, ALDRI
    // alias av local (scratch skal ikkje lekke inn i persistert sett).
    const sessionStore = createMemoryStore();

    function promisified(result, cb) {
      if (typeof cb === 'function') cb(result);
      return Promise.resolve(result);
    }

    const chromeShim = {
      runtime: {
        lastError: null,
        getURL(path) {
          const clean = String(path).replace(/^\/+/, '');
          return assetBase + '/' + clean + vq();
        },
        getManifest() { return { version: versionOf() || 'unknown' }; },
        onMessage: {
          addListener(fn) { if (typeof fn === 'function') msgListeners.push(fn); },
          removeListener(fn) { const i = msgListeners.indexOf(fn); if (i >= 0) msgListeners.splice(i, 1); },
          hasListener(fn) { return msgListeners.indexOf(fn) !== -1; },
          // Syntetisk dispatch (shim.js-arva kontrakt): send til lyttarane
          // utan handler-runde — vertane brukar dette til AUTH_CHANGED o.l.
          _trigger(msg) {
            msgListeners.forEach((fn) => { try { fn(msg, {}, () => {}); } catch (_) { /* isolert */ } });
          },
        },
        sendMessage(msg, cb) {
          const handler = msg && msg.type && handlers[msg.type];
          if (handler) {
            return Promise.resolve()
              .then(() => handler(msg))
              .catch((e) => ({ error: true, status: 0, errorBody: e && e.message }))
              .then((v) => { if (typeof cb === 'function') cb(v); return v; });
          }
          // Kringkast til in-page-lyttarane (lexi:hydration, LANGUAGE_CHANGED …).
          return new Promise((resolve) => {
            setTimeout(() => {
              msgListeners.forEach((fn) => { try { fn(msg, {}, () => {}); } catch (_) { /* isolert */ } });
              if (typeof cb === 'function') cb({});
              resolve({});
            }, 0);
          });
        },
      },
      storage: {
        local: {
          get(keys, cb) { return promisified(store.get(keys == null ? null : keys), cb); },
          set(obj, cb) { store.set(obj || {}); return promisified(undefined, cb); },
          remove(keys, cb) { store.remove(keys); return promisified(undefined, cb); },
        },
        session: {
          get(keys, cb) { return promisified(sessionStore.get(keys == null ? null : keys), cb); },
          set(obj, cb) { sessionStore.set(obj || {}); return promisified(undefined, cb); },
          remove(keys, cb) { sessionStore.remove(keys); return promisified(undefined, cb); },
        },
        onChanged: {
          addListener(fn) { if (typeof fn === 'function') changedListeners.push(fn); },
          removeListener(fn) { const i = changedListeners.indexOf(fn); if (i >= 0) changedListeners.splice(i, 1); },
          // Syntetisk dispatch UTAN store-skriving (shim.js-arva kontrakt).
          // SYNKRON, i motsetnad til ekte store-endringar — kallarane
          // fyrer-og-gløymer og prior-art var synkron.
          _trigger(changes) {
            changedListeners.forEach((fn) => { try { fn(changes, 'local'); } catch (_) { /* isolert */ } });
          },
        },
      },
      i18n: {
        getUILanguage() { return uiLang(); },
      },
    };

    // Sentinel-regelen: id berre ved eksplisitt, dokumentert unntak.
    if (config.runtimeId) {
      chromeShim.runtime.id = config.runtimeId;
    }

    const host = typeof self !== 'undefined' ? self : globalThis;

    function install() {
      if (host.chrome && host.chrome.runtime && host.chrome.runtime.id && !config.runtimeId) {
        // Ein EKTE extension (eller ein annan shim med id) eig sida — å
        // overskrive her ville øydelagt sentinelen. Embed-verten skal
        // yielde, ikkje kjempe.
        throw new Error('[lexi-host-runtime] chrome.runtime.id finst alt på sida — nektar å overskrive (sentinel-regelen)');
      }
      host.chrome = chromeShim;

      // Verts-lesarane frå fase 3 — store-/dataSource-bundne, installerte
      // FØR vocab-seam.js lastar så dei chrome-baserte defaultane der
      // aldri treng slå inn i embed.
      host.__lexiExamModeReader = () =>
        chromeShim.storage.local.get(['examMode']).then((res) => !!(res && res.examMode));
      host.__lexiUiLangReader = () =>
        chromeShim.storage.local.get(['uiLanguage']).then((res) => (res && res.uiLanguage) || null);
      host.__lexiDetectVocabLoader = (lang) => dataSource.loadJson('data/' + lang + '.json');
      host.__lexiVocabDataLoader = (filename) => dataSource.loadJson('data/' + filename);

      // Publiser kontrakten til UI-koden. host-capabilities.js er lesaren;
      // utan denne linja ville capabilities vore eit felt ingen kunne sjå,
      // og verten måtte ha skjult daude flater med CSS i staden (lockdowns
      // Bilag A.1-CSS var nettopp det).
      host.__lexiCapabilities = capabilities;

      return chromeShim;
    }

    function uninstall() {
      if (host.chrome === chromeShim) delete host.chrome;
      if (host.__lexiCapabilities === capabilities) delete host.__lexiCapabilities;
      unsubscribeStore();
    }

    /** Frø innstillingar (t.d. språk frå vertens eigne settings). Hugs
     *  predictionEnabled-semantikken: undefined ≠ false — ikkje frø nøkkelen
     *  med mindre verdien skal vere true (spell-check gatar på `!== false`). */
    function seedSettings(obj) { store.set(obj || {}); }

    /** Abonner på éin nøkkel; returnerer unsubscribe. */
    function onSettingChange(key, fn) {
      const wrapped = (changes, area) => {
        if (area !== 'local' || !changes[key]) return;
        try { fn(changes[key].newValue, changes[key].oldValue); } catch (_) { /* isolert */ }
      };
      chromeShim.storage.onChanged.addListener(wrapped);
      return () => chromeShim.storage.onChanged.removeListener(wrapped);
    }

    return {
      chrome: chromeShim,
      capabilities,
      store,
      install,
      uninstall,
      seedSettings,
      onSettingChange,
    };
  }

  const api = { createHostRuntime, createMemoryStore, CAPABILITY_KEYS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiHostRuntime = api;
})();
