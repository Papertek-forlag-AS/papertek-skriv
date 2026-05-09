# Spell-check rule registry (INFRA-03, Phase 3)

Plugin registry of spell-check rules. Each rule is a self-contained IIFE
file that pushes `{ id, languages, priority, check, explain }` onto
`self.__lexiSpellRules`. The runner in `spell-check-core.js` iterates this
array — adding a new rule does NOT require editing core.

## How to add a rule

1. Create `extension/content/spell-rules/nb-{id}.js`. The IIFE pushes the rule
   object onto `self.__lexiSpellRules`.
2. Add the file to `extension/manifest.json` `content_scripts[0].js` AFTER
   `content/spell-check-core.js` and BEFORE `content/spell-check.js`.
3. No edit to `scripts/check-fixtures.js` is needed — it `readdirSync()`s this
   directory in alphabetical order, so the new file is auto-discovered.

## Priority semantics

Lower priority value = runs first. `dedupeOverlapping` keeps the
earliest-listed finding when two rules cover overlapping spans. Current
priorities (preserved from the pre-INFRA-03 inline order):

| Rule           | Priority | Rule ID       |
| -------------- | -------- | ------------- |
| gender         | 10       | `gender`      |
| modal-verb     | 20       | `modal_form`  |
| sarskriving    | 30       | `sarskriving` |
| typo (curated) | 40       | `typo`        |
| typo (fuzzy)   | 50       | `typo`        |

Reordering changes which finding wins on overlapping spans. Do not change
priorities without a full `npm run check-fixtures` pass.

## Dual-load guard (Pitfall 1)

Every rule file's IIFE preamble MUST begin with:

```javascript
const host = typeof self !== 'undefined' ? self : globalThis;
host.__lexiSpellRules = host.__lexiSpellRules || [];
```

This makes the rule register correctly under BOTH the browser content-script
load (where `self` is the global object) AND Node `require()` from
`scripts/check-fixtures.js` (where `global.self` is set by the runner).
Forgetting the guard yields a silent registration failure on the Node side:
the fixture runner reports vacuous "0 fp 0 fn, F1=1.000" results because no
rules are registered. Fatal silent failure mode.

## Shared helpers

Rule files reuse helpers exposed on `self.__lexiSpellCore` — do NOT redeclare
them inside rules:

`tokenize`, `editDistance`, `matchCase`, `dedupeOverlapping`,
`sharedPrefixLen`, `sharedSuffixLen`, `isAdjacentTransposition`,
`isLikelyProperNoun`, `scoreCandidate`, `findFuzzyNeighbor`.

The fuzzy rule (`nb-typo-fuzzy.js`) is the host for Plan 03's Zipf tiebreaker
(SC-01). Phase 4 will add SC-02/03/04 as new rule files here without touching
core.

## Severity contract — priority bands (Phase 6)

Every rule MUST declare a `severity` field. The `check-explain-contract`
gate enforces this at release time. Three tiers:

| Tier | Severity    | Visual treatment                                  | Popover prefix |
|------|-------------|---------------------------------------------------|----------------|
| P1   | `'error'`   | 3px solid red-family dot (per-rule colour)        | Feil --        |
| P2   | `'warning'` | 3px solid amber/orange dot (`.lh-spell-warn`)     | Usikker --     |
| P3   | `'hint'`    | Grey dotted underline, word-width (`.lh-spell-hint`) | Kanskje --  |

All v1.0 rules ship as `severity: 'error'`. Phase 6 Plan 03 introduces
the first `'warning'` and `'hint'` rules.

The DOM adapter in `spell-check.js` maps `finding.severity` to the
correct CSS suffix (`-warn` / `-hint` / base). The core runner in
`spell-check-core.js` stamps `rule.severity` onto each finding
automatically; rules do not need to set it on individual findings.

### CSS wiring for severity tiers

`check-rule-css-wiring` validates that every rule id has a CSS binding
AND that the tier-level CSS classes (`.lh-spell-warn`, `.lh-spell-hint`)
exist in `content.css`. Per-rule colour bindings still use the base
`.lh-spell-<id>` class; the severity class is additive.

## Phase 13: Document-state seam shape (forward documentation)

No code change until Phase 13 lands. The following contract is agreed:

- `kind: 'document'` — rule type for document-state rules (distinct from token-level `kind: 'token'` default)
- `checkDocument(ctx, findings)` signature — receives full ctx plus all token-level findings; returns additional document-level findings
- Priority 200+ — runs after ALL token-level rules complete
- Invalidation protocol: content-hash keyed, never module-level mutable state
- Rules: DOC-01 (DE du/Sie drift), DOC-02 (FR tu/vous drift), DOC-03 (NB bokmaal/riksmaal mixing), DOC-04 (NN a/e-infinitiv mixing)

## Structural suppression — `ctx.suppressedFor.structural` (Phase 6)

The quotation-suppression pre-pass (priority 3) populates
`ctx.suppressedFor.structural: Set<tokenIndex>` with token indices
that fall inside matched quote pairs (`"..."`, guillemets, etc.).

**Who populates:**
- `quotation-suppression.js` (priority 3) -- marks tokens inside quotes.

**Who honors (future):**
- Structural/register rules (priority 60+) check
  `ctx.suppressedFor.structural.has(i)` before flagging.

**Who does NOT honor (intentional):**
- Token-local grammar rules (priority 10-55) do NOT check
  `ctx.suppressedFor.structural`. They only check `ctx.suppressed`.
  A gender mismatch inside a quote is still a gender mismatch.

**Convention:** `ctx.suppressedFor` is an object with named sets for
different suppression reasons. Currently only `structural` exists.
Future pre-passes may add `register`, `technical`, etc.

## Suppression convention — `ctx.suppressed` (Phase 4)

Pre-pass rules (priority 1-9) populate `ctx.suppressed: Set<tokenIndex>`.
Finding-emitting rules (priority >= 10) honor the set by checking it inside
their per-token loop:

```javascript
if (ctx.suppressed && ctx.suppressed.has(i)) continue;
```

**Who populates:**
- `nb-codeswitch.js` (priority 1) — adds every token index inside a dense
  unknown-to-NB-AND-NN window.
- `nb-propernoun-guard.js` (priority 5) — adds name spans, all-caps tokens,
  hyphenated compounds, and curated loan words.

**Who honors:**
- `nb-typo-curated.js` (priority 40), `nb-typo-fuzzy.js` (priority 50),
  `nb-sarskriving.js` (priority 30). Each has a single opt-in line near
  the top of its per-token loop.

**Who does NOT honor (intentional):**
- `nb-gender.js` (priority 10), `nb-modal-verb.js` (priority 20). These
  fire on real-grammar patterns (article-mismatch, modal+finite-verb);
  they should still fire inside code-switched spans or near proper nouns
  if the grammar pattern matches Norwegian structure.

**Rule:** `ctx.suppressed` is STRICTLY ADDITIVE. Rules may `.add(i)` but
MUST NOT `.delete(i)`. A rule that wants a token-specific exemption from
another rule's suppression should check the token against its OWN predicate
at decision time instead of modifying the shared set.

**Priority range reservation:**
- 1-9: pre-pass concerns that mutate `ctx.suppressed` (and emit no findings).
- 10+: rules that emit findings.

The runner in `spell-check-core.js` initializes `ctx.suppressed = new Set()`
before any rule runs, so every rule can trust `ctx.suppressed instanceof Set`.

## Explain contract — `explain: { nb, nn }` callable (Phase 5 / UX-01)

Plan 05-02 upgrades the rule shape from a single static string to a
finding-aware callable that returns per-register copy:

```javascript
// Before (Phase 3):
explain: 'Kjent skrivefeil — slå opp i ordboken.',

// After (Phase 5):
explain: (finding) => ({
  nb: `<em>${escapeHtml(finding.original)}</em> er en vanlig skrivefeil — prøv <em>${escapeHtml(finding.fix)}</em>.`,
  nn: `<em>${escapeHtml(finding.original)}</em> er ein vanleg skrivefeil — prøv <em>${escapeHtml(finding.fix)}</em>.`,
}),
```

Static copy (copy that doesn't interpolate any finding field) is supported
by wrapping the string in an arrow lambda that ignores the argument:

```javascript
explain: () => ({
  nb: 'Artikkel og substantiv må ha samme kjønn.',
  nn: 'Artikkel og substantiv må ha same kjønn.',
}),
```

The renderer in `spell-check.js` picks `nb` or `nn` based on the finding's
document language. Both registers MUST be non-empty strings.

### Pitfall 1 — priority disambiguation for shared rule IDs

`nb-typo-curated.js` (priority 40) and `nb-typo-fuzzy.js` (priority 50) BOTH
emit `rule_id: 'typo'`. The popover renderer picks which `explain()` to call
by matching BOTH `rule_id` AND `priority` on the finding. Starting in Plan
05-02, every emitted finding MUST carry `priority: <rule.priority>` so the
renderer can disambiguate:

```javascript
out.push({
  rule_id: 'typo',
  priority: 40,              // ← mirrors rule.priority, required from Plan 05-02 onwards
  start: t.start,
  end: t.end,
  original: t.display,
  fix: matchCase(t.display, correct),
  message: `Skrivefeil: "${t.display}" → "${correct}"`,
});
```

Rules that don't share `rule_id` with another rule still set the field —
it's a convention, not a conditional. Omitting it silently routes the
renderer to whichever rule happens to appear first in the registry, which
is a race condition.

### XSS-escape rule — `escapeHtml` is mandatory inside `<em>`

Any interpolation of a user-typed token (e.g., `finding.original`,
`finding.fix`, `finding.message`) inside HTML output — including inside
`<em>` wrappers — MUST go through `escapeHtml` exported on
`self.__lexiSpellCore`. Users paste arbitrary content; without escaping, a
pasted `<script>` token becomes a script-execution surface.

```javascript
// ✓ DO — pull escapeHtml from the core surface, escape every interpolated token
const host = typeof self !== 'undefined' ? self : globalThis;
const { escapeHtml } = host.__lexiSpellCore || {};
const rule = {
  explain: (f) => ({
    nb: `<em>${escapeHtml(f.original)}</em> er feil — prøv <em>${escapeHtml(f.fix)}</em>.`,
    nn: `<em>${escapeHtml(f.original)}</em> er feil — prøv <em>${escapeHtml(f.fix)}</em>.`,
  }),
};

// ✗ DON'T — direct template interpolation is an XSS surface
const rule = {
  explain: (f) => ({
    nb: `<em>${f.original}</em> er feil.`,
    nn: `<em>${f.original}</em> er feil.`,
  }),
};
```

The `escapeHtml` helper in `spell-check-core.js` is the Node-safe version
(String.replace, not `document.createElement`) so it works in both the
browser and the Node fixture harness.

### Suppression rules are exempt from the callable contract

`nb-codeswitch.js` (priority 1) and `nb-propernoun-guard.js` (priority 5)
never surface to the popover — they emit `return []` and only mutate
`ctx.suppressed`. Their existing string `explain` stays untouched; the
contract gate excludes them.

### CI enforcement

`npm run check-explain-contract` — must exit 0 on every release. Loads each
of the 5 popover-surfacing rule files (`nb-gender`, `nb-modal-verb`,
`nb-sarskriving`, `nb-typo-curated`, `nb-typo-fuzzy`) and asserts
`typeof rule.explain === 'function'` and that calling it returns an object
with non-empty `nb` and `nn` string keys. Paired self-test
`npm run check-explain-contract:test` plants a broken explain, verifies the
gate fires, restores, verifies it passes — belt-and-braces against regex
drift making the gate silently permissive (same pattern as
`check-network-silence:test` from Plan 03-05).
