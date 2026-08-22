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
 *   2. Reads extension/manifest.json once and copies Skriv's classic-script
 *      subset in upstream dependency order. Only spell-rule files explicitly
 *      listed by the manifest are copied.
 *   3. Vocab JSONs (de/es/fr/en/nb/nn) — strips the per-entry `audio` field
 *      (~17 MB across 6 langs) since Skriv has no MP3 playback path; writes
 *      minified JSON to keep the bundle compact.
 *   4. CSS scoping — wraps every selector in styles/content.css under a
 *      `.skriv-leksihjelp` parent so the vendored stylesheet doesn't collide
 *      with Skriv's existing UI. Output goes to
 *      public/js/leksihjelp/styles/leksihjelp.css.
 *   5. Writes public/js/leksihjelp/.version with the upstream version,
 *      commit SHA, sync timestamp, and complete generated runtime inventory.
 *   6. Regenerates the managed classic-script block in public/index.html and
 *      the managed Leksihjelp asset block in public/sw.js.
 *   7. Prints a summary table generated from the actual inventories.
 *
 * Vocab loading model: BUNDLED, NOT remotely fetched. Phase 40.2 of leksihjelp
 * forbids runtime API fetch (release gate `check-no-vocab-fetch`). Skriv
 * matches that architecture: data/<lang>.json files ship inside Skriv's
 * static bundle and are read on demand from the same origin by vocab-seam.js.
 * The service worker cache-on-use path stores a language after first use; it
 * is not part of the eager install cache. There is no runtime vocabulary API.
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
const extensionRoot = (srcRoot) => path.join(srcRoot, 'extension');

const indexPath = path.join(root, 'public', 'index.html');
const swPath = path.join(root, 'public', 'sw.js');
const INDEX_BEGIN_MARKER = '    <!-- BEGIN GENERATED LEKSIHJELP BUNDLE -->';
const INDEX_END_MARKER = '    <!-- END GENERATED LEKSIHJELP BUNDLE -->';
const SW_BEGIN_MARKER = '    // BEGIN GENERATED LEKSIHJELP ASSETS';
const SW_END_MARKER = '    // END GENERATED LEKSIHJELP ASSETS';

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

// Parse the manifest once. It is both the version source and the authority for
// classic content-script dependency order (including the exact rule list).
const manifestPath = path.join(extensionRoot(srcRoot), 'manifest.json');
let upstreamManifest;
try {
    upstreamManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
} catch (error) {
    console.error(`[sync-leksihjelp] Could not parse ${manifestPath}: ${error.message}`);
    process.exit(1);
}

const upstreamVersion = upstreamManifest.version || 'unknown';
let upstreamCommit = 'unknown';
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

// Manifest-listed files Skriv needs. Source paths are relative to extension/.
// These are filtered out of the manifest sequence rather than ordered here.
const REQUIRED_MANIFEST_FILES = [
    'i18n/strings.js',
    'exam-registry.js',
    'content/vocab-seam-core.js',
    'content/vocab-seam.js',
    'content/lang-detect.js',
    'content/rule-features.js',
    'content/spell-check-core.js',
    'content/spell-check-engine.js',
    'content/pedagogy-render.js',
    'content/personalization-store.js',
    'content/spell-check-renderer.js',
];

// These helpers are not content scripts, so they follow the manifest-derived
// subset. Skriv consumes their globals from its own settings drawer.
const POST_MANIFEST_FILES = [
    'popup/dict-state-builder.js',
    'popup/grammar-features-section.js',
];

const manifestContentScripts = Array.isArray(upstreamManifest.content_scripts)
    ? upstreamManifest.content_scripts
    : [];
const manifestScriptFiles = manifestContentScripts.flatMap((entry) => {
    if (!Array.isArray(entry?.js)) return [];
    return entry.js.filter((rel) => typeof rel === 'string');
});

const SPELL_RULE_PREFIX = 'content/spell-rules/';
const spellRuleFiles = manifestScriptFiles.filter((rel) => (
    rel.startsWith(SPELL_RULE_PREFIX) && rel.endsWith('.js')
));

const requiredManifestSet = new Set(REQUIRED_MANIFEST_FILES);
const spellRuleSet = new Set(spellRuleFiles);
const manifestSubsetSet = new Set([...requiredManifestSet, ...spellRuleSet]);
const manifestClassicLoadOrder = manifestScriptFiles.filter((rel) => manifestSubsetSet.has(rel));
const CLASSIC_LOAD_ORDER = [...manifestClassicLoadOrder, ...POST_MANIFEST_FILES];
const FILE_INVENTORY = [...new Set(CLASSIC_LOAD_ORDER)];

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

function countOccurrences(input, marker) {
    return input.split(marker).length - 1;
}

function readAndValidateManagedFile(filePath, beginMarker, endMarker) {
    const source = fs.readFileSync(filePath, 'utf8');
    const beginCount = countOccurrences(source, beginMarker);
    const endCount = countOccurrences(source, endMarker);
    const beginIndex = source.indexOf(beginMarker);
    const endIndex = source.indexOf(endMarker);

    if (beginCount !== 1 || endCount !== 1 || beginIndex >= endIndex) {
        throw new Error(
            `Invalid managed block in ${filePath}: expected one ordered ${beginMarker} / ${endMarker} pair`
        );
    }

    return source;
}

function replaceManagedBlock(source, beginMarker, endMarker, body) {
    const beginIndex = source.indexOf(beginMarker);
    const bodyStart = beginIndex + beginMarker.length;
    const endIndex = source.indexOf(endMarker, bodyStart);
    return source.slice(0, bodyStart) + '\n' + body + '\n' + source.slice(endIndex);
}

function listFilesRecursive(dir, prefix = '') {
    const files = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) files.push(...listFilesRecursive(fullPath, rel));
        else files.push(rel);
    }
    return files;
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

// ── Preflight validation ──────────────────────────────────────────────
// Validate every input and both managed destinations before deleting the
// previously working vendor snapshot. A malformed manifest or marker block
// must never leave Skriv with an empty public/js/leksihjelp/ directory.

function isSafeRelativePath(rel) {
    return typeof rel === 'string'
        && rel.length > 0
        && !path.isAbsolute(rel)
        && !rel.split(/[\\/]/).includes('..');
}

let indexTemplate;
let swTemplate;
try {
    if (manifestScriptFiles.length === 0) {
        throw new Error('extension/manifest.json has no content-script JavaScript inventory');
    }
    if (spellRuleFiles.length === 0) {
        throw new Error('extension/manifest.json lists no content/spell-rules/*.js files');
    }
    if (spellRuleFiles.length !== spellRuleSet.size) {
        throw new Error('extension/manifest.json contains duplicate spell-rule entries');
    }
    if (CLASSIC_LOAD_ORDER.length !== FILE_INVENTORY.length) {
        throw new Error('Classic-script subset contains duplicate entries');
    }

    for (const rel of REQUIRED_MANIFEST_FILES) {
        const occurrences = manifestScriptFiles.filter((entry) => entry === rel).length;
        if (occurrences !== 1) {
            throw new Error(`Expected exactly one manifest content-script entry for ${rel}; found ${occurrences}`);
        }
    }

    const requiredSourceFiles = [
        ...FILE_INVENTORY,
        'styles/content.css',
        'data/nb-baseline.json',
        ...VOCAB_LANGS.map((lang) => `data/${lang}.json`),
    ];
    for (const rel of requiredSourceFiles) {
        if (!isSafeRelativePath(rel)) throw new Error(`Unsafe source path in inventory: ${rel}`);
        const sourcePath = path.join(extensionRoot(srcRoot), rel);
        if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
            throw new Error(`Missing required upstream file: ${rel}`);
        }
    }

    const dataSourceDir = path.join(extensionRoot(srcRoot), 'data');
    if (!fs.existsSync(dataSourceDir) || !fs.statSync(dataSourceDir).isDirectory()) {
        throw new Error('Missing required upstream data/ directory');
    }

    indexTemplate = readAndValidateManagedFile(indexPath, INDEX_BEGIN_MARKER, INDEX_END_MARKER);
    swTemplate = readAndValidateManagedFile(swPath, SW_BEGIN_MARKER, SW_END_MARKER);

    const indexBegin = indexTemplate.indexOf(INDEX_BEGIN_MARKER);
    const indexEnd = indexTemplate.indexOf(INDEX_END_MARKER);
    const loaderIndex = indexTemplate.indexOf('<script src="/js/leksihjelp-loader.js"></script>');
    const appEntryIndex = indexTemplate.indexOf('<script type="module" src="/js/app/main.js"></script>');
    if (loaderIndex === -1 || loaderIndex > indexBegin) {
        throw new Error('Leksihjelp loader must remain before the generated index block');
    }
    if (appEntryIndex === -1 || appEntryIndex < indexEnd) {
        throw new Error('Skriv app entry must remain after the generated index block');
    }

    const swArrayStart = swTemplate.indexOf('const LEKSIHJELP_ASSETS = [');
    const swBegin = swTemplate.indexOf(SW_BEGIN_MARKER);
    const swEnd = swTemplate.indexOf(SW_END_MARKER);
    const swArrayEnd = swTemplate.indexOf('];', swEnd);
    if (swArrayStart === -1 || swArrayStart > swBegin || swArrayEnd === -1) {
        throw new Error('Leksihjelp SW markers must remain inside LEKSIHJELP_ASSETS');
    }
} catch (error) {
    console.error(`[sync-leksihjelp] Preflight failed; existing vendor output was not changed: ${error.message}`);
    process.exit(1);
}

// ── Wipe + sync ────────────────────────────────────────────────────────

if (fs.existsSync(destDir)) {
    fs.rmSync(destDir, { recursive: true, force: true });
}
ensureDir(destDir);

const summary = [];
let totalBytes = 0;

// 1. Whitelisted non-rule JS files
for (const rel of FILE_INVENTORY.filter((entry) => !entry.startsWith(SPELL_RULE_PREFIX))) {
    const src = path.join(extensionRoot(srcRoot), rel);
    const dest = path.join(destDir, rel);
    const bytes = copyFile(src, dest);
    totalBytes += bytes;
    summary.push({ file: rel, bytes });
}

// 2. spell-rules/ — exact manifest list and dependency order only
let rulesBytes = 0;
for (const rel of spellRuleFiles) {
    rulesBytes += copyFile(
        path.join(extensionRoot(srcRoot), rel),
        path.join(destDir, rel)
    );
}
totalBytes += rulesBytes;
summary.push({
    file: `${SPELL_RULE_PREFIX} (${spellRuleFiles.length} manifest files)`,
    bytes: rulesBytes,
});

// 3. data/ — vocab JSONs (audio-stripped, minified) + passthrough JSONs
const dataSrc = path.join(extensionRoot(srcRoot), 'data');
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
const cssSrc = path.join(extensionRoot(srcRoot), 'styles', 'content.css');
const cssDestDir = path.join(destDir, 'styles');
ensureDir(cssDestDir);
const cssDest = path.join(cssDestDir, 'leksihjelp.css');
const rawCss = fs.readFileSync(cssSrc, 'utf8');
const scopedCss = scopeCss(rawCss, '.skriv-leksihjelp');
fs.writeFileSync(cssDest, scopedCss);
const cssBytes = fs.statSync(cssDest).size;
totalBytes += cssBytes;
summary.push({ file: 'styles/leksihjelp.css (scoped under .skriv-leksihjelp)', bytes: cssBytes });

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

// 5b. .version pin. Inventory every copied/transformed runtime file, not just
// the hand-maintained JS subset, so sync parity can be checked exactly.
const completeCopiedInventory = listFilesRecursive(destDir)
    .filter((rel) => rel !== 'README.md')
    .sort();
const versionData = {
    upstream_version: upstreamVersion,
    upstream_commit: upstreamCommit,
    synced_at: new Date().toISOString(),
    inventory: completeCopiedInventory,
    classic_script_order: CLASSIC_LOAD_ORDER,
};
fs.writeFileSync(
    path.join(destDir, '.version'),
    JSON.stringify(versionData, null, 2) + '\n'
);

// 6. Regenerate the two managed release blocks. Loader and app entry are
// intentionally outside the index block. Large language data remains lazy;
// the SW eagerly caches executable code, scoped CSS, metadata, and the small
// Bokmål fallback baseline, then cache-on-use handles other same-origin data.
const indexBundleBody = CLASSIC_LOAD_ORDER
    .map((rel) => `    <script src="/js/leksihjelp/${rel}"></script>`)
    .join('\n');
const eagerSwInventory = [
    '.version',
    ...completeCopiedInventory.filter((rel) => (
        rel.endsWith('.js')
        || rel === 'styles/leksihjelp.css'
        || rel === 'data/nb-baseline.json'
    )),
];
const swAssetBody = eagerSwInventory
    .map((rel) => `    '/js/leksihjelp/${rel}',`)
    .join('\n');

fs.writeFileSync(
    indexPath,
    replaceManagedBlock(indexTemplate, INDEX_BEGIN_MARKER, INDEX_END_MARKER, indexBundleBody)
);
fs.writeFileSync(
    swPath,
    replaceManagedBlock(swTemplate, SW_BEGIN_MARKER, SW_END_MARKER, swAssetBody)
);

// 7. Summary table
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
console.log(`  manifest spell rules: ${spellRuleFiles.length}`);
console.log(`  classic scripts:      ${CLASSIC_LOAD_ORDER.length}`);
console.log(`  copied runtime files: ${completeCopiedInventory.length}`);
console.log(`  eager SW assets:      ${eagerSwInventory.length}`);
console.log('  regenerated:          public/index.html managed bundle');
console.log('  regenerated:          public/sw.js managed eager assets');
console.log('  Next: review the diff and bump the Skriv SW cache version for release.');
console.log('');
