import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
    getMicrosoftStorageErrorKey,
    getMicrosoftSyncStateKey,
    getSafeMicrosoftUrl,
    normalizeRemoteDocuments,
} from '../public/js/app/microsoft-storage-dialog.js';

test('maps Graph and auth failures to generic localized messages', () => {
    assert.equal(getMicrosoftStorageErrorKey({ status: 401, body: 'secret Graph body' }), 'microsoft.error.signIn');
    assert.equal(getMicrosoftStorageErrorKey({ status: 403 }), 'microsoft.error.permission');
    assert.equal(getMicrosoftStorageErrorKey({ status: 404 }), 'microsoft.error.remoteMissing');
    assert.equal(getMicrosoftStorageErrorKey({ status: 412 }), 'microsoft.error.conflict');
    assert.equal(getMicrosoftStorageErrorKey({ status: 429 }), 'microsoft.error.rateLimited');
    assert.equal(getMicrosoftStorageErrorKey({ code: 'account-mismatch' }), 'microsoft.error.signIn');
    assert.equal(getMicrosoftStorageErrorKey({ code: 'token-unavailable' }), 'microsoft.error.signIn');
    assert.equal(getMicrosoftStorageErrorKey({ code: 'not-connected' }), 'microsoft.error.signIn');
    assert.equal(getMicrosoftStorageErrorKey({ code: 'target-mismatch' }), 'microsoft.error.folderLink');
    assert.equal(getMicrosoftStorageErrorKey({ code: 'invalid-document', message: '<private text>' }), 'microsoft.error.invalidDocument');
    assert.equal(getMicrosoftStorageErrorKey({ code: 'remote-document-too-large' }), 'microsoft.error.documentTooLarge');
    assert.equal(getMicrosoftStorageErrorKey({ code: 'remote-list-too-large' }), 'microsoft.error.folderTooLarge');
    assert.equal(getMicrosoftStorageErrorKey({ code: 'remote-document-already-linked' }), 'microsoft.error.alreadyLinked');
    assert.equal(getMicrosoftStorageErrorKey({ code: 'remote-document-in-trash' }), 'microsoft.error.alreadyInTrash');
    assert.equal(getMicrosoftStorageErrorKey(new TypeError('Failed to fetch https://private.example')), 'microsoft.error.network');
    assert.equal(getMicrosoftStorageErrorKey({ message: 'raw service response must not surface' }), 'microsoft.error.generic');
});

test('maps every documented sync state without returning service text', () => {
    assert.equal(getMicrosoftSyncStateKey('local-only'), 'microsoft.status.localOnly');
    assert.equal(getMicrosoftSyncStateKey('syncing'), 'microsoft.status.syncing');
    assert.equal(getMicrosoftSyncStateKey('synced'), 'microsoft.status.synced');
    assert.equal(getMicrosoftSyncStateKey('conflict'), 'microsoft.status.conflict');
    assert.equal(getMicrosoftSyncStateKey('pending'), 'microsoft.status.pending');
    assert.equal(getMicrosoftSyncStateKey('needs-sign-in'), 'microsoft.status.needsSignIn');
    assert.equal(getMicrosoftSyncStateKey('forbidden'), 'microsoft.status.forbidden');
    assert.equal(getMicrosoftSyncStateKey('permission-denied'), 'microsoft.status.permissionDenied');
    assert.equal(getMicrosoftSyncStateKey('remote-missing'), 'microsoft.status.remoteMissing');
    assert.equal(getMicrosoftSyncStateKey('account-mismatch'), 'microsoft.status.accountMismatch');
    assert.equal(getMicrosoftSyncStateKey('target-required'), 'microsoft.status.targetRequired');
    assert.equal(getMicrosoftSyncStateKey('target-mismatch'), 'microsoft.status.targetMismatch');
    assert.equal(getMicrosoftSyncStateKey('anything from a server'), 'microsoft.status.unknown');
});

test('renders only HTTPS folder destinations', () => {
    assert.equal(
        getSafeMicrosoftUrl(
            'https://school.sharepoint.com/Shared%20Documents/Skriv',
            'school.sharepoint.com',
        ),
        'https://school.sharepoint.com/Shared%20Documents/Skriv',
    );
    assert.equal(
        getSafeMicrosoftUrl(
            'https://school-my.sharepoint.com/personal/student/Documents/Skriv',
            'school.sharepoint.com',
        ),
        'https://school-my.sharepoint.com/personal/student/Documents/Skriv',
    );
    assert.equal(getSafeMicrosoftUrl('javascript:alert(1)', 'school.sharepoint.com'), '');
    assert.equal(getSafeMicrosoftUrl('data:text/html,<script>alert(1)</script>', 'school.sharepoint.com'), '');
    assert.equal(getSafeMicrosoftUrl('http://school.sharepoint.com/folder', 'school.sharepoint.com'), '');
    assert.equal(getSafeMicrosoftUrl('https://other.sharepoint.com/folder', 'school.sharepoint.com'), '');
    assert.equal(getSafeMicrosoftUrl('not a URL', 'school.sharepoint.com'), '');
});

test('normalizes Graph list shapes, keeps only .skriv files, and sorts copies', () => {
    const original = [
        { id: '2', name: 'Øving.skriv' },
        { id: 'x', name: '<img src=x onerror=alert(1)>.docx' },
        { id: '1', name: 'Arbeid.SKRIV' },
    ];
    const normalized = normalizeRemoteDocuments({ value: original });

    assert.deepEqual(normalized.map(item => item.id), ['1', '2']);
    assert.equal(original[0].id, '2');
});

test('sharing link field never renders a pasted value and source never logs it', async () => {
    const source = await readFile(
        new URL('../public/js/app/microsoft-storage-dialog.js', import.meta.url),
        'utf8',
    );
    const folderForm = source.match(/<form data-microsoft-folder-form[\s\S]*?<\/form>/)?.[0] || '';

    assert.match(folderForm, /data-microsoft-folder-link type=\"password\"/);
    assert.match(folderForm, /autocomplete=\"off\"/);
    assert.doesNotMatch(folderForm, /\bvalue\s*=/);
    assert.match(source, /const sharingUrl = input\?\.value \|\| '';/);
    assert.match(source, /if \(input\) input\.value = '';/);
    assert.match(source, /storage\.selectTarget\(sharingUrl\)/);
    assert.match(source, /isMicrosoftSharePointUrlAllowed\([\s\S]*?sharingUrl/);
    assert.doesNotMatch(source, /console\.(?:log|info|warn|error|debug)/);
});

test('localhost configuration form requires the school SharePoint host', async () => {
    const source = await readFile(
        new URL('../public/js/app/microsoft-storage-dialog.js', import.meta.url),
        'utf8',
    );

    assert.match(source, /data-microsoft-sharepoint-host type="text" required/);
    assert.match(source, /setMicrosoftConfigOverrides\(\{ clientId, tenantId, sharePointHost \}\)/);
    assert.match(source, /microsoft\.sharePointHostLabel/);
    assert.match(source, /microsoft\.error\.folderHost/);
});

test('dialog source localizes all visible strings and escapes dynamic markup', async () => {
    const source = await readFile(
        new URL('../public/js/app/microsoft-storage-dialog.js', import.meta.url),
        'utf8',
    );
    const literalTranslationKeys = [...source.matchAll(/\bt\('([^']+)'/g)].map(match => match[1]);

    assert.ok(literalTranslationKeys.length > 20);
    assert.ok(literalTranslationKeys.every(key => key.startsWith('microsoft.')));
    assert.match(source, /escapeHtml\(item\.name \|\| ''\)/);
    assert.match(source, /escapeHtml\(label\)/);
    assert.match(source, /escapeAttr\(folderUrl\)/);
    assert.match(source, /const syncError = unsuccessfulSyncResult\(result\);/);
    assert.match(source, /result\?\.linked !== false/);
    assert.match(source, /data-microsoft-action="reconnect"/);
    assert.match(source, /await storage\.connect\(\);[\s\S]*?storage\.syncDocument\(documentId\)/);
    assert.match(source, /renderUnavailableLinkedDocument/);
    assert.match(source, /storage\.getDocumentSyncState\(documentId\)[\s\S]*?storage\.getAccount\(\)/);
    assert.match(source, /\$\{localUnlinkControl\}[\s\S]*?renderSignedOut/);
    assert.match(source, /\$\{localUnlinkControl\}[\s\S]*?renderFolderPicker/);
    assert.match(source, /config\?\.source !== 'localhost-session'/);
    assert.match(source, /await storage\.disconnect\(\);[\s\S]*?clearMicrosoftConfigOverrides\(\)/);
    assert.doesNotMatch(source, /error\.(?:message|body|responseText)/);
});
