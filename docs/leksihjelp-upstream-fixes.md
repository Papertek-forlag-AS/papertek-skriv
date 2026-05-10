# Prompt for the Leksihjelp-side AI Agent

> **STATUS: ✅ RESOLVED.** All three issues were fixed upstream in
> leksihjelp v3.0.9 (commits `c4ac7d3`, `8f5416c`, `62719ec`) and
> Skriv re-synced on 2026-05-10 (commit forthcoming this branch).
> The three Skriv-side workarounds have been removed:
>
> - `renderCaseGridFromRaw` → deleted (case grid now reads from the
>   wordList, which has all four cases since Issue 1's fix).
> - `grammarStorageAdapter` per-lang ↔ flat translator → simplified
>   to a value-from-wrapper passthrough (Issue 2 fix made the
>   translation unnecessary).
> - `isFeatureOn` lang-prefixed-only restriction → reverted; now
>   passes generic ids (`grammar_accusative_nouns` etc.) directly
>   to `__lexiVocab.isFeatureEnabled`, which delegates to
>   `buildFeaturePredicate` per Issue 3's fix.
>
> Verified post-sync: with Mye preset for German, searching "Hund"
> renders the case grid as Nominativ + Akkusativ + Dativ (Genitiv
> correctly hidden, since Mye doesn't include `grammar_de_genitiv`).
>
> The body below is preserved as a record of the diagnosis and fix
> for future reference.
>
> **What this was:** a self-contained briefing for the Claude session
> running inside the `Papertek-forlag-AS/leksihjelp` repo. While
> integrating leksihjelp into Skriv (see
> [docs/leksihjelp-integration.md](leksihjelp-integration.md)), the
> Skriv-side agent uncovered three upstream issues in leksihjelp v3.0.7
> (commit `ddeaf33fc6`) and worked around them locally. The fixes
> belong in leksihjelp so future Skriv re-syncs (and Lockdown
> re-syncs) inherit the correction without needing the workarounds.
>
> **For the leksihjelp AI:** read this end-to-end before changing
> anything. Each issue has a precise file + line reference, the
> reproducer Skriv uses, the Skriv-side workaround so you know what's
> currently absorbing the bug, and a verification step.

---

## Quick orientation

These bugs all involve the *grammar-features* pipeline — the Set of
enabled grammar feature ids that gates which forms appear in
`__lexiVocab.getWordList()` and which fields render in the dictionary
popup. The pipeline has three writers and three readers that must
agree on:

- **Storage shape** for `chrome.storage.local.enabledGrammarFeatures`
- **Feature ID namespace** (lang-prefixed vs generic)
- **The wrapper-vs-predicate gap** between
  `__lexiVocab.isFeatureEnabled` (membership only) and
  `buildFeaturePredicate` (membership + generic-to-lang fallback)

Three independent symptoms today, one underlying confusion.

---

## Issue 1 — `genericToLangMap` is missing the noun-case keys

**Severity:** high. Breaks the case grid in Skriv (and likely
Lockdown's noun renderer too) any time the user has *any* grammar
feature enabled.

### Reproducer

1. Install the extension; pick German as `lang.dictionary`.
2. In the Settings page, click the "Mye" preset (advanced) — 12
   features get written to `enabledGrammarFeatures.de`, including
   `grammar_de_akkusativ` and `grammar_de_dativ`.
3. Search "Hund" in the popup.
4. Look at the rendered case grid. It should show **Nominativ +
   Akkusativ + Dativ** (Genitiv excluded — Mye doesn't include it).
5. Observed: only **Nominativ** renders. Akkusativ and Dativ are
   missing even though those features ARE enabled.

(In Skriv we hit the same symptom: only the nominativ row appeared
in the search-result case grid. We worked around it by reading
`entry.cases.*` from the raw JSON instead of from the wordList — see
*Skriv-side workaround* below.)

### Root cause

`extension/content/vocab-seam-core.js`, around lines 514-520:

```js
if (bank === 'nounbank' && entry.cases) {
    for (const [caseName, caseData] of Object.entries(entry.cases)) {
        // Feature gating per case
        if (caseName === 'akkusativ' && !isFeatureEnabled('grammar_accusative_nouns')) continue;
        if (caseName === 'dativ'     && !isFeatureEnabled('grammar_dative'))           continue;
        if (caseName === 'genitiv'   && !isFeatureEnabled('grammar_genitiv'))          continue;
        ...
```

The wordList builder calls `isFeatureEnabled` with **generic** feature
ids: `grammar_accusative_nouns`, `grammar_dative`, `grammar_genitiv`.

The predicate it receives comes from
`extension/content/vocab-seam.js :: buildFeaturePredicate(lang)`,
around lines 108-117:

```js
const genericToLangMap = {
    'grammar_articles':    [`${langPrefix}genus`],
    'grammar_plural':      [`${langPrefix}flertall`, `${langPrefix}fleirtal`],
    'grammar_present':     [`${langPrefix}presens`],
    'grammar_preteritum':  [`${langPrefix}preteritum`],
    'grammar_perfektum':   [`${langPrefix}perfektum`],
    'grammar_imperativ':   [`${langPrefix}imperativ`],
    'grammar_comparative': [`${langPrefix}komparativ`],
    'grammar_superlative': [`${langPrefix}superlativ`],
};
```

The map covers tenses + comparison + articles + plural — but **not the
noun-case keys**. So when buildWordList asks `isFeatureEnabled('grammar_accusative_nouns')`:

1. Direct membership check: `enabledFeatures.has('grammar_accusative_nouns')` → false (we have `grammar_de_akkusativ`)
2. genericToLangMap lookup: undefined
3. Returns false → the akkusativ entries are stripped from the wordList

Same flow drops dativ + genitiv.

### Suggested fix

Extend `genericToLangMap` so the case keys map to the lang-prefixed
ids actually written to storage by the popup / preset pills.

```js
const genericToLangMap = {
    'grammar_articles':    [`${langPrefix}genus`],
    'grammar_plural':      [`${langPrefix}flertall`, `${langPrefix}fleirtal`],
    'grammar_present':     [`${langPrefix}presens`],
    'grammar_preteritum':  [`${langPrefix}preteritum`],
    'grammar_perfektum':   [`${langPrefix}perfektum`],
    'grammar_imperativ':   [`${langPrefix}imperativ`],
    'grammar_comparative': [`${langPrefix}komparativ`],
    'grammar_superlative': [`${langPrefix}superlativ`],
    // ── add: noun-case keys ──
    'grammar_accusative_nouns': [`${langPrefix}akkusativ`],
    'grammar_dative':           [`${langPrefix}dativ`],
    'grammar_genitiv':          [`${langPrefix}genitiv`],
};
```

Per-language sanity check before you ship:

| Generic id called by core | Map should resolve to |
|---------------------------|-----------------------|
| `grammar_accusative_nouns` | `grammar_de_akkusativ` |
| `grammar_dative` | `grammar_de_dativ` |
| `grammar_genitiv` | `grammar_de_genitiv` |

If Spanish or French use different per-lang keys for noun cases,
include those in the array (the predicate already does
`langIds.some(id => enabledFeatures.has(id))` so multiple targets
are fine).

### Verification

After the fix, reload the extension and:

1. Pick "Mye" preset for German.
2. `__lexiVocabCore.buildWordList(...)` (or just look at
   `__lexiVocab.getWordList().filter(e => e.baseWord === 'Hund' && e.type === 'case')`)
   should return the **full 16 case entries** (4 cases × 2 numbers ×
   2 articulation states), not just the 4 nominativ rows.
3. Pick "Lite" preset (no case features). The wordList should drop
   to just the 4 nominativ entries. Akkusativ/Dativ/Genitiv go away.
4. Pick "Alt" preset. All 16 case entries return.
5. Toggle Genitiv off in the checkbox tree → genitiv entries
   disappear within one re-hydration cycle.

### Skriv-side workaround already in place

Skriv reads the case grid from the **raw bundle JSON** (the seam's
`getWordList()` is now distrusted for case data). After your fix,
the workaround still works correctly but becomes redundant — Skriv
can revert to wordList-based case rendering. Leaving the workaround
in place is fine since its output is identical to the wordList path
once your fix lands.

Reference: `public/js/app/leksihjelp-settings.js` →
`renderCaseGridFromRaw(rawEntry)`.

---

## Issue 2 — `grammar-features-section.js` writes the wrong storage shape

**Severity:** high for downstream embedders. Lockdown and Skriv (any
host that mounts `__lexiGrammarFeaturesSection`) get an inconsistent
storage shape that breaks the seam's reader.

### Reproducer

In a host that uses `extension/popup/grammar-features-section.js`
(via `host.__lexiGrammarFeaturesSection.mount(...)`):

1. Click any grammar-feature checkbox.
2. Inspect `chrome.storage.local`:
   ```js
   chrome.storage.local.get('enabledGrammarFeatures', console.log);
   ```
   Output: `{ enabledGrammarFeatures: { grammar_de_akkusativ: true, ...} }`
3. Look at what `vocab-seam.js` then reads in `buildAndApply` (line 251-256):
   ```js
   const stored = await storageGet(['enabledGrammarFeatures']);
   if (stored.enabledGrammarFeatures && stored.enabledGrammarFeatures[lang]) {
       enabledFeatures = new Set(stored.enabledGrammarFeatures[lang]);
   } else {
       enabledFeatures = new Set();
   }
   ```
   `stored.enabledGrammarFeatures[lang]` is `undefined` (the shape is
   flat, not per-lang) → falls into the `else` → `enabledFeatures =
   new Set()` → predicate returns `() => true` → every grammar
   feature toggle is silently a no-op for the wordList filter.

Skriv hit this directly: every Grammatikknivå checkbox felt
"connected" (the UI updated, the storage wrote, the message fired)
but no observable change in dictionary results.

### Root cause

`extension/popup/grammar-features-section.js`, around lines 49-52:

```js
async function writeEnabledFeatures(storage, enabled) {
    const obj = {};
    for (const id of enabled) obj[id] = true;
    await storage.set({ enabledGrammarFeatures: obj });
}
```

This writes a **flat** `{ feature_id: true, ... }` object. Compare to
`extension/popup/popup.js` (around line 765-770), which writes
**per-language**:

```js
async function saveAndNotifyGrammarChange() {
    const stored = (await chromeStorageGet('enabledGrammarFeatures')) || {};
    stored[viewState.currentLang] = Array.from(enabledFeatures);
    await chromeStorageSet({ enabledGrammarFeatures: stored });
    ...
}
```

`vocab-seam.js` and `popup.js` agree on per-language. Only
`grammar-features-section.js` is flat.

### Suggested fix

Update `grammar-features-section.js` to read/write the canonical
per-language shape. The mount function already takes
`getCurrentLanguage` in `deps`, so the language is known.

```js
// readEnabledFeatures: extract the current lang's array.
async function readEnabledFeatures(storage, lang) {
    const stored = await storage.get('enabledGrammarFeatures');
    if (!stored || typeof stored !== 'object') return new Set();
    if (Array.isArray(stored[lang])) return new Set(stored[lang]);
    // Backward-compat: legacy flat shape from older builds.
    if (Array.isArray(stored)) return new Set(stored);
    if (Object.values(stored).some(v => v === true || v === 1)) {
        return new Set(Object.keys(stored).filter(k => stored[k] === true || stored[k] === 1));
    }
    return new Set();
}

// writeEnabledFeatures: merge the current lang's array into the per-lang object.
async function writeEnabledFeatures(storage, enabled, lang) {
    const stored = (await storage.get('enabledGrammarFeatures')) || {};
    const next = (stored && typeof stored === 'object' && !Array.isArray(stored)) ? { ...stored } : {};
    next[lang] = Array.from(enabled);
    await storage.set({ enabledGrammarFeatures: next });
}
```

Update both call sites in `mountGrammarFeaturesSection.render()` to
pass `lang`:

```js
const enabled = await readEnabledFeatures(storage, lang);
...
await writeEnabledFeatures(storage, enabled, lang);
```

### Verification

After the fix, in any host (Lockdown is the easy test case since
it's already wired):

1. Open the side panel grammar-features section.
2. Toggle a checkbox.
3. `chrome.storage.local.get('enabledGrammarFeatures', console.log)`
   should output `{ enabledGrammarFeatures: { de: ['grammar_de_akkusativ', ...], ... } }`
   — per-language, matching the popup writes.
4. The seam's `enabledFeatures` Set on the next `hydrateTarget` run
   should be non-empty and reflect the user's choice. Conjugation
   filtering should now work in lockdown's wordList consumers.

### Skriv-side workaround already in place

Skriv passes a translating storage adapter to
`grammar-features-section.mount(...)`. The adapter intercepts the
`enabledGrammarFeatures` key on read/write and converts between flat
(what the section module expects) and per-lang (what the seam
expects). After your fix, the adapter becomes a pass-through —
harmless to leave but no longer load-bearing.

Reference: `public/js/app/leksihjelp-settings.js` →
`grammarStorageAdapter`.

---

## Issue 3 — `__lexiVocab.isFeatureEnabled` and `buildFeaturePredicate` use different logic

**Severity:** medium. Embedders that consume `__lexiVocab.isFeatureEnabled`
get different answers than the wordList filter does. This is what
caused our debugging confusion — the wrapper said "true, akkusativ
is enabled" while the wordList stripped akkusativ entries.

### Reproducer

```js
// With Mye preset (grammar_de_akkusativ in storage):
__lexiVocab.isFeatureEnabled('grammar_de_akkusativ');     // → true (correct)
__lexiVocab.isFeatureEnabled('grammar_accusative_nouns'); // → false (WRONG — vocab-seam-core thinks this is enabled)
```

The wordList builder calls the **second** form (the generic id), and
gets false; an external consumer calls the first form (the
lang-prefixed id), and gets true. The two surfaces disagree on
identity.

### Root cause

`extension/content/vocab-seam.js`, around lines 493-496:

```js
isFeatureEnabled: (featureId) => {
    if (enabledFeatures.size === 0) return true;
    return enabledFeatures.has(featureId);
},
```

The wrapper checks **direct membership only**. It does not run
through `genericToLangMap`. The internally-built predicate (line 118)
does run through the map.

### Suggested fix

Use `buildFeaturePredicate` to mint the wrapper's `isFeatureEnabled`
too, so external callers see the same logic the wordList uses:

```js
// Replace the inline arrow with a delegation to the live predicate.
// We can't capture it once because enabledFeatures gets reassigned
// on every hydrateTarget, so build a thin wrapper that re-mints when
// language changes.
let _predicate = buildFeaturePredicate(BASELINE_LANG);
function refreshPredicate() {
    _predicate = buildFeaturePredicate(currentLang);
}
// Call refreshPredicate() at the end of buildAndApply (line 264)
// after `state = fresh;` so the wrapper always uses the current
// language's mapping.

// In the wrapper object:
isFeatureEnabled: (featureId) => _predicate(featureId),
```

After Issue 1's fix lands, this also auto-resolves the
case-id confusion: the wrapper would correctly return true for
both `grammar_accusative_nouns` (via genericToLangMap) and
`grammar_de_akkusativ` (via direct membership). Embedders can use
either id form and get the same answer.

### Verification

```js
// With Mye preset for German:
__lexiVocab.isFeatureEnabled('grammar_de_akkusativ');     // → true
__lexiVocab.isFeatureEnabled('grammar_accusative_nouns'); // → true  (after Issue 1 fix)

// Toggle Akkusativ off:
__lexiVocab.isFeatureEnabled('grammar_de_akkusativ');     // → false
__lexiVocab.isFeatureEnabled('grammar_accusative_nouns'); // → false
```

Both forms agree. Same for `grammar_dative` / `grammar_de_dativ`,
`grammar_genitiv` / `grammar_de_genitiv`, all tense pairs already
mapped.

### Skriv-side workaround already in place

Skriv calls `__lexiVocab.isFeatureEnabled('grammar_${lang}_${name}')`
exclusively (lang-prefixed only) and never the generic form. So
Skriv currently doesn't observe Issue 3 — but lockdown might. The
fix is still worth landing for symmetry.

Reference: `public/js/app/leksihjelp-settings.js` → `isFeatureOn(featureName)`.

---

## How to ship these fixes

Per the existing skriv-resync convention (see
`leksihjelp/.planning/skriv-adapter-contract.md`), tag the commits
with `[skriv-resync-needed]` so Skriv knows to re-pull. If lockdown
is also affected, double-tag with `[lockdown-resync-needed]`.

Suggested commit shape — separate commits per issue keeps the diff
reviewable:

1. `[skriv-resync-needed][lockdown-resync-needed] fix(seam): add noun-case keys to genericToLangMap`
2. `[skriv-resync-needed][lockdown-resync-needed] fix(grammar-features-section): write per-language storage shape`
3. `[skriv-resync-needed][lockdown-resync-needed] fix(seam): wrapper isFeatureEnabled uses buildFeaturePredicate`

After your commits land, Skriv runs `node scripts/sync-leksihjelp.js`
and ships its own follow-up commit removing the workarounds. The
workarounds are documented in
[docs/leksihjelp-integration.md](leksihjelp-integration.md) and in
the Skriv-side commit `2b62620` "Leksihjelp dictionary: Grammatikknivå
filters now apply live".

## Cross-repo paths summary

| What | Where |
|------|-------|
| Issue 1 — case keys missing | `extension/content/vocab-seam.js:108-117` |
| Issue 1 — wordList consumer | `extension/content/vocab-seam-core.js:517-519` |
| Issue 2 — flat shape writer | `extension/popup/grammar-features-section.js:40-52` |
| Issue 2 — per-lang shape reader | `extension/content/vocab-seam.js:251-256` |
| Issue 3 — wrapper predicate | `extension/content/vocab-seam.js:493-496` |
| Skriv integration doc | https://github.com/Papertek-forlag-AS/papertek-skriv/blob/main/docs/leksihjelp-integration.md |
| Skriv workarounds | https://github.com/Papertek-forlag-AS/papertek-skriv/blob/main/public/js/app/leksihjelp-settings.js |

Last updated: 2026-05-10 by the Skriv-side agent during integration
of leksihjelp v3.0.7 (commit `ddeaf33fc6`).
