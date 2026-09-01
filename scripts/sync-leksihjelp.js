#!/usr/bin/env node
/**
 * sync-leksihjelp.js — Skriv's pull side of leksihjelp's canonical embed sync
 * (three-layer architecture, phase 9; replaced the homemade copy sync).
 *
 * The file sync itself belongs to leksihjelp now: `scripts/embed-sync.js` in
 * that repo wipes and re-establishes public/js/leksihjelp/ from its inventory,
 * writes load-order.json (the manifest-derived load order) and .version (the
 * divergence guard's baseline). Audio stripping, CSS scoping and the
 * pdf-viewer strip all happen upstream — Skriv no longer owns copies of them.
 *
 * What is left here is the PULL side:
 *
 *   1. Find the source repo and report branch + version + commit. embed-sync
 *      mirrors the WORKING COPY of the leksihjelp checkout, not a branch you
 *      name, so the wrong branch silently rolls public/js/leksihjelp/ sideways
 *      or backwards. We refuse anything but a release branch (see below).
 *   2. Run embed-sync with Skriv's profile: no-audio (no MP3 playback here),
 *      scoped under .skriv-leksihjelp (Skriv owns the surrounding UI), and
 *      without the pdf-viewer block (Skriv has no PDF reader surface).
 *      No --subset: Skriv takes the shared layer-2 views too.
 *   3. Regenerate the managed blocks in public/index.html and public/sw.js
 *      from load-order.json, so the load order is a pure function of upstream
 *      and never a hand-held list.
 *
 * Flags: --dry-run and --force are forwarded to embed-sync. --dry-run stops
 * after upstream's per-layer report; nothing is written.
 * --allow-any-branch skips the release-branch check (see below).
 *
 * ── Why the release-branch check ────────────────────────────────────────
 * The leksihjelp checkout is shared with other sessions and is often parked
 * on a feature branch with unreleased work. Vendoring from it would ship code
 * that upstream has not released, and the divergence guard cannot see the
 * mistake because the files legitimately match that branch. Lockdown learned
 * this first and added the same refusal on its side.
 *
 * Usage:
 *   node scripts/sync-leksihjelp.js [--dry-run] [--force] [--allow-any-branch]
 *   LEKSIHJELP_REPO_PATH=/abs/path/to/leksihjelp node scripts/sync-leksihjelp.js
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const destRel = path.join('public', 'js', 'leksihjelp');
const destDir = path.join(root, destRel);

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const force = argv.includes('--force');
const allowAnyBranch = argv.includes('--allow-any-branch');

// Branches that represent released leksihjelp. Anything else is unreleased
// work in progress and must not be vendored into Skriv.
const RELEASE_BRANCHES = ['staging', 'main'];

function findSource() {
    const candidates = [
        process.env.LEKSIHJELP_REPO_PATH,
        path.resolve(root, '..', 'leksihjelp'),
        path.resolve(root, '..', '..', 'leksihjelp'),
        path.join(root, 'node_modules', '@papertek', 'leksihjelp'),
    ].filter(Boolean);

    for (const p of candidates) {
        if (fs.existsSync(path.join(p, 'scripts', 'embed-sync.js'))) return p;
    }
    return null;
}

function git(srcRoot, args) {
    try {
        return execFileSync('git', ['-C', srcRoot, ...args], { encoding: 'utf8' }).trim();
    } catch (_) {
        return '';
    }
}

const srcRoot = findSource();
if (!srcRoot) {
    console.error('[sync-leksihjelp] No leksihjelp source found (looked for scripts/embed-sync.js).');
    console.error('  Set LEKSIHJELP_REPO_PATH, or check out a sibling clone next to this repo.');
    process.exit(1);
}

const branch = git(srcRoot, ['rev-parse', '--abbrev-ref', 'HEAD']) || '(detached)';
const commit = git(srcRoot, ['rev-parse', '--short', 'HEAD']) || '(unknown)';
const dirty = git(srcRoot, ['status', '--porcelain']) !== '';
let srcVersion = '(unknown)';
try {
    srcVersion = JSON.parse(fs.readFileSync(path.join(srcRoot, 'package.json'), 'utf8')).version;
} catch (_) { /* reported as unknown */ }

console.log('[sync-leksihjelp] source: ' + srcRoot);
console.log('  branch ' + branch + '  version ' + srcVersion + '  commit ' + commit + (dirty ? '  (WORKING TREE DIRTY)' : ''));

if (!allowAnyBranch && !dryRun) {
    // A detached HEAD is how a worktree pinned to a release tag/branch shows
    // up, so check the commit's branch membership rather than the name alone.
    const containing = git(srcRoot, ['branch', '--format=%(refname:short)', '--contains', 'HEAD'])
        .split('\n').map(s => s.trim()).filter(Boolean);
    const onRelease = RELEASE_BRANCHES.includes(branch)
        || containing.some(b => RELEASE_BRANCHES.includes(b));

    if (!onRelease) {
        console.error('');
        console.error('[sync-leksihjelp] REFUSING: ' + srcRoot + ' is not on a release branch.');
        console.error('  HEAD is on "' + branch + '"; releases live on: ' + RELEASE_BRANCHES.join(', ') + '.');
        console.error('  embed-sync mirrors the working copy, so this would vendor unreleased code.');
        console.error('  Point LEKSIHJELP_REPO_PATH at a checkout/worktree on a release branch,');
        console.error('  or pass --allow-any-branch if you really mean to vendor this branch.');
        process.exit(1);
    }
}

if (dirty && !force && !dryRun) {
    console.error('[sync-leksihjelp] REFUSING: the leksihjelp working tree has uncommitted changes.');
    console.error('  Vendoring it would pin Skriv to a state that exists on no commit. Use --force to override.');
    process.exit(1);
}

// ── 1. Run the canonical sync ───────────────────────────────────────────
const embedSync = path.join(srcRoot, 'scripts', 'embed-sync.js');
const syncArgs = [
    embedSync,
    '--dest', destDir,
    '--profile', 'no-audio',
    '--scope', '.skriv-leksihjelp',
    '--without', 'pdf-viewer',
];
if (dryRun) syncArgs.push('--dry-run');
if (force) syncArgs.push('--force');

try {
    execFileSync(process.execPath, syncArgs, { stdio: 'inherit' });
} catch (err) {
    console.error('[sync-leksihjelp] embed-sync failed — nothing regenerated.');
    process.exit(err.status || 1);
}

if (dryRun) {
    console.log('[sync-leksihjelp] --dry-run: no files written, generated blocks untouched.');
    process.exit(0);
}

// ── 2. Regenerate the managed blocks from load-order.json ───────────────
const loadOrderPath = path.join(destDir, 'load-order.json');
if (!fs.existsSync(loadOrderPath)) {
    console.error('[sync-leksihjelp] embed-sync wrote no load-order.json — refusing to guess a load order.');
    process.exit(1);
}
const loadOrder = JSON.parse(fs.readFileSync(loadOrderPath, 'utf8'));
const contentScripts = loadOrder.contentScripts || [];
const views = loadOrder.views || [];
if (contentScripts.length === 0) {
    console.error('[sync-leksihjelp] load-order.json lists no content scripts — refusing to empty the bundle.');
    process.exit(1);
}

const webPath = rel => '/js/leksihjelp/' + rel;

function replaceBlock(file, beginMarker, endMarker, body) {
    const full = path.join(root, file);
    const src = fs.readFileSync(full, 'utf8');
    const begin = src.indexOf(beginMarker);
    const end = src.indexOf(endMarker);
    if (begin === -1 || end === -1 || end < begin) {
        console.error('[sync-leksihjelp] ' + file + ': generated block markers not found.');
        process.exit(1);
    }
    const before = src.slice(0, begin + beginMarker.length);
    const after = src.slice(end);
    fs.writeFileSync(full, before + '\n' + body + '\n' + after);
}

// index.html. The order is a hard contract, so the generator owns all of it
// rather than leaving half in hand-edited markup:
//   1. the vendored version, so the runtime can cache-bust its own fetches
//   2. embed/host-runtime.js — layer 2.5, deliberately absent from the
//      extension manifest and therefore from load-order.json, so the host
//      loads it itself
//   3. Skriv's own config, which calls createHostRuntime().install() and so
//      must run after the runtime exists but before anything reads chrome.*
//   4. the content scripts in upstream's order, then the shared views
const version = JSON.parse(fs.readFileSync(path.join(destDir, '.version'), 'utf8')).version;
const indexBody = [
    '    <script>window.__skrivLeksihjelpVersion = ' + JSON.stringify(String(version)) + ';</script>',
    '    <script src="' + webPath('embed/host-runtime.js') + '"></script>',
    '    <script src="/js/leksihjelp-loader.js"></script>',
    ...[...contentScripts, ...views].map(rel => '    <script src="' + webPath(rel) + '"></script>'),
].join('\n');
replaceBlock(
    'public/index.html',
    '<!-- BEGIN GENERATED LEKSIHJELP BUNDLE -->',
    '    <!-- END GENERATED LEKSIHJELP BUNDLE -->',
    indexBody
);

// sw.js — the executable baseline plus metadata and the small Bokmål
// fallback. Full language datasets stay lazy; the fetch handler caches
// them on first use.
const EAGER_DATA = ['data/nb-baseline.json'];
const STYLES = ['styles/content.css', 'styles/popup-views.css'];
const swAssets = [
    '.version',
    'load-order.json',
    'embed/host-runtime.js',
    ...STYLES,
    ...contentScripts,
    ...views,
    ...EAGER_DATA,
].filter(rel => fs.existsSync(path.join(destDir, rel)));

const swBody = swAssets.map(rel => "    '" + webPath(rel) + "',").join('\n');
replaceBlock(
    'public/sw.js',
    '// BEGIN GENERATED LEKSIHJELP ASSETS',
    '    // END GENERATED LEKSIHJELP ASSETS',
    swBody
);

console.log('[sync-leksihjelp] regenerated index.html (' + (contentScripts.length + views.length) + ' scripts)'
    + ' and sw.js (' + swAssets.length + ' cached paths).');
console.log('[sync-leksihjelp] Remember to bump CACHE_NAME in public/sw.js.');
