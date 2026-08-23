/**
 * Minimal localhost-only static server for Microsoft popup testing.
 * The MSAL redirect page and bridge must be network-only and must not receive
 * Cross-Origin-Opener-Policy; a plain generic static server does not guarantee
 * the required cache headers.
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../public/', import.meta.url)));
const port = Number.parseInt(process.env.SKRIV_PORT || '4173', 10);
const host = '127.0.0.1';
const networkOnlyPaths = new Set([
    '/microsoft-auth-redirect.html',
    '/vendor/msal-redirect-bridge-5.17.3.min.js',
]);
const contentTypes = new Map([
    ['.css', 'text/css; charset=utf-8'],
    ['.html', 'text/html; charset=utf-8'],
    ['.ico', 'image/x-icon'],
    ['.js', 'text/javascript; charset=utf-8'],
    ['.json', 'application/json; charset=utf-8'],
    ['.md', 'text/markdown; charset=utf-8'],
    ['.png', 'image/png'],
    ['.svg', 'image/svg+xml'],
    ['.txt', 'text/plain; charset=utf-8'],
    ['.webmanifest', 'application/manifest+json; charset=utf-8'],
]);

function safeFilePath(requestUrl) {
    let pathname;
    try {
        pathname = decodeURIComponent(new URL(requestUrl, 'http://localhost').pathname);
    } catch {
        return null;
    }
    if (pathname.includes('\0')) return null;
    const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const candidate = resolve(root, relativePath);
    return candidate === root || candidate.startsWith(`${root}${sep}`) ? candidate : null;
}

const server = createServer(async (request, response) => {
    const filePath = safeFilePath(request.url || '/');
    if (!filePath || !['GET', 'HEAD'].includes(request.method || '')) {
        response.writeHead(filePath ? 405 : 400, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end(filePath ? 'Method not allowed' : 'Bad request');
        return;
    }

    let fileStat;
    try {
        fileStat = await stat(filePath);
    } catch {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Not found');
        return;
    }
    if (!fileStat.isFile()) {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Not found');
        return;
    }

    const pathname = new URL(request.url || '/', 'http://localhost').pathname;
    const headers = {
        'Content-Type': contentTypes.get(extname(filePath).toLowerCase()) || 'application/octet-stream',
        'Content-Length': String(fileStat.size),
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': networkOnlyPaths.has(pathname)
            ? 'no-store, max-age=0'
            : 'no-cache',
    };
    response.writeHead(200, headers);
    if (request.method === 'HEAD') {
        response.end();
        return;
    }
    createReadStream(filePath).pipe(response);
});

server.listen(port, host, () => {
    process.stdout.write(`Skriv is ready at http://localhost:${port}/\n`);
});
