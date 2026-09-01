#!/usr/bin/env node
/**
 * export-editor-core.js
 * 
 * Extracts the "Papertek Core Editor" from the Skriv repository.
 * This bundles the basic rich text editing features (slash menu, images, tables, formatting)
 * without the heavy Skriv-specific pedagogical tools (Skriverammer, LIX, AI feedback).
 *
 * Usage:
 *   DEST_REPO_PATH=/abs/path/to/leksihjelp node scripts/export-editor-core.js
 *
 * Or for local testing:
 *   DEST_REPO_PATH=./dist node scripts/export-editor-core.js
 *
 * Optional:
 *   DEST_SUBPATH=backend/public/js/papertek-editor
 *     Where inside the destination repo to write; defaults to
 *     public/js/papertek-editor. Leksihjelp NEEDS this override: its web
 *     root is backend/public/ (Vercel's Root Directory is backend/), so
 *     the default writes outside the served tree and every file 404s.
 *     Verified 2026-08-12 against production — /app/tts.js -> 200,
 *     /js/papertek-editor/config.js -> 404.
 *
 * The exported bundle is SELF-CONTAINED: no CDN fetch at runtime. Skriv's
 * own editor-toolbar.js imports @floating-ui/dom from jsdelivr, which is
 * fine here but not in the consumers — Leksihjelp promises offline
 * operation, and lockdown runs inside exam networks where an outbound CDN
 * request may simply not resolve, which would take the whole toolbar down
 * (an unresolved ESM import fails the entire module graph, not just that
 * feature). So this script copies a vendored floating-ui build and
 * rewrites that one import on the way out. Skriv's own source is NOT
 * modified.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');

// ── Destination ────────────────────────────────────────────────────────

const destRepoPath = process.env.DEST_REPO_PATH;
if (!destRepoPath) {
    console.error('[export-editor-core] ERROR: DEST_REPO_PATH environment variable is required.');
    console.error('Usage: DEST_REPO_PATH=/path/to/leksihjelp node scripts/export-editor-core.js');
    process.exit(1);
}

const destSubPath = process.env.DEST_SUBPATH || path.join('public', 'js', 'papertek-editor');
const destDir = path.resolve(destRepoPath, destSubPath);

// ── File Inventory ─────────────────────────────────────────────────────
//
// This list is the contract. A module imported by an exported file but
// absent here does not degrade — it kills the whole bundle, because an
// unresolved ESM import fails the entire module graph. in-page-modal.js
// and frame-elements.js were missing from the first export (2026-08-12)
// and took initEditorToolbar and initImageManager down with them, while
// the script exited 0. If you add an import to an exported module, add
// the target here; the dependency check below now enforces it.

const INVENTORY = {
    'shared': [
        'dom-helpers.js',
        'html-escape.js',
        'i18n.js',
        'theme.js',
        'toast-notification.js',
        'in-page-modal.js',   // editor-toolbar.js -> showInPageConfirm
        'frame-elements.js',  // editor-toolbar.js, image-manager.js
        'word-counter.js',    // text-export.js -> countWords; also the live counter
        'auto-save.js',       // Debounced save with status display
        'aria-live.js'        // Screen reader announcements
    ],
    'student': [
        'slash-menu.js',
        'editor-toolbar.js',
        'image-manager.js',
        'table-manager.js',
        'keyboard-shortcuts.js',
        'matte.js',           // Superscript / subscript formatting
        // text-export ships downloadText/downloadDocx/downloadPDF. The first
        // two need nothing extra — .docx is built as HTML carrying Word's XML
        // headers, no library. downloadPDF needs a `window.jspdf` GLOBAL that
        // Skriv loads separately; a consumer without it gets the module's own
        // "pdfNotLoaded" alert rather than a crash. Leksihjelp deliberately
        // does not surface a PDF button, so that path is never entered —
        // vendoring jsPDF (~350 KB) is its own decision, not a side effect of
        // wanting Word export.
        'text-export.js',
        // Zero imports. Pairs with SPECIAL_CHAR_GROUPS in config.js, which was
        // already being exported and had no consumer downstream: de/fr/es
        // characters a Norwegian keyboard cannot reach directly.
        'special-chars-panel.js'
    ],
    // shared/i18n.js resolves these with a DYNAMIC import —
    // `await import(`../locales/${lang}.js`)` — so no static-import check
    // can see them. Without them initI18n() fails both the requested
    // locale and its fallback, _translations stays empty, and every t()
    // call returns its own raw key: the editor renders "toolbar.bold"
    // instead of "Fet". Not a crash, which is precisely why it would have
    // shipped. SUPPORTED_LANGUAGES in i18n.js is ['nb','nn','en'] — keep
    // this list in step with it (the DYNAMIC_DEPS check below enforces it).
    'locales': [
        'nb.js',
        'nn.js',
        'en.js'
    ]
};

// ── Vendored runtime dependency ────────────────────────────────────────

// @floating-ui/dom 1.7.5 and its transitive deps, fetched from jsdelivr
// once and rewritten to import each other by relative path, so the graph
// closes with no network at runtime. Verified by loading it in Node and
// confirming computePosition/flip/shift/offset are functions.
//
// It takes all FOUR. Two plausible-looking shortcuts do not work:
//   - the `+esm` bundle for dom alone re-imports three more CDN modules;
//   - `dist/floating-ui.dom.browser.mjs` looks standalone but still has a
//     bare `from '@floating-ui/core'`, which no browser can resolve
//     without an import map. It shipped that way for one iteration here
//     because the check for it used a regex that required no whitespace
//     before the quote — it matched nothing and was read as "clean".
//     The bare-specifier check below now catches exactly that.
const VENDOR_FILES = [
    'floating-ui-dom.js',
    'floating-ui-core.js',
    'floating-ui-utils.js',
    'floating-ui-utils-dom.js'
];

// Applied to file CONTENT on copy. Keeps Skriv's source untouched while
// making the exported bundle self-contained.
const CONTENT_REWRITES = [
    {
        file: 'student/editor-toolbar.js',
        from: "from 'https://cdn.jsdelivr.net/npm/@floating-ui/dom@1.7.5/+esm'",
        to: "from '../vendor/floating-ui-dom.js'"
    }
];

// ── Clear Destination ──────────────────────────────────────────────────

console.log('[export-editor-core] Destination:', destDir);
if (fs.existsSync(destDir)) {
    console.log('[export-editor-core] Cleaning destination directory...');
    fs.rmSync(destDir, { recursive: true, force: true });
}

// ── Copy Files ─────────────────────────────────────────────────────────

console.log('[export-editor-core] Copying core editor files...');

const missingSources = [];

function copyInventory(category, files) {
    const categorySrcDir = path.join(root, 'public', 'js', 'editor-core', category);
    const categoryDestDir = path.join(destDir, category);

    fs.mkdirSync(categoryDestDir, { recursive: true });

    let count = 0;
    for (const file of files) {
        const srcPath = path.join(categorySrcDir, file);
        const destPath = path.join(categoryDestDir, file);

        if (fs.existsSync(srcPath)) {
            const rewrite = CONTENT_REWRITES.find((r) => r.file === `${category}/${file}`);
            if (rewrite) {
                const src = fs.readFileSync(srcPath, 'utf8');
                if (!src.includes(rewrite.from)) {
                    // The import moved or was reworded upstream. Silently
                    // copying would ship the CDN import to a consumer that
                    // cannot reach it, so refuse instead.
                    console.error(`[export-editor-core] ERROR: rewrite target not found in ${category}/${file}`);
                    console.error(`  looking for: ${rewrite.from}`);
                    console.error('  The upstream import changed. Update CONTENT_REWRITES.');
                    process.exit(1);
                }
                fs.writeFileSync(destPath, src.split(rewrite.from).join(rewrite.to), 'utf8');
                console.log(`[export-editor-core]   rewrote CDN import in ${category}/${file}`);
            } else {
                fs.copyFileSync(srcPath, destPath);
            }
            count++;
        } else {
            missingSources.push(path.relative(root, srcPath));
            console.warn(`[export-editor-core] WARNING: Source file missing: ${srcPath}`);
        }
    }
    return count;
}

let totalFiles = 0;
for (const [category, files] of Object.entries(INVENTORY)) {
    totalFiles += copyInventory(category, files);
}

// ── Copy vendored dependencies ─────────────────────────────────────────

const vendorSrcDir = path.join(root, 'public', 'js', 'editor-core', 'vendor');
const vendorDestDir = path.join(destDir, 'vendor');
fs.mkdirSync(vendorDestDir, { recursive: true });
for (const file of VENDOR_FILES) {
    const srcPath = path.join(vendorSrcDir, file);
    if (fs.existsSync(srcPath)) {
        fs.copyFileSync(srcPath, path.join(vendorDestDir, file));
        totalFiles++;
    } else {
        missingSources.push(path.relative(root, srcPath));
        console.warn(`[export-editor-core] WARNING: Vendor file missing: ${srcPath}`);
    }
}

// ── Create config.js ───────────────────────────────────────────────────

// `editor-core` has a `config.js` at its root. We should copy it if it exists,
// or provide a stub since some modules might rely on it.
const configSrc = path.join(root, 'public', 'js', 'editor-core', 'config.js');
if (fs.existsSync(configSrc)) {
    fs.copyFileSync(configSrc, path.join(destDir, 'config.js'));
    totalFiles++;
}

// ── Verify the exported bundle actually resolves ───────────────────────
//
// The check that would have caught the 2026-08-12 gap at export time
// instead of in a consumer's browser. Walks every exported .js file,
// extracts each static import specifier, and resolves it against what was
// actually written to destDir. A bare `console.warn` is not enough here:
// the first export printed warnings, exited 0, and looked successful.

function collectExportedFiles(dir, acc = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) collectExportedFiles(p, acc);
        else if (entry.name.endsWith('.js')) acc.push(p);
    }
    return acc;
}

// Module specifiers. Three separate patterns rather than one clever one,
// because the earlier single regex required whitespace after `import` and
// was therefore blind to every MINIFIED file — which is exactly what a
// vendored bundle is. It scanned the floating-ui vendor file and matched
// nothing, so a bare `@floating-ui/core` import passed the gate and only
// surfaced as a blank toolbar in the browser.
//   `import{a}from"x"`  `import"x"`  `export{a}from"x"`  `import("x")`
const SPEC_PATTERNS = [
    /(?:^|[^\w$.])from\s*['"]([^'"]+)['"]/g,      // import/export ... from 'x'
    /(?:^|[^\w$.])import\s*['"]([^'"]+)['"]/g,    // bare side-effect import 'x'
    /(?:^|[^\w$.])import\s*\(\s*['"]([^'"]+)['"]/g, // dynamic import('x') with a literal
];

function specifiersIn(src) {
    const found = [];
    for (const re of SPEC_PATTERNS) {
        re.lastIndex = 0;
        for (const m of src.matchAll(re)) found.push(m[1]);
    }
    return found;
}
const unresolved = [];
const cdnImports = [];
const bareSpecifiers = [];

for (const filePath of collectExportedFiles(destDir)) {
    const src = fs.readFileSync(filePath, 'utf8');
    for (const spec of specifiersIn(src)) {
        if (/^https?:\/\//.test(spec)) {
            cdnImports.push(`${path.relative(destDir, filePath)} -> ${spec}`);
            continue;
        }
        if (spec.startsWith('/')) continue; // absolute site path — consumer's call
        if (!spec.startsWith('.')) {
            // A BARE specifier ('@floating-ui/core', 'lodash'). Node resolves
            // these from node_modules; a browser cannot resolve them at all
            // without an import map, and none of the consumers ship one — so
            // it is a hard failure, not a style issue. This is not
            // hypothetical: a vendored floating-ui build carrying exactly one
            // bare import shipped here and took the whole toolbar down.
            bareSpecifiers.push(`${path.relative(destDir, filePath)} -> ${spec}`);
            continue;
        }
        const resolved = path.resolve(path.dirname(filePath), spec);
        if (!fs.existsSync(resolved)) {
            unresolved.push(`${path.relative(destDir, filePath)} -> ${spec}`);
        }
    }
}

// Dynamic imports the static scan above cannot see. Each entry names a
// template-literal import and the concrete files it can resolve to. This
// list exists because `await import(`../locales/${lang}.js`)` in
// shared/i18n.js silently produced an editor that rendered raw i18n keys.
const DYNAMIC_DEPS = [
    {
        why: "shared/i18n.js: await import(`../locales/${lang}.js`)",
        files: ['locales/nb.js', 'locales/nn.js', 'locales/en.js']
    }
];

const missingDynamic = [];
for (const dep of DYNAMIC_DEPS) {
    for (const rel of dep.files) {
        if (!fs.existsSync(path.join(destDir, rel))) {
            missingDynamic.push(`${rel}   (${dep.why})`);
        }
    }
}

const fatal = [];
if (missingDynamic.length) {
    fatal.push(`${missingDynamic.length} dynamically-imported file(s) missing:\n` +
        missingDynamic.map((f) => `    ${f}`).join('\n') +
        '\n  These resolve at runtime, so no static import scan catches them.\n' +
        '  Symptom is a UI rendering raw keys, not an error.');
}
if (missingSources.length) {
    fatal.push(`${missingSources.length} inventory file(s) missing at source:\n` +
        missingSources.map((f) => `    ${f}`).join('\n'));
}
if (unresolved.length) {
    fatal.push(`${unresolved.length} unresolved import(s) in the exported bundle:\n` +
        unresolved.map((f) => `    ${f}`).join('\n') +
        '\n  Add the target to INVENTORY above. An unresolved ESM import\n' +
        '  fails the ENTIRE module graph in the consumer, not just one feature.');
}
if (bareSpecifiers.length) {
    fatal.push(`${bareSpecifiers.length} bare import specifier(s) in the exported bundle:\n` +
        bareSpecifiers.map((f) => `    ${f}`).join('\n') +
        '\n  Browsers cannot resolve bare specifiers without an import map,\n' +
        '  and no consumer ships one. Vendor the dependency and rewrite the\n' +
        '  import to a relative path.');
}
if (cdnImports.length) {
    fatal.push(`${cdnImports.length} CDN import(s) survived into the exported bundle:\n` +
        cdnImports.map((f) => `    ${f}`).join('\n') +
        '\n  Consumers may run offline or inside exam networks. Vendor it and\n' +
        '  add a CONTENT_REWRITES entry.');
}

if (fatal.length) {
    console.error('\n[export-editor-core] EXPORT FAILED — the bundle would not load:\n');
    for (const f of fatal) console.error('  ✗ ' + f + '\n');
    console.error('  Destination left in place for inspection: ' + destDir);
    process.exit(1);
}

// ── Generate Version Manifest ──────────────────────────────────────────

let commit = 'unknown';
try {
    commit = execSync('git rev-parse HEAD', { cwd: root }).toString().trim();
} catch (_) {}

const timestamp = new Date().toISOString();

// Whether the export came from a clean commit or from a working tree with
// uncommitted edits. The first export recorded `commit: 771337f` while
// Skriv had 19 modified and 8 untracked files — including slash-menu.js,
// which was never committed at all. A consumer reading that manifest would
// conclude it holds exactly 771337f, and could not reproduce what it
// actually holds. Record the truth instead: `dirty` means the commit
// identifies a BASE, not the contents.
let dirtyFiles = [];
try {
    // NB: do NOT .trim() the whole output before splitting. Porcelain lines
    // are `XY<space>path`, and for a modified-not-staged file XY is
    // `<space>M` — so trimming the blob eats the first line's leading space
    // and the subsequent slice(3) removes a character of the path itself
    // ("public/..." became "ublic/..."). Split first, trim per line.
    const out = execSync('git status --porcelain -- public/js/editor-core', { cwd: root })
        .toString();
    dirtyFiles = out.split('\n')
        .filter((l) => l.length > 3)
        .map((l) => l.slice(3).trim());
} catch (_) {}

const versionData = {
    source: 'Papertek Skriv',
    commit: commit,
    commitIsExact: dirtyFiles.length === 0,
    uncommittedAtExport: dirtyFiles,
    syncedAt: timestamp,
    inventory: INVENTORY,
    vendored: VENDOR_FILES,
    rewrites: CONTENT_REWRITES.map((r) => `${r.file}: ${r.from} -> ${r.to}`)
};

if (dirtyFiles.length) {
    console.warn(`[export-editor-core] NOTE: exporting a DIRTY working tree — ` +
        `${dirtyFiles.length} uncommitted file(s) under editor-core.`);
    console.warn('[export-editor-core] .version records commit as a base, not an exact match.');
}

fs.writeFileSync(
    path.join(destDir, '.version'),
    JSON.stringify(versionData, null, 2) + '\n',
    'utf8'
);

// ── Summary ────────────────────────────────────────────────────────────

console.log(`[export-editor-core] Success! Exported ${totalFiles} core files.`);
console.log(`[export-editor-core] Version manifest written to .version`);
console.log(`\nNext steps for Leksihjelp:`);
console.log(`  1. Ensure TailwindCSS or the required base CSS is present.`);
console.log(`  2. Import the modules from /js/papertek-editor/...`);
