#!/usr/bin/env node
/**
 * sync-leksihjelp.js — vendor the leksihjelp content scripts + vocab data
 * into Skriv's public/js/leksihjelp/ tree.
 *
 * Skriv embeds a SUBSET of leksihjelp (dictionary + spell-check) as a built-in
 * fallback when the leksihjelp Chrome extension isn't installed on
 * skriv.papertek.app. See docs/leksihjelp-integration.md for the integration
 * model and the seam contract.
 *
 * What this script does:
 *   1. Wipes public/js/leksihjelp/ before each run so files renamed/deleted
 *      upstream don't linger as stale leftovers (Phase 43 renamed several
 *      content scripts; the lockdown sibling repo learned this lesson the
 *      hard way).
 *   2. Copies the subset listed in FILE_INVENTORY into public/js/leksihjelp/.
 *      Engine + renderer pairs (Phase 43) ship together; spell-rules/ ships
 *      whole.
 *   3. Vocab JSONs (de/es/fr/en/nb/nn) — strips the per-entry `audio` field
 *      (~17 MB across 6 langs) since Skriv has no MP3 playback path; writes
 *      minified JSON to keep the bundle compact.
 *   4. CSS scoping — wraps every selector in styles/content.css under a
 *      `.skriv-leksihjelp` parent so the vendored stylesheet doesn't collide
 *      with Skriv's existing UI. Output goes to
 *      public/js/leksihjelp/styles/leksihjelp.css.
 *   5. Writes public/js/leksihjelp/.version with the upstream version,
 *      commit SHA, and sync timestamp.
 *   6. Prints a summary table.
 *
 * Vocab loading model: BUNDLED, NOT runtime-fetched. Phase 40.2 of leksihjelp
 * forbids runtime API fetch (release gate `check-no-vocab-fetch`). Skriv
 * matches that architecture: data/<lang>.json files ship inside Skriv's
 * static bundle and are read by vocab-seam.js via fetch('/js/leksihjelp/data/...').
 * No dependency on papertek-vocabulary.vercel.app at runtime.
 *
 * Usage:
 *   node scripts/sync-leksihjelp.js
 *   LEKSIHJELP_REPO_PATH=/abs/path/to/leksihjelp node scripts/sync-leksihjelp.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const destDir = path.join(root, 'public', 'js', 'leksihjelp');

// ── Locate the leksihjelp source tree ─────────────────────────────────

function findSource() {
    const candidates = [
        process.env.LEKSIHJELP_REPO_PATH,
        path.resolve(root, '..', 'leksihjelp'),
        path.resolve(root, '..', '..', 'leksihjelp'),
        path.join(root, 'node_modules', '@papertek', 'leksihjelp'),
    ].filter(Boolean);

    for (const p of candidates) {
        if (fs.existsSync(path.join(p, 'extension', 'content'))) {
            return p;
        }
    }
    return null;
}

const srcRoot = findSource();
if (!srcRoot) {
    console.error('[sync-leksihjelp] No leksihjelp source found. Set LEKSIHJELP_REPO_PATH or check out a sibling clone.');
    process.exit(1);
}
console.log('[sync-leksihjelp] Source:', srcRoot);

// Read upstream version + commit SHA for the .version pin.
let upstreamVersion = 'unknown';
let upstreamCommit = 'unknown';
try {
    upstreamVersion = JSON.parse(
        fs.readFileSync(path.join(srcRoot, 'extension', 'manifest.json'), 'utf8')
    ).version;
} catch (_) {}
try {
    upstreamCommit = execSync('git rev-parse HEAD', { cwd: srcRoot }).toString().trim();
} catch (_) {}

// ── File inventory ─────────────────────────────────────────────────────
//
// Skriv vendors a SUBSET — dictionary + spell-check, no floating widget,
// no word prediction, no audio. Engine/renderer pairs (Phase 43) ship
// together. Inventory mirrors the integration doc §4 with these
// adjustments for current leksihjelp reality:
//   - spell-check.js → spell-check-renderer.js + spell-check-engine.js
//   - word-prediction.js / prediction-renderer.js: NOT vendored (extension only)
//   - floating-widget.js: NOT vendored (extension only)
//   - vocab-store.js: NOT vendored (Phase 40.2 made it extension-only;
//     Skriv ships data/ files in the bundle and reads them directly)
//   - exam-registry.js + lang-detect.js: vendored
//   - popup/views/: NOT vendored — Skriv writes its own popup using
//     dict-state-builder.js's pure VM (per integration doc §4)

// Files copied verbatim. Source paths relative to srcRoot/extension/.
const FILE_INVENTORY = [
    // i18n strings
    'i18n/strings.js',

    // Content seam — pure index builder + hydration policy
    'content/vocab-seam-core.js',
    'content/vocab-seam.js',
    'content/lang-detect.js',

    // Spell-check — engine/renderer pair (Phase 43 split)
    'content/spell-check-core.js',
    'content/spell-check-engine.js',
    'content/spell-check-renderer.js',

    // Exam-mode registry — Skriv's settings panel surfaces it
    'exam-registry.js',

    // Popup pure logic — Skriv consumes dict-state-builder's view-model
    // and renders with its own DOM. grammar-features-section is a small
    // self-contained checkbox renderer Skriv re-uses inside its drawer.
    'popup/dict-state-builder.js',
    'popup/grammar-features-section.js',
];

// Spell-rules: copy whole directory.
const SPELL_RULES_DIR = 'content/spell-rules';

// Vocab data — bundled into Skriv. Audio stripped, minified.
const VOCAB_LANGS = ['de', 'es', 'fr', 'en', 'nb', 'nn'];

// Other data files (grammarfeatures-*, bigrams-*, baselines, pitfalls) copy
// verbatim — they don't carry audio metadata.
const DATA_PASSTHROUGH_PATTERNS = [
    /^grammarfeatures-(de|es|fr|en|nb|nn)\.json$/i,
    /^bigrams-(de|es|fr|en|nb|nn)\.json$/i,
    /^nb-baseline\.json$/i,
    /^pitfalls-en\.json$/i,
];

// ── Helpers ────────────────────────────────────────────────────────────

function ensureDir(p) {
    fs.mkdirSync(p, { recursive: true });
}

function copyFile(src, dest) {
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
    return fs.statSync(dest).size;
}

function copyDirRecursive(src, dest) {
    if (!fs.existsSync(src)) return 0;
    let bytes = 0;
    ensureDir(dest);
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const sp = path.join(src, entry.name);
        const dp = path.join(dest, entry.name);
        if (entry.isDirectory()) bytes += copyDirRecursive(sp, dp);
        else bytes += copyFile(sp, dp);
    }
    return bytes;
}

// Recursively strip the `audio` key from any object in the JSON tree.
function stripAudio(o) {
    if (Array.isArray(o)) return o.map(stripAudio);
    if (o && typeof o === 'object') {
        const out = {};
        for (const k of Object.keys(o)) {
            if (k === 'audio') continue;
            out[k] = stripAudio(o[k]);
        }
        return out;
    }
    return o;
}

// CSS scoping — prefix every top-level rule selector with `.skriv-leksihjelp `.
// Conservative regex: only touch selectors that aren't @media/@keyframes
// declarations and aren't already inside a nested block. This is a
// best-effort transform; if a selector list contains commas, each part is
// independently prefixed.
function scopeCss(input, prefix) {
    // Split into top-level rules. We respect brace nesting; @media / @keyframes
    // blocks recurse one level (their inner rules also get scoped).
    let out = '';
    let i = 0;
    const n = input.length;

    function scopeSelectorList(sel) {
        // Each comma-separated selector. Skip pure @-keyword "selectors".
        return sel.split(',').map(s => {
            const t = s.trim();
            if (!t) return s;
            if (t.startsWith(prefix)) return s; // idempotent
            // @keyframes inner stops (0%, from, to) shouldn't be prefixed —
            // those don't appear at this level (they're inside @keyframes
            // bodies). Pseudo-elements / chained classes get prefixed too.
            return s.replace(/^(\s*)/, `$1${prefix} `);
        }).join(',');
    }

    function readBlock(startIdx) {
        // startIdx points at '{'. Return [endIdx (after matching '}'), bodyText].
        let depth = 0;
        let j = startIdx;
        for (; j < n; j++) {
            const ch = input[j];
            if (ch === '{') depth++;
            else if (ch === '}') {
                depth--;
                if (depth === 0) { j++; break; }
            }
        }
        return [j, input.slice(startIdx, j)];
    }

    while (i < n) {
        // Skip whitespace + comments.
        while (i < n && /\s/.test(input[i])) { out += input[i++]; }
        if (i >= n) break;
        if (input.startsWith('/*', i)) {
            const end = input.indexOf('*/', i + 2);
            if (end === -1) { out += input.slice(i); break; }
            out += input.slice(i, end + 2);
            i = end + 2;
            continue;
        }
        // Read selector / at-rule prelude up to '{' or ';'.
        let preludeEnd = i;
        while (preludeEnd < n && input[preludeEnd] !== '{' && input[preludeEnd] !== ';') preludeEnd++;
        const prelude = input.slice(i, preludeEnd);

        if (preludeEnd >= n) { out += prelude; break; }

        if (input[preludeEnd] === ';') {
            // @import, @charset etc. — copy verbatim.
            out += prelude + ';';
            i = preludeEnd + 1;
            continue;
        }

        // We're at a '{'. Read the block.
        const [blockEnd, blockText] = readBlock(preludeEnd);

        const trimmed = prelude.trim();
        if (trimmed.startsWith('@media') || trimmed.startsWith('@supports') || trimmed.startsWith('@layer')) {
            // Recurse into the inner rules.
            const inner = blockText.slice(1, -1); // strip outer braces
            const scopedInner = scopeCss(inner, prefix);
            out += prelude + '{' + scopedInner + '}';
        } else if (trimmed.startsWith('@keyframes') || trimmed.startsWith('@font-face') || trimmed.startsWith('@page')) {
            // Don't scope inner stops/declarations.
            out += prelude + blockText;
        } else {
            out += scopeSelectorList(prelude) + blockText;
        }
        i = blockEnd;
    }
    return out;
}

// ── Wipe + sync ────────────────────────────────────────────────────────

if (fs.existsSync(destDir)) {
    fs.rmSync(destDir, { recursive: true, force: true });
}
ensureDir(destDir);

const summary = [];
let totalBytes = 0;

// 1. Whitelisted JS files
for (const rel of FILE_INVENTORY) {
    const src = path.join(srcRoot, 'extension', rel);
    if (!fs.existsSync(src)) {
        console.warn(`[sync-leksihjelp] MISSING upstream file: ${rel} — skipping`);
        summary.push({ file: rel, bytes: 0, note: 'missing upstream' });
        continue;
    }
    const dest = path.join(destDir, rel);
    const bytes = copyFile(src, dest);
    totalBytes += bytes;
    summary.push({ file: rel, bytes });
}

// 2. spell-rules/ — whole directory
const rulesSrc = path.join(srcRoot, 'extension', SPELL_RULES_DIR);
const rulesDest = path.join(destDir, SPELL_RULES_DIR);
const rulesBytes = copyDirRecursive(rulesSrc, rulesDest);
totalBytes += rulesBytes;
const ruleCount = fs.existsSync(rulesDest)
    ? fs.readdirSync(rulesDest).filter(f => f.endsWith('.js')).length
    : 0;
summary.push({ file: `${SPELL_RULES_DIR}/ (${ruleCount} files)`, bytes: rulesBytes });

// 3. data/ — vocab JSONs (audio-stripped, minified) + passthrough JSONs
const dataSrc = path.join(srcRoot, 'extension', 'data');
const dataDest = path.join(destDir, 'data');
ensureDir(dataDest);

let dataBytes = 0;
let dataAudioSavedBytes = 0;
for (const entry of fs.readdirSync(dataSrc, { withFileTypes: true })) {
    if (entry.isDirectory()) continue;
    const sp = path.join(dataSrc, entry.name);
    const dp = path.join(dataDest, entry.name);

    const isVocabJson = VOCAB_LANGS.some(l => entry.name.toLowerCase() === `${l}.json`);
    const isPassthroughJson = DATA_PASSTHROUGH_PATTERNS.some(rx => rx.test(entry.name));

    if (isVocabJson) {
        const beforeSize = fs.statSync(sp).size;
        const raw = JSON.parse(fs.readFileSync(sp, 'utf8'));
        const minified = JSON.stringify(stripAudio(raw));
        fs.writeFileSync(dp, minified);
        const afterSize = fs.statSync(dp).size;
        dataBytes += afterSize;
        dataAudioSavedBytes += (beforeSize - afterSize);
    } else if (isPassthroughJson) {
        dataBytes += copyFile(sp, dp);
    } else {
        // Unknown data file — pass through verbatim with a note. Better to
        // overship a small file than silently drop something a rule references.
        dataBytes += copyFile(sp, dp);
    }
}
totalBytes += dataBytes;
summary.push({
    file: `data/ (audio stripped + minified)`,
    bytes: dataBytes,
    note: `saved ${(dataAudioSavedBytes / 1024 / 1024).toFixed(1)} MB vs upstream`,
});

// 4. styles/content.css → public/js/leksihjelp/styles/leksihjelp.css (scoped)
const cssSrc = path.join(srcRoot, 'extension', 'styles', 'content.css');
if (fs.existsSync(cssSrc)) {
    const cssDestDir = path.join(destDir, 'styles');
    ensureDir(cssDestDir);
    const cssDest = path.join(cssDestDir, 'leksihjelp.css');
    const raw = fs.readFileSync(cssSrc, 'utf8');
    const scoped = scopeCss(raw, '.skriv-leksihjelp');
    fs.writeFileSync(cssDest, scoped);
    const bytes = fs.statSync(cssDest).size;
    totalBytes += bytes;
    summary.push({ file: 'styles/leksihjelp.css (scoped under .skriv-leksihjelp)', bytes });
} else {
    console.warn('[sync-leksihjelp] MISSING upstream styles/content.css');
}

// 5a. README — regenerated each sync so the wipe step doesn't strand contributors.
fs.writeFileSync(path.join(destDir, 'README.md'),
`# \`public/js/leksihjelp/\` — Vendored from leksihjelp

This tree is **vendored** from the Papertek leksihjelp Chrome extension repo
(\`Papertek-forlag-AS/leksihjelp\`). **Do not edit files in this directory by
hand.** Changes happen upstream in the leksihjelp repo and are pulled in
via \`scripts/sync-leksihjelp.js\`.

See [docs/leksihjelp-integration.md](../../../docs/leksihjelp-integration.md)
for the full contract: which files belong here, the seam shape Skriv
expects (\`window.__lexiVocab\`), the version-pinning protocol, and the
list of cross-repo follow-up tasks.

Current pin: see \`.version\` in this directory (upstream version + commit
SHA + sync timestamp).

If this directory is empty, the leksihjelp side has not been pulled in
yet — run \`node scripts/sync-leksihjelp.js\` from the repo root.
`);

// 5b. .version pin
const versionData = {
    upstream_version: upstreamVersion,
    upstream_commit: upstreamCommit,
    synced_at: new Date().toISOString(),
    inventory: FILE_INVENTORY,
};
fs.writeFileSync(
    path.join(destDir, '.version'),
    JSON.stringify(versionData, null, 2) + '\n'
);

// 6. Summary table
console.log('');
console.log('[sync-leksihjelp] Done — synced to public/js/leksihjelp/');
console.log('');
console.log(`  upstream version: ${upstreamVersion}`);
console.log(`  upstream commit:  ${upstreamCommit.slice(0, 12)}`);
console.log(`  total bytes:      ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
console.log('');
console.log('  ' + 'file'.padEnd(58) + 'size       note');
console.log('  ' + '─'.repeat(58 + 11 + 30));
for (const row of summary) {
    const sizeStr = row.bytes >= 1024 * 1024
        ? `${(row.bytes / 1024 / 1024).toFixed(2)} MB`
        : `${(row.bytes / 1024).toFixed(1)} KB`;
    console.log('  ' + row.file.padEnd(58) + sizeStr.padEnd(11) + (row.note || ''));
}
console.log('');
console.log('  Next: load these in index.html in dependency order:');
console.log('    1. i18n/strings.js');
console.log('    2. exam-registry.js');
console.log('    3. content/vocab-seam-core.js');
console.log('    4. content/vocab-seam.js');
console.log('    5. content/lang-detect.js');
console.log('    6. content/spell-check-core.js');
console.log('    7. content/spell-rules/*.js  (78 rule files)');
console.log('    8. content/spell-check-engine.js  (must precede renderer)');
console.log('    9. content/spell-check-renderer.js');
console.log('   10. popup/dict-state-builder.js');
console.log('   11. popup/grammar-features-section.js');
console.log('  Plus: <link rel="stylesheet" href="/js/leksihjelp/styles/leksihjelp.css">');
console.log('  Plus: bump sw.js ASSETS array + cache version.');
console.log('');
