#!/usr/bin/env node
/**
 * CI guard: the service worker is cache-first for same-origin release files,
 * so any change under public/ that reaches users needs a new CACHE_NAME in
 * public/sw.js. Otherwise installed clients keep serving the old files.
 *
 * Usage: node scripts/check-sw-bump.mjs <base-ref>
 *   e.g. node scripts/check-sw-bump.mjs origin/main
 *
 * Exits non-zero when public/ changed (other than sw.js itself) and
 * CACHE_NAME did not.
 */
import { execFileSync } from 'node:child_process';

const base = process.argv[2];
if (!base) {
    console.error('usage: node scripts/check-sw-bump.mjs <base-ref>');
    process.exit(2);
}

function git(...args) {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

const changed = git('diff', '--name-only', `${base}...HEAD`, '--', 'public/')
    .split('\n')
    .filter(Boolean)
    .filter((path) => path !== 'public/sw.js');

if (changed.length === 0) {
    console.log('check-sw-bump: no public/ changes, nothing to check.');
    process.exit(0);
}

function cacheNameAt(ref) {
    const source = ref ? git('show', `${ref}:public/sw.js`) : git('show', 'HEAD:public/sw.js');
    const match = source.match(/const CACHE_NAME = '([^']+)'/);
    if (!match) throw new Error(`CACHE_NAME not found in public/sw.js at ${ref || 'HEAD'}`);
    return match[1];
}

const before = cacheNameAt(base);
const after = cacheNameAt('HEAD');

if (before === after) {
    console.error(`check-sw-bump: ${changed.length} file(s) under public/ changed but CACHE_NAME is still '${after}'.`);
    console.error('Bump CACHE_NAME in public/sw.js (and the version noted in specs/ARCHITECTURE.md and specs/DATA-MODEL.md).');
    for (const path of changed) console.error(`  - ${path}`);
    process.exit(1);
}

const toNumber = (name) => Number(name.replace(/^skriv-v/, ''));
if (toNumber(after) <= toNumber(before)) {
    console.error(`check-sw-bump: CACHE_NAME went from '${before}' to '${after}'. Never downgrade; a lower version re-installs stale caches on deployed clients.`);
    process.exit(1);
}

console.log(`check-sw-bump: OK ('${before}' -> '${after}').`);
