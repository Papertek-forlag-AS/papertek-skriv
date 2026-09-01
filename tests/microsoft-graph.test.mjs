import test from 'node:test';
import assert from 'node:assert/strict';
import {
    MicrosoftGraphAuthenticationError,
    MicrosoftGraphConflictError,
    MicrosoftGraphError,
    MicrosoftGraphNotFoundError,
    MicrosoftGraphPermissionError,
    MicrosoftGraphRateLimitError,
    createMicrosoftGraphClient,
    encodeSharingUrl,
} from '../public/js/app/microsoft-graph.js';

const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0';

function jsonResponse(body, init = {}) {
    return new Response(JSON.stringify(body), {
        status: init.status || 200,
        headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
    });
}

function responseError(status, code = 'graphCode', headers = {}) {
    return jsonResponse({ error: { code, message: `Graph ${status}` } }, { status, headers });
}

function requestHeaders(init) {
    return new Headers(init?.headers || {});
}

test('sharing URLs use the Microsoft Graph u! base64url encoding', () => {
    const url = 'https://contoso.sharepoint.com/:f:/s/School/Example?e=abc123';
    const expected = Buffer.from(url, 'utf8')
        .toString('base64')
        .replace(/=+$/g, '')
        .replace(/\//g, '_')
        .replace(/\+/g, '-');

    assert.equal(encodeSharingUrl(url), `u!${expected}`);
    assert.throws(
        () => encodeSharingUrl('http://contoso.sharepoint.com/folder'),
        (error) => error instanceof MicrosoftGraphError && error.code === 'invalid-sharing-url',
    );
    assert.throws(
        () => encodeSharingUrl('https://student:secret@contoso.sharepoint.com/folder'),
        (error) => error instanceof MicrosoftGraphError && error.code === 'invalid-sharing-url',
    );
});

test('resolveSharedFolder sends delegated auth and validates a folder driveItem', async () => {
    const calls = [];
    const folder = {
        id: 'folder-id',
        name: 'Skriv',
        folder: { childCount: 3 },
        parentReference: { driveId: 'drive-id' },
        webUrl: 'https://contoso.sharepoint.com/Skriv',
    };
    const client = createMicrosoftGraphClient({
        getAccessToken: async () => 'token',
        fetchImpl: async (url, init) => {
            calls.push({ url, init });
            return jsonResponse(folder);
        },
    });

    assert.deepEqual(
        await client.resolveSharedFolder('https://contoso.sharepoint.com/:f:/s/School/link'),
        folder,
    );
    assert.match(calls[0].url, /^https:\/\/graph\.microsoft\.com\/v1\.0\/shares\/u!/);
    assert.equal(requestHeaders(calls[0].init).get('Authorization'), 'Bearer token');
    assert.equal(
        requestHeaders(calls[0].init).get('Prefer'),
        'redeemSharingLinkIfNecessary',
    );

    const invalid = createMicrosoftGraphClient({
        getAccessToken: async () => 'token',
        fetchImpl: async () => jsonResponse({ id: 'file', file: {} }),
    });
    await assert.rejects(
        invalid.resolveSharedFolder('https://contoso.sharepoint.com/file'),
        (error) => error instanceof MicrosoftGraphError && error.code === 'invalid-shared-folder',
    );
});

test('listSkrivDocuments follows Graph pagination and keeps only .skriv files', async () => {
    const urls = [];
    const nextLink = `${GRAPH_ROOT}/drives/drive/items/folder/children?$skiptoken=next`;
    const pages = [
        {
            value: [
                { id: 'a', name: 'a.skriv', file: {} },
                { id: 'txt', name: 'notes.txt', file: {} },
                { id: 'folder', name: 'Nested', folder: {} },
            ],
            '@odata.nextLink': nextLink,
        },
        { value: [{ id: 'b', name: 'B.SKRIV', file: {} }] },
    ];
    const client = createMicrosoftGraphClient({
        getAccessToken: async () => 'token',
        fetchImpl: async (url, init) => {
            urls.push({ url, init });
            return jsonResponse(pages.shift());
        },
    });

    const files = await client.listSkrivDocuments({ driveId: 'drive', folderId: 'folder' });
    assert.deepEqual(files.map((item) => item.id), ['a', 'b']);
    assert.equal(urls.length, 2);
    assert.match(new URL(urls[0].url).searchParams.get('$select'), /(?:^|,)file(?:,|$)/);
    assert.equal(urls[1].url, nextLink);
    assert.equal(requestHeaders(urls[1].init).get('Authorization'), 'Bearer token');
    assert.equal(urls[0].init.cache, 'no-store');
    assert.equal(urls[0].init.credentials, 'omit');
    assert.equal(urls[0].init.referrerPolicy, 'no-referrer');
    assert.doesNotMatch(new URL(urls[0].url).searchParams.get('$select'), /lastModifiedBy/);
});

test('listSkrivDocuments rejects folders too large for a pupil-safe dialog', async (t) => {
    await t.test('document count', async () => {
        const client = createMicrosoftGraphClient({
            maxListDocuments: 2,
            getAccessToken: async () => 'token',
            fetchImpl: async () => jsonResponse({
                value: [0, 1, 2].map((index) => ({
                    id: `doc-${index}`,
                    name: `doc-${index}.skriv`,
                    file: {},
                })),
            }),
        });
        await assert.rejects(
            client.listSkrivDocuments({ driveId: 'drive', folderId: 'folder' }),
            (error) => error instanceof MicrosoftGraphError
                && error.code === 'remote-list-too-large',
        );
    });

    await t.test('page count', async () => {
        let calls = 0;
        const client = createMicrosoftGraphClient({
            maxListPages: 2,
            getAccessToken: async () => 'token',
            fetchImpl: async () => {
                calls += 1;
                return jsonResponse({
                    value: [],
                    '@odata.nextLink': `${GRAPH_ROOT}/next?page=${calls + 1}`,
                });
            },
        });
        await assert.rejects(
            client.listSkrivDocuments({ driveId: 'drive', folderId: 'folder' }),
            (error) => error instanceof MicrosoftGraphError
                && error.code === 'remote-list-too-large',
        );
        assert.equal(calls, 2, 'the client never fetches an unbounded continuation chain');
    });
});

test('createSkrivDocument uses a fail-fast upload session and returns fresh metadata', async () => {
    const calls = [];
    const metadata = {
        id: 'item-id',
        name: 'doc-id.skriv',
        eTag: 'etag-1',
        cTag: 'ctag-1',
        lastModifiedDateTime: '2026-08-23T08:00:00Z',
        file: { mimeType: 'application/json' },
        webUrl: 'https://contoso.sharepoint.com/doc-id.skriv',
        parentReference: { driveId: 'drive-id', id: 'folder-id' },
    };
    const client = createMicrosoftGraphClient({
        getAccessToken: async () => 'token',
        fetchImpl: async (url, init) => {
            calls.push({ url, init });
            if (url.includes('createUploadSession')) {
                return jsonResponse({ uploadUrl: 'https://upload.example/session' });
            }
            if (url === 'https://upload.example/session') {
                return jsonResponse({ id: 'item-id', eTag: 'etag-1' }, { status: 201 });
            }
            return jsonResponse(metadata);
        },
    });

    const item = await client.createSkrivDocument({
        driveId: 'drive-id',
        folderId: 'folder-id',
        fileName: 'doc-id.skriv',
        content: '{"format":"papertek-skriv-document"}',
    });

    assert.deepEqual(item, {
        id: metadata.id,
        name: metadata.name,
        eTag: metadata.eTag,
        cTag: metadata.cTag,
        lastModifiedDateTime: metadata.lastModifiedDateTime,
        webUrl: metadata.webUrl,
        parentReference: metadata.parentReference,
    });
    assert.deepEqual(JSON.parse(calls[0].init.body), {
        item: { '@microsoft.graph.conflictBehavior': 'fail' },
    });
    assert.equal(requestHeaders(calls[0].init).get('Authorization'), 'Bearer token');
    assert.equal(requestHeaders(calls[1].init).has('Authorization'), false);
    assert.equal(calls[1].init.cache, 'no-store');
    assert.equal(calls[1].init.credentials, 'omit');
    assert.equal(calls[1].init.referrerPolicy, 'no-referrer');
    assert.match(requestHeaders(calls[1].init).get('Content-Range'), /^bytes 0-\d+\/\d+$/);
    assert.match(calls[2].url, /\/drives\/drive-id\/items\/item-id\?/);
});

test('updateSkrivDocument uses If-Match and returns a distinct 412 conflict', async () => {
    const calls = [];
    const client = createMicrosoftGraphClient({
        getAccessToken: async () => 'token',
        fetchImpl: async (url, init) => {
            calls.push({ url, init });
            if (!url.includes('createUploadSession')) {
                return jsonResponse({
                    id: 'item-id',
                    name: 'doc.skriv',
                    file: {},
                    eTag: '"saved-etag"',
                    webUrl: 'https://contoso.sharepoint.com/doc.skriv',
                    parentReference: { driveId: 'drive-id', id: 'folder-id' },
                });
            }
            return responseError(412, 'preconditionFailed');
        },
    });

    await assert.rejects(
        client.updateSkrivDocument({
            driveId: 'drive-id',
            folderId: 'folder-id',
            itemId: 'item-id',
            eTag: '"saved-etag"',
            content: '{"updated":true}',
        }),
        (error) => {
            assert.ok(error instanceof MicrosoftGraphConflictError);
            assert.equal(error.status, 412);
            assert.equal(error.kind, 'conflict');
            assert.equal(error.code, 'preconditionFailed');
            return true;
        },
    );
    assert.equal(requestHeaders(calls[1].init).get('If-Match'), '"saved-etag"');
    assert.equal(requestHeaders(calls[1].init).get('Authorization'), 'Bearer token');
});

test('a successful update returns the final fresh DriveItem metadata', async () => {
    const calls = [];
    const metadata = {
        id: 'item-id',
        name: 'doc.skriv',
        eTag: 'etag-2',
        cTag: 'ctag-2',
        lastModifiedDateTime: '2026-08-23T10:00:00Z',
        file: { mimeType: 'application/json' },
        webUrl: 'https://contoso.sharepoint.com/doc.skriv',
        parentReference: { driveId: 'drive-id', id: 'folder-id' },
    };
    let metadataReads = 0;
    const client = createMicrosoftGraphClient({
        getAccessToken: async () => 'token',
        fetchImpl: async (url, init) => {
            calls.push({ url, init });
            if (url.includes('createUploadSession')) {
                return jsonResponse({ uploadUrl: 'https://upload.example/update-session' });
            }
            if (url === 'https://upload.example/update-session') {
                return jsonResponse({ id: 'item-id', eTag: 'etag-2' }, { status: 200 });
            }
            metadataReads += 1;
            return jsonResponse({
                ...metadata,
                eTag: metadataReads === 1 ? 'etag-1' : metadata.eTag,
            });
        },
    });

    const item = await client.updateSkrivDocument({
        driveId: 'drive-id',
        folderId: 'folder-id',
        itemId: 'item-id',
        eTag: 'etag-1',
        content: '{"updated":true}',
    });

    assert.deepEqual(item, {
        id: metadata.id,
        name: metadata.name,
        eTag: metadata.eTag,
        cTag: metadata.cTag,
        lastModifiedDateTime: metadata.lastModifiedDateTime,
        webUrl: metadata.webUrl,
        parentReference: metadata.parentReference,
    });
    assert.equal(requestHeaders(calls[1].init).get('If-Match'), 'etag-1');
    assert.deepEqual(JSON.parse(calls[1].init.body), {});
    assert.equal(requestHeaders(calls[2].init).has('Authorization'), false);
});

test('a differing follow-up eTag reports a race instead of false synced state', async () => {
    const uploadETag = 'etag-for-uploaded-local-bytes';
    let metadataReads = 0;
    const client = createMicrosoftGraphClient({
        getAccessToken: async () => 'token',
        fetchImpl: async (url) => {
            if (url.includes('createUploadSession')) {
                return jsonResponse({ uploadUrl: 'https://upload.example/race-session' });
            }
            if (url === 'https://upload.example/race-session') {
                return jsonResponse({ id: 'item-id', eTag: uploadETag }, { status: 200 });
            }
            metadataReads += 1;
            return jsonResponse({
                id: 'item-id',
                name: 'doc.skriv',
                file: {},
                eTag: metadataReads === 1
                    ? 'etag-before-upload'
                    : 'etag-from-a-later-competing-edit',
                webUrl: 'https://contoso.sharepoint.com/doc.skriv',
                parentReference: { driveId: 'drive-id', id: 'folder-id' },
            });
        },
    });

    await assert.rejects(
        client.updateSkrivDocument({
            driveId: 'drive-id',
            folderId: 'folder-id',
            itemId: 'item-id',
            eTag: 'etag-before-upload',
            content: '{"updated":true}',
        }),
        (error) => error instanceof MicrosoftGraphConflictError
            && error.status === 412
            && error.code === 'remote-changed-after-upload',
    );
});

test('a committed upload survives a failed metadata enrichment read', async (t) => {
    await t.test('create', async () => {
        const client = createMicrosoftGraphClient({
            getAccessToken: async () => 'token',
            fetchImpl: async (url) => {
                if (url.includes('createUploadSession')) {
                    return jsonResponse({ uploadUrl: 'https://upload.example/create-ack' });
                }
                if (url === 'https://upload.example/create-ack') {
                    return jsonResponse({ id: 'created-id', eTag: 'created-etag' }, { status: 201 });
                }
                return responseError(503, 'metadataTemporarilyUnavailable');
            },
        });

        const item = await client.createSkrivDocument({
            driveId: 'drive-id',
            folderId: 'folder-id',
            fileName: 'created.skriv',
            content: '{"created":true}',
        });
        assert.equal(item.id, 'created-id');
        assert.equal(item.eTag, 'created-etag');
        assert.equal(item.name, 'created.skriv');
        assert.deepEqual(item.parentReference, { driveId: 'drive-id', id: 'folder-id' });
    });

    await t.test('update', async () => {
        let metadataReads = 0;
        const client = createMicrosoftGraphClient({
            getAccessToken: async () => 'token',
            fetchImpl: async (url) => {
                if (url.includes('createUploadSession')) {
                    return jsonResponse({ uploadUrl: 'https://upload.example/update-ack' });
                }
                if (url === 'https://upload.example/update-ack') {
                    return jsonResponse({ id: 'updated-id', eTag: 'updated-etag' });
                }
                metadataReads += 1;
                if (metadataReads === 1) {
                    return jsonResponse({
                        id: 'updated-id',
                        name: 'updated.skriv',
                        file: {},
                        eTag: 'previous-etag',
                        webUrl: 'https://contoso.sharepoint.com/updated.skriv',
                        parentReference: { driveId: 'drive-id', id: 'folder-id' },
                    });
                }
                return responseError(404, 'metadataNotYetVisible');
            },
        });

        const item = await client.updateSkrivDocument({
            driveId: 'drive-id',
            folderId: 'folder-id',
            itemId: 'updated-id',
            eTag: 'previous-etag',
            content: '{"updated":true}',
        });
        assert.equal(item.id, 'updated-id');
        assert.equal(item.eTag, 'updated-etag');
    });
});

test('downloadSkrivDocument uses the short-lived URL without forwarding Authorization', async () => {
    const calls = [];
    const downloadUrl = 'https://download.example/preauthenticated';
    const metadata = {
        id: 'item-id',
        name: 'doc.skriv',
        eTag: 'etag',
        cTag: 'ctag',
        lastModifiedDateTime: '2026-08-23T09:00:00Z',
        file: { mimeType: 'application/json' },
        size: 17,
        webUrl: 'https://contoso.sharepoint.com/doc.skriv',
        parentReference: { driveId: 'drive-id', id: 'folder-id' },
        '@microsoft.graph.downloadUrl': downloadUrl,
    };
    const client = createMicrosoftGraphClient({
        getAccessToken: async () => 'token',
        fetchImpl: async (url, init) => {
            calls.push({ url, init });
            return url === downloadUrl
                ? new Response('{"document":true}', { status: 200 })
                : jsonResponse(metadata);
        },
    });

    const result = await client.downloadSkrivDocument({
        driveId: 'drive-id',
        folderId: 'folder-id',
        itemId: 'item-id',
    });
    assert.equal(result.text, '{"document":true}');
    assert.equal(result.item.id, 'item-id');
    assert.equal(result.item.size, 17);
    assert.equal(requestHeaders(calls[0].init).get('Authorization'), 'Bearer token');
    assert.equal(requestHeaders(calls[1].init).has('Authorization'), false);
    assert.equal(calls[1].init.cache, 'no-store');
    assert.equal(calls[1].init.credentials, 'omit');
    assert.equal(calls[1].init.referrerPolicy, 'no-referrer');
});

test('downloadSkrivDocument bounds metadata, Content-Length, and streamed bytes', async (t) => {
    const downloadUrl = 'https://download.example/preauthenticated';
    const metadata = {
        id: 'item-id',
        name: 'doc.skriv',
        file: { mimeType: 'application/json' },
        eTag: 'etag',
        size: 1,
        webUrl: 'https://contoso.sharepoint.com/doc.skriv',
        parentReference: { driveId: 'drive-id', id: 'folder-id' },
        '@microsoft.graph.downloadUrl': downloadUrl,
    };

    await t.test('driveItem size', async () => {
        let fetchCalls = 0;
        const client = createMicrosoftGraphClient({
            maxDownloadBytes: 32,
            getAccessToken: async () => 'token',
            fetchImpl: async () => {
                fetchCalls += 1;
                return jsonResponse({ ...metadata, size: 32 });
            },
        });
        await assert.rejects(
            client.downloadSkrivDocument({ driveId: 'drive-id', folderId: 'folder-id', itemId: 'item-id' }),
            (error) => error instanceof MicrosoftGraphError
                && error.code === 'remote-document-too-large'
                && error.details.source === 'drive-item',
        );
        assert.equal(fetchCalls, 1, 'oversized metadata prevents the content request');
    });

    await t.test('Content-Length', async () => {
        const client = createMicrosoftGraphClient({
            maxDownloadBytes: 32,
            getAccessToken: async () => 'token',
            fetchImpl: async (url) => url === downloadUrl
                ? new Response('x', { headers: { 'Content-Length': '32' } })
                : jsonResponse(metadata),
        });
        await assert.rejects(
            client.downloadSkrivDocument({ driveId: 'drive-id', folderId: 'folder-id', itemId: 'item-id' }),
            (error) => error instanceof MicrosoftGraphError
                && error.code === 'remote-document-too-large'
                && error.details.source === 'content-length',
        );
    });

    await t.test('streamed bytes', async () => {
        const client = createMicrosoftGraphClient({
            maxDownloadBytes: 32,
            getAccessToken: async () => 'token',
            fetchImpl: async (url) => url === downloadUrl
                ? new Response('x'.repeat(32))
                : jsonResponse(metadata),
        });
        await assert.rejects(
            client.downloadSkrivDocument({ driveId: 'drive-id', folderId: 'folder-id', itemId: 'item-id' }),
            (error) => error instanceof MicrosoftGraphError
                && error.code === 'remote-document-too-large'
                && error.details.source === 'stream',
        );
    });

    await t.test('invalid UTF-8 split across chunks', async () => {
        const stream = new ReadableStream({
            start(controller) {
                controller.enqueue(Uint8Array.of(0xe2));
                controller.enqueue(Uint8Array.of(0x28, 0xa1));
                controller.close();
            },
        });
        const client = createMicrosoftGraphClient({
            maxDownloadBytes: 32,
            getAccessToken: async () => 'token',
            fetchImpl: async (url) => url === downloadUrl
                ? new Response(stream)
                : jsonResponse(metadata),
        });
        await assert.rejects(
            client.downloadSkrivDocument({
                driveId: 'drive-id',
                folderId: 'folder-id',
                itemId: 'item-id',
            }),
            (error) => error instanceof MicrosoftGraphError
                && error.code === 'invalid-download-encoding',
        );
    });
});

test('update refuses a linked file moved or renamed outside the selected target', async (t) => {
    for (const [label, mutation] of [
        ['moved', { parentReference: { driveId: 'drive-id', id: 'other-folder' } }],
        ['renamed', { name: 'teacher-notes.docx' }],
    ]) {
        await t.test(label, async () => {
            let calls = 0;
            const client = createMicrosoftGraphClient({
                getAccessToken: async () => 'token',
                fetchImpl: async () => {
                    calls += 1;
                    return jsonResponse({
                        id: 'item-id',
                        name: 'doc.skriv',
                        file: {},
                        eTag: 'etag-1',
                        webUrl: 'https://contoso.sharepoint.com/doc.skriv',
                        parentReference: { driveId: 'drive-id', id: 'folder-id' },
                        ...mutation,
                    });
                },
            });
            await assert.rejects(
                client.updateSkrivDocument({
                    driveId: 'drive-id',
                    folderId: 'folder-id',
                    itemId: 'item-id',
                    eTag: 'etag-1',
                    content: '{"updated":true}',
                }),
                (error) => error instanceof MicrosoftGraphConflictError
                    && error.code === 'remote-item-moved-or-renamed',
            );
            assert.equal(calls, 1, 'no upload session is created for an out-of-target item');
        });
    }
});

test('common Graph statuses use actionable error classes', async (t) => {
    const cases = [
        [401, MicrosoftGraphAuthenticationError, 'unauthenticated'],
        [403, MicrosoftGraphPermissionError, 'forbidden'],
        [404, MicrosoftGraphNotFoundError, 'not-found'],
        [409, MicrosoftGraphConflictError, 'conflict'],
        [429, MicrosoftGraphRateLimitError, 'rate-limited'],
    ];

    for (const [status, ErrorType, kind] of cases) {
        await t.test(String(status), async () => {
            const client = createMicrosoftGraphClient({
                getAccessToken: async () => 'token',
                fetchImpl: async () => responseError(
                    status,
                    `code-${status}`,
                    status === 429 ? { 'Retry-After': '7' } : {},
                ),
            });
            await assert.rejects(
                client.listSkrivDocuments({ driveId: 'drive', folderId: 'folder' }),
                (error) => {
                    assert.ok(error instanceof ErrorType);
                    assert.equal(error.status, status);
                    assert.equal(error.kind, kind);
                    assert.equal(error.code, `code-${status}`);
                    if (status === 429) assert.equal(error.retryAfter, 7);
                    return true;
                },
            );
        });
    }
});

test('transport failures are surfaced as typed network errors', async () => {
    const cause = new TypeError('offline');
    const client = createMicrosoftGraphClient({
        getAccessToken: async () => 'token',
        fetchImpl: async () => { throw cause; },
    });

    await assert.rejects(
        client.listSkrivDocuments({ driveId: 'drive', folderId: 'folder' }),
        (error) => {
            assert.ok(error instanceof MicrosoftGraphError);
            assert.equal(error.code, 'network-error');
            assert.equal(error.kind, 'network');
            assert.equal(error.cause, cause);
            return true;
        },
    );
});
