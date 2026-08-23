import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = path.join(repoRoot, 'public');

const PINNED_VENDOR_HASHES = new Map([
    ['vendor/tailwindcss-3.4.17.js', '176e894661aa9cdc9a5cba6c720044cbbf7b8bd80d1c9a142a7c24b1b6c50d15'],
    ['vendor/jspdf-2.5.1.umd.min.js', 'ad6f488d08db2b2ab965c0a97e077602509e48121d0cd422fe7f681ad9cf8f0a'],
    ['vendor/msal-browser-5.17.3.min.js', '9b890db3ff7c399318b805665a13fb89006ced0baaac351ffd1c77bd39e5b652'],
    ['vendor/msal-redirect-bridge-5.17.3.min.js', '3c26e0500ca46e53386c95c120b22a7fc9023ab55142206c4130c54379ecf5d1'],
]);

function normalizeAsset(asset) {
    return asset.split('?')[0].split('#')[0];
}

async function getCachedAssets() {
    const source = await readFile(path.join(publicRoot, 'sw.js'), 'utf8');
    return new Set(
        [...source.matchAll(/['"](\/[^'"]+)['"]/g)]
            .map((match) => normalizeAsset(match[1]))
    );
}

test('every declared local service-worker asset exists on disk', async () => {
    const cached = await getCachedAssets();
    const missingFiles = [];
    for (const asset of cached) {
        if (asset === '/') continue;
        try {
            await readFile(path.join(publicRoot, asset.slice(1)));
        } catch {
            missingFiles.push(asset);
        }
    }
    assert.deepEqual(missingFiles.sort(), [], `Missing declared assets:\n${missingFiles.join('\n')}`);
});

test('pinned browser distributions match their reviewed SHA-256 hashes', async () => {
    for (const [relativePath, expected] of PINNED_VENDOR_HASHES) {
        const contents = await readFile(path.join(publicRoot, relativePath));
        const actual = createHash('sha256').update(contents).digest('hex');
        assert.equal(actual, expected, `${relativePath} changed without a dependency review`);
    }
});

test('MSAL 5 uses a dedicated no-store redirect bridge page', async () => {
    const redirect = await readFile(
        path.join(publicRoot, 'microsoft-auth-redirect.html'),
        'utf8',
    );
    assert.match(redirect, /Cache-Control" content="no-store/);
    assert.match(redirect, /msal-redirect-bridge-5\.17\.3\.min\.js/);
    assert.match(redirect, /broadcastResponseToMainFrame\(\)/);
    assert.doesNotMatch(redirect, /js\/app\/main\.js|location\.hash|indexedDB/);

    const inlineScripts = [...redirect.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
    const bridgeCall = inlineScripts.at(-1)?.[1] || '';
    let closeCalls = 0;
    assert.doesNotThrow(() => runInNewContext(bridgeCall, {
        globalThis: { close() { closeCalls += 1; } },
        Promise,
        Error,
    }));
    assert.equal(closeCalls, 1, 'a missing bridge closes the popup instead of stranding sign-in');
});

function localImports(source) {
    const specs = new Set();
    const pattern = /(?:\bfrom\s*|\bimport\s*\(\s*)['"]([^'"]+)['"]/g;
    for (const match of source.matchAll(pattern)) {
        if (match[1].startsWith('.')) specs.add(match[1]);
    }
    return [...specs];
}

async function collectModuleGraph(entryPath) {
    const pending = [entryPath];
    const visited = new Set();

    while (pending.length) {
        const filePath = pending.pop();
        if (visited.has(filePath)) continue;
        visited.add(filePath);

        const source = await readFile(filePath, 'utf8');
        for (const spec of localImports(source)) {
            const resolved = path.resolve(path.dirname(filePath), spec);
            pending.push(resolved);
        }
    }

    return visited;
}

test('the complete application module graph is available offline', async () => {
    const cached = await getCachedAssets();
    const graph = await collectModuleGraph(path.join(publicRoot, 'js/app/main.js'));
    const missing = [...graph]
        .map((filePath) => '/' + path.relative(publicRoot, filePath).split(path.sep).join('/'))
        .filter((asset) => !cached.has(asset))
        .sort();

    assert.deepEqual(missing, [], `Missing service-worker assets:\n${missing.join('\n')}`);
});

test('local scripts, styles, manifest, and icons referenced by index are cached', async () => {
    const cached = await getCachedAssets();
    const index = await readFile(path.join(publicRoot, 'index.html'), 'utf8');
    const referenced = [...index.matchAll(/(?:src|href)="(\/[^"#]+)"/g)]
        .map((match) => normalizeAsset(match[1]));
    const missing = [...new Set(referenced)].filter((asset) => !cached.has(asset)).sort();

    assert.deepEqual(missing, [], `Uncached index assets:\n${missing.join('\n')}`);
});

test('application startup has no network-hosted scripts, styles, or module imports', async () => {
    const index = await readFile(path.join(publicRoot, 'index.html'), 'utf8');
    const whitepaper = await readFile(path.join(publicRoot, 'whitepaper.html'), 'utf8');
    const css = await readFile(path.join(publicRoot, 'css/main.css'), 'utf8');
    assert.doesNotMatch(index, /<(?:script|link)[^>]+(?:src|href)="https?:\/\//i);
    assert.doesNotMatch(whitepaper, /<(?:script|link)[^>]+(?:src|href)="https?:\/\//i);
    assert.doesNotMatch(css, /@import\s+(?:url\()?['"]?https?:\/\//i);

    const jsRoot = path.join(publicRoot, 'js');
    const pending = [jsRoot];
    const remoteImports = [];
    while (pending.length) {
        const dir = pending.pop();
        for (const entry of await readdir(dir, { withFileTypes: true })) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                pending.push(fullPath);
            } else if (entry.name.endsWith('.js')) {
                const source = await readFile(fullPath, 'utf8');
                if (/(?:\bfrom\s*|\bimport\s*\(\s*)['"]https?:\/\//.test(source)) {
                    remoteImports.push(path.relative(publicRoot, fullPath));
                }
            }
        }
    }
    assert.deepEqual(remoteImports, []);
});
