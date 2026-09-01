import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// The vendored tree, its .version stamp and load-order.json are all written by
// leksihjelp's canonical embed-sync (scripts/sync-leksihjelp.js drives it).
// These tests pin the contract Skriv depends on: the stamp describes exactly
// what is on disk, and both generated blocks follow the pinned load order.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = path.join(repoRoot, 'public');
const vendorRoot = path.join(publicRoot, 'js', 'leksihjelp');
const versionPath = path.join(vendorRoot, '.version');
const loadOrderPath = path.join(vendorRoot, 'load-order.json');

const INDEX_BEGIN = '<!-- BEGIN GENERATED LEKSIHJELP BUNDLE -->';
const INDEX_END = '<!-- END GENERATED LEKSIHJELP BUNDLE -->';
const SW_BEGIN = '// BEGIN GENERATED LEKSIHJELP ASSETS';
const SW_END = '// END GENERATED LEKSIHJELP ASSETS';
const RULE_PREFIX = 'content/spell-rules/';

// Written by the sync alongside .version, so not part of the file inventory.
const NON_INVENTORY = new Set(['.version', 'load-order.json']);

async function readStamp() {
    return JSON.parse(await readFile(versionPath, 'utf8'));
}

async function readLoadOrder() {
    return JSON.parse(await readFile(loadOrderPath, 'utf8'));
}

async function listFilesRecursive(directory, prefix = '') {
    const files = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
            files.push(...await listFilesRecursive(path.join(directory, entry.name), relativePath));
        } else {
            files.push(relativePath);
        }
    }
    return files;
}

function occurrences(values, expected) {
    return values.filter((value) => value === expected).length;
}

function managedIndexScripts(indexSource) {
    const beginMatches = indexSource.split(INDEX_BEGIN).length - 1;
    const endMatches = indexSource.split(INDEX_END).length - 1;
    assert.equal(beginMatches, 1, 'index must contain one generated Leksihjelp begin marker');
    assert.equal(endMatches, 1, 'index must contain one generated Leksihjelp end marker');

    const begin = indexSource.indexOf(INDEX_BEGIN) + INDEX_BEGIN.length;
    const end = indexSource.indexOf(INDEX_END, begin);
    assert.ok(end > begin, 'generated Leksihjelp markers must be ordered');

    const block = indexSource.slice(begin, end);
    return [...block.matchAll(/<script\s+src="\/js\/leksihjelp\/([^"?]+\.js)"\s*><\/script>/g)]
        .map((match) => match[1]);
}

function managedServiceWorkerAssets(workerSource) {
    const beginMatches = workerSource.split(SW_BEGIN).length - 1;
    const endMatches = workerSource.split(SW_END).length - 1;
    assert.equal(beginMatches, 1, 'service worker must contain one generated Leksihjelp begin marker');
    assert.equal(endMatches, 1, 'service worker must contain one generated Leksihjelp end marker');

    const begin = workerSource.indexOf(SW_BEGIN) + SW_BEGIN.length;
    const end = workerSource.indexOf(SW_END, begin);
    assert.ok(end > begin, 'generated service-worker markers must be ordered');

    const block = workerSource.slice(begin, end);
    return [...block.matchAll(/['"]\/js\/leksihjelp\/([^'"?]+)['"]/g)]
        .map((match) => match[1]);
}

/**
 * A page-like context with NO chrome.* of its own, then leksihjelp's own
 * embed runtime installed into it — the same substrate the browser gets.
 * If the vendored code ever needs a real extension API again, this throws
 * here instead of failing silently in a pupil's browser.
 */
async function createEmbeddedContext() {
    const context = vm.createContext({
        console: { log() {}, warn() {}, error() {} },
        Intl,
        Map,
        Set,
        Promise,
        URL,
        clearTimeout,
        queueMicrotask,
        setTimeout,
    });
    context.self = context;
    context.window = context;

    const runtimeSource = await readFile(path.join(vendorRoot, 'embed', 'host-runtime.js'), 'utf8');
    vm.runInContext(runtimeSource, context, { filename: 'embed/host-runtime.js' });

    const { createHostRuntime, createMemoryStore } = context.__lexiHostRuntime;
    const runtime = createHostRuntime({
        assetBase: '/js/leksihjelp',
        version: () => '0.0.0-test',
        store: createMemoryStore({ 'lang.spellcheck': 'nb', spellCheckEnabled: true }),
        capabilities: { network: false, tts: false, report: false },
    });
    runtime.install();
    return context;
}

test('the vendored stamp describes exactly what the sync put on disk', async () => {
    const stamp = await readStamp();

    assert.match(stamp.version, /^\d+\.\d+\.\d+$/);
    assert.match(stamp.sha, /^[0-9a-f]{40}$/);
    assert.equal(typeof stamp.files, 'object', '.version must carry the per-file hash inventory');

    // Skriv's profile. A sync run without these would silently unscope the
    // vendored CSS onto Skriv's own UI, or ship ~17 MB of unused audio.
    assert.equal(stamp.profile, 'no-audio');
    assert.equal(stamp.scope, '.skriv-leksihjelp');

    const inventory = Object.keys(stamp.files).sort();
    const diskFiles = (await listFilesRecursive(vendorRoot))
        .filter((relativePath) => !NON_INVENTORY.has(relativePath))
        .sort();
    assert.deepEqual(inventory, diskFiles, '.version must exactly describe the vendored files on disk');

    const diskRules = diskFiles.filter((relativePath) => relativePath.startsWith(RULE_PREFIX));
    assert.ok(diskRules.length > 0, 'vendored snapshot must contain spell rules');
});

test('the generated index block exactly follows the pinned load order', async () => {
    const { contentScripts, views } = await readLoadOrder();
    const indexSource = await readFile(path.join(publicRoot, 'index.html'), 'utf8');
    const indexScripts = managedIndexScripts(indexSource);

    // The runtime is layer 2.5: absent from the extension manifest, so absent
    // from load-order.json, and loaded by the host ahead of everything else.
    assert.deepEqual(indexScripts, ['embed/host-runtime.js', ...contentScripts, ...views]);

    // Skriv's own config sits between the runtime and the bundle: it installs
    // chrome.* before any vendored module reads it.
    const runtimeTag = indexSource.indexOf('/js/leksihjelp/embed/host-runtime.js');
    const loaderTag = indexSource.indexOf('/js/leksihjelp-loader.js"');
    const firstVendored = indexSource.indexOf(`/js/leksihjelp/${contentScripts[0]}`);
    assert.ok(runtimeTag < loaderTag, 'host-runtime must load before Skriv\'s loader');
    assert.ok(loaderTag < firstVendored, 'Skriv\'s loader must install before the vendored bundle');

    for (const rule of contentScripts.filter((p) => p.startsWith(RULE_PREFIX))) {
        assert.equal(occurrences(indexScripts, rule), 1, `${rule} must be loaded exactly once`);
    }

    function assertBefore(first, second) {
        const firstIndex = indexScripts.indexOf(first);
        const secondIndex = indexScripts.indexOf(second);
        assert.notEqual(firstIndex, -1, `${first} must be in the generated bundle`);
        assert.notEqual(secondIndex, -1, `${second} must be in the generated bundle`);
        assert.ok(firstIndex < secondIndex, `${first} must load before ${second}`);
    }

    assertBefore('content/rule-features.js', 'content/spell-check-core.js');
    assertBefore('content/spell-check-engine.js', 'content/pedagogy-render.js');
    assertBefore('content/pedagogy-render.js', 'content/personalization-store.js');
    assertBefore('content/personalization-store.js', 'content/spell-check-renderer.js');
});

test('the generated service-worker block eagerly caches only the executable baseline', async () => {
    const { contentScripts, views } = await readLoadOrder();
    const workerSource = await readFile(path.join(publicRoot, 'sw.js'), 'utf8');
    const workerAssets = managedServiceWorkerAssets(workerSource);

    const expectedAssets = [
        '.version',
        'load-order.json',
        'embed/host-runtime.js',
        'styles/content.css',
        'styles/popup-views.css',
        ...contentScripts,
        ...views,
        'data/nb-baseline.json',
    ];

    assert.equal(new Set(workerAssets).size, workerAssets.length, 'generated SW assets must not contain duplicates');
    assert.deepEqual(workerAssets, expectedAssets);
    assert.ok(workerAssets.includes('data/nb-baseline.json'), 'the small Bokmål fallback stays offline-ready');
    assert.ok(!workerAssets.includes('data/nb.json'), 'large language bundles must remain cache-on-use');
    assert.ok(!workerAssets.includes('data/nn.json'), 'large language bundles must remain cache-on-use');
});

test('the pinned rule and renderer seams boot in generated order on the embed runtime', async () => {
    const { contentScripts } = await readLoadOrder();
    const context = await createEmbeddedContext();

    const bootPaths = contentScripts.filter((relativePath) => (
        relativePath === 'content/rule-features.js'
        || relativePath === 'content/spell-check-core.js'
        || relativePath.startsWith(RULE_PREFIX)
        || relativePath === 'content/spell-check-engine.js'
        || relativePath === 'content/pedagogy-render.js'
        || relativePath === 'content/personalization-store.js'
        || relativePath === 'content/spell-check-renderer.js'
    ));

    for (const relativePath of bootPaths) {
        const source = await readFile(path.join(vendorRoot, relativePath), 'utf8');
        vm.runInContext(source, context, { filename: relativePath });
    }
    await new Promise((resolve) => setImmediate(resolve));

    const ruleFileCount = contentScripts.filter((relativePath) => relativePath.startsWith(RULE_PREFIX)).length;
    assert.equal(context.__lexiSpellRules.length, ruleFileCount, 'every generated rule script must register one rule');
    assert.ok(context.__lexiSpellRules.some((rule) => rule.id === 'gender'));
    assert.equal(typeof context.__lexiRuleFeatures, 'object');
    assert.equal(typeof context.__lexiSpellCore.check, 'function');
    assert.equal(typeof context.__lexiSpellCheckEngine.runCheck, 'function');
    assert.equal(typeof context.__lexiPedagogyRender.renderPedagogyPanelHtml, 'function');
    assert.equal(typeof context.__lexiPersonalization.createPersonalizationStore, 'function');

    // The sentinel: an embed host must never look like a real extension, or
    // Skriv's own bridge would yield to an extension that is not there.
    assert.equal(context.chrome.runtime.id, undefined, 'embed runtime must not expose chrome.runtime.id');
    assert.equal(context.__lexiCapabilities.network, false);
    assert.equal(context.__lexiCapabilities.identity, null);
});
