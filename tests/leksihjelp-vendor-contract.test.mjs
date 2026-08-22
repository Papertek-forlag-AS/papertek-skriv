import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = path.join(repoRoot, 'public');
const vendorRoot = path.join(publicRoot, 'js', 'leksihjelp');
const versionPath = path.join(vendorRoot, '.version');

const INDEX_BEGIN = '<!-- BEGIN GENERATED LEKSIHJELP BUNDLE -->';
const INDEX_END = '<!-- END GENERATED LEKSIHJELP BUNDLE -->';
const SW_BEGIN = '// BEGIN GENERATED LEKSIHJELP ASSETS';
const SW_END = '// END GENERATED LEKSIHJELP ASSETS';
const RULE_PREFIX = 'content/spell-rules/';

async function readContract() {
    return JSON.parse(await readFile(versionPath, 'utf8'));
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

function createClassicScriptContext() {
    const storage = Object.create(null);
    const storageListeners = new Set();
    const messageListeners = new Set();

    function getStored(keys) {
        if (keys == null) return { ...storage };
        if (typeof keys === 'string') return keys in storage ? { [keys]: storage[keys] } : {};
        if (Array.isArray(keys)) {
            return Object.fromEntries(keys.filter((key) => key in storage).map((key) => [key, storage[key]]));
        }
        return Object.fromEntries(
            Object.entries(keys).map(([key, fallback]) => [key, key in storage ? storage[key] : fallback]),
        );
    }

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
    context.chrome = {
        runtime: {
            getURL: (relativePath) => `/js/leksihjelp/${String(relativePath).replace(/^\/+/, '')}`,
            sendMessage(message, callback) {
                for (const listener of messageListeners) listener(message, {}, () => {});
                if (typeof callback === 'function') callback();
            },
            onMessage: {
                addListener: (listener) => messageListeners.add(listener),
                removeListener: (listener) => messageListeners.delete(listener),
            },
        },
        storage: {
            local: {
                get(keys, callback) {
                    const result = getStored(keys);
                    if (typeof callback === 'function') callback(result);
                    return Promise.resolve(result);
                },
                set(values, callback) {
                    const changes = {};
                    for (const [key, value] of Object.entries(values || {})) {
                        changes[key] = { oldValue: storage[key], newValue: value };
                        storage[key] = value;
                    }
                    for (const listener of storageListeners) listener(changes, 'local');
                    if (typeof callback === 'function') callback();
                    return Promise.resolve();
                },
            },
            onChanged: {
                addListener: (listener) => storageListeners.add(listener),
                removeListener: (listener) => storageListeners.delete(listener),
            },
        },
    };
    return context;
}

test('Leksihjelp metadata inventories every generated runtime file and rule', async () => {
    const contract = await readContract();
    assert.match(contract.upstream_version, /^\d+\.\d+\.\d+$/);
    assert.match(contract.upstream_commit, /^[0-9a-f]{40}$/);
    assert.ok(Array.isArray(contract.inventory), '.version must contain the copied-file inventory');
    assert.ok(Array.isArray(contract.classic_script_order), '.version must contain the generated script order');

    assert.equal(new Set(contract.inventory).size, contract.inventory.length, 'file inventory must not contain duplicates');
    assert.equal(
        new Set(contract.classic_script_order).size,
        contract.classic_script_order.length,
        'classic script order must not contain duplicates',
    );

    const diskFiles = (await listFilesRecursive(vendorRoot))
        .filter((relativePath) => relativePath !== '.version' && relativePath !== 'README.md')
        .sort();
    assert.deepEqual(contract.inventory, [...contract.inventory].sort(), 'copied-file inventory must be deterministic');
    assert.deepEqual(contract.inventory, diskFiles, '.version must exactly describe generated runtime files on disk');

    const diskRules = diskFiles.filter((relativePath) => relativePath.startsWith(RULE_PREFIX));
    const inventoryRules = contract.inventory.filter((relativePath) => relativePath.startsWith(RULE_PREFIX));
    const loadedRules = contract.classic_script_order.filter((relativePath) => relativePath.startsWith(RULE_PREFIX));
    assert.ok(diskRules.length > 0, 'vendored snapshot must contain spell rules');
    assert.deepEqual(inventoryRules, diskRules, 'every on-disk rule must appear in the copied-file inventory');
    assert.deepEqual([...loadedRules].sort(), diskRules, 'every on-disk rule must appear once in the classic load order');
});

test('the generated index block exactly follows the pinned classic-script order', async () => {
    const contract = await readContract();
    const indexSource = await readFile(path.join(publicRoot, 'index.html'), 'utf8');
    const indexScripts = managedIndexScripts(indexSource);

    assert.deepEqual(indexScripts, contract.classic_script_order);
    for (const rule of contract.inventory.filter((relativePath) => relativePath.startsWith(RULE_PREFIX))) {
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
    const contract = await readContract();
    const workerSource = await readFile(path.join(publicRoot, 'sw.js'), 'utf8');
    const workerAssets = managedServiceWorkerAssets(workerSource);
    const expectedAssets = [
        '.version',
        ...contract.inventory.filter((relativePath) => (
            relativePath.endsWith('.js')
            || relativePath === 'styles/leksihjelp.css'
            || relativePath === 'data/nb-baseline.json'
        )),
    ];

    assert.equal(new Set(workerAssets).size, workerAssets.length, 'generated SW assets must not contain duplicates');
    assert.deepEqual(workerAssets, expectedAssets);
    assert.ok(workerAssets.includes('data/nb-baseline.json'), 'the small Bokmål fallback stays offline-ready');
    assert.ok(!workerAssets.includes('data/nb.json'), 'large language bundles must remain cache-on-use');
    assert.ok(!workerAssets.includes('data/nn.json'), 'large language bundles must remain cache-on-use');
});

test('the pinned rule and renderer seams boot in generated order without extension APIs', async () => {
    const contract = await readContract();
    const context = createClassicScriptContext();
    const bootPaths = contract.classic_script_order.filter((relativePath) => (
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

    const ruleFileCount = contract.classic_script_order.filter((relativePath) => relativePath.startsWith(RULE_PREFIX)).length;
    assert.equal(context.__lexiSpellRules.length, ruleFileCount, 'every generated rule script must register one rule');
    assert.ok(context.__lexiSpellRules.some((rule) => rule.id === 'gender'));
    assert.equal(typeof context.__lexiRuleFeatures, 'object');
    assert.equal(typeof context.__lexiSpellCore.check, 'function');
    assert.equal(typeof context.__lexiSpellCheckEngine.runCheck, 'function');
    assert.equal(typeof context.__lexiPedagogyRender.renderPedagogyPanelHtml, 'function');
    assert.equal(typeof context.__lexiPersonalization.createPersonalizationStore, 'function');
});
