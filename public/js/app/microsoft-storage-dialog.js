/**
 * Microsoft 365 storage dialog.
 *
 * Keeps the optional school-account connection understandable and separate
 * from Skriv's local-first save path. The dialog never stores or renders the
 * sharing URL a pupil pastes; it hands the value directly to the storage
 * service and immediately clears the input.
 */

import { t } from '../editor-core/shared/i18n.js';
import { escapeHtml, escapeAttr } from '../editor-core/shared/html-escape.js';
import { getModalParent } from '../editor-core/shared/dom-helpers.js';
import {
    clearMicrosoftConfigOverrides,
    isMicrosoftSharePointUrlAllowed,
    isMicrosoftLocalhost,
    setMicrosoftConfigOverrides,
} from './microsoft-config.js';

const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

const SYNC_STATE_KEYS = Object.freeze({
    'local-only': 'microsoft.status.localOnly',
    syncing: 'microsoft.status.syncing',
    synced: 'microsoft.status.synced',
    conflict: 'microsoft.status.conflict',
    pending: 'microsoft.status.pending',
    'needs-sign-in': 'microsoft.status.needsSignIn',
    forbidden: 'microsoft.status.forbidden',
    'permission-denied': 'microsoft.status.permissionDenied',
    'remote-missing': 'microsoft.status.remoteMissing',
    'account-mismatch': 'microsoft.status.accountMismatch',
    'target-required': 'microsoft.status.targetRequired',
    'target-mismatch': 'microsoft.status.targetMismatch',
    error: 'microsoft.status.error',
});

const ERROR_CODE_KEYS = Object.freeze({
    401: 'microsoft.error.signIn',
    403: 'microsoft.error.permission',
    404: 'microsoft.error.remoteMissing',
    409: 'microsoft.error.conflict',
    412: 'microsoft.error.conflict',
    429: 'microsoft.error.rateLimited',
});

/**
 * Convert an operational failure into a pupil-friendly translation key.
 * Raw Graph messages and response bodies are deliberately ignored.
 */
export function getMicrosoftStorageErrorKey(error) {
    const status = Number(error?.status || error?.statusCode || error?.response?.status || 0);
    if (ERROR_CODE_KEYS[status]) return ERROR_CODE_KEYS[status];

    const code = String(error?.code || error?.errorCode || '').toLowerCase();
    if (code.includes('remote-document-too-large')) {
        return 'microsoft.error.documentTooLarge';
    }
    if (code.includes('remote-list-too-large')) {
        return 'microsoft.error.folderTooLarge';
    }
    if (code.includes('remote-document-in-trash')) {
        return 'microsoft.error.alreadyInTrash';
    }
    if (code.includes('remote-document-already-linked')) {
        return 'microsoft.error.alreadyLinked';
    }
    if (
        code.includes('sign-in') ||
        code.includes('signin') ||
        code.includes('login') ||
        code.includes('interaction_required') ||
        code.includes('no-account') ||
        code.includes('no_account') ||
        code.includes('not-connected') ||
        code.includes('token-unavailable') ||
        code.includes('account-mismatch')
    ) return 'microsoft.error.signIn';
    if (
        code.includes('forbidden') ||
        code.includes('denied') ||
        code.includes('consent') ||
        code.includes('permission')
    ) return 'microsoft.error.permission';
    if (code.includes('not-found') || code.includes('not_found') || code.includes('remote-missing')) {
        return 'microsoft.error.remoteMissing';
    }
    if (code.includes('conflict') || code.includes('precondition') || code.includes('etag')) {
        return 'microsoft.error.conflict';
    }
    if (code.includes('rate') || code.includes('throttle')) return 'microsoft.error.rateLimited';
    if (
        code.includes('config') ||
        code.includes('client-id') ||
        code.includes('tenant-id') ||
        code.includes('sharepoint-host')
    ) {
        return 'microsoft.error.invalidConfig';
    }
    if (
        code.includes('document') ||
        code.includes('invalid-file') ||
        code.includes('invalid_file') ||
        code.includes('parse') ||
        code.includes('unsupported-file')
    ) return 'microsoft.error.invalidDocument';
    if (
        code.includes('folder') ||
        code.includes('sharing-url') ||
        code.includes('sharing_url') ||
        code.includes('target-required') ||
        code.includes('target-mismatch')
    ) {
        return 'microsoft.error.folderLink';
    }
    if (
        error?.name === 'TypeError' ||
        code.includes('network') ||
        code.includes('offline') ||
        code.includes('fetch') ||
        status === 0 && error?.response
    ) return 'microsoft.error.network';

    return 'microsoft.error.generic';
}

/** Return the localized status key for a storage state. */
export function getMicrosoftSyncStateKey(state) {
    return SYNC_STATE_KEYS[String(state || '').toLowerCase()] || 'microsoft.status.unknown';
}

/**
 * Return a safe external folder URL. Only HTTPS links are rendered.
 */
export function getSafeMicrosoftUrl(value, sharePointHost) {
    if (!isMicrosoftSharePointUrlAllowed(value, sharePointHost)) return '';
    try {
        const url = new URL(String(value || ''));
        return url.href;
    } catch {
        return '';
    }
}

/** Normalize and sort a Graph list response without trusting its file names. */
export function normalizeRemoteDocuments(result) {
    const items = Array.isArray(result)
        ? result
        : Array.isArray(result?.items)
            ? result.items
            : Array.isArray(result?.value)
                ? result.value
                : [];

    return items
        .filter(item => item && typeof item === 'object' && /\.skriv$/i.test(String(item.name || '')))
        .slice()
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, {
            sensitivity: 'base',
        }));
}

function accountLabel(account) {
    return account?.name || account?.username || account?.email || '';
}

function targetLabel(target) {
    return target?.folderName || target?.name || target?.displayName || '';
}

function targetWebUrl(target, sharePointHost) {
    return getSafeMicrosoftUrl(
        target?.folderWebUrl || target?.webUrl || '',
        sharePointHost,
    );
}

function getSyncStateName(syncState) {
    return syncState?.state || syncState?.status || 'local-only';
}

function isDocumentLinked(syncState) {
    return Boolean(
        syncState?.linked ||
        syncState?.link?.itemId ||
        syncState?.link?.id ||
        syncState?.document?.microsoft365,
    );
}

function changedDocument(result, fallback) {
    return result?.document || result?.doc || fallback?.document || fallback?.doc || null;
}

function unsuccessfulSyncResult(result) {
    const state = getSyncStateName(result);
    if (state === 'synced') return null;
    return {
        code: result?.link?.errorCode || result?.errorCode || state || 'sync-failed',
        status: state === 'conflict' ? 412 : 0,
    };
}

function isLocalEnvironment(config) {
    if (typeof config?.localhost === 'boolean') return config.localhost;
    return isMicrosoftLocalhost(globalThis.location);
}

function disabledAttribute(busy) {
    return busy ? ' disabled aria-disabled="true"' : '';
}

function renderNotice(notice) {
    if (!notice?.key) return '';
    const isError = notice.tone === 'error';
    const role = isError ? 'alert' : 'status';
    const classes = isError
        ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200'
        : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200';
    return `
        <div role="${role}" class="rounded-lg border px-3 py-2 text-sm ${classes}">
            ${escapeHtml(t(notice.key, notice.params))}
        </div>
    `;
}

function renderAccount(account, busy) {
    const label = accountLabel(account);
    return `
        <section class="rounded-xl border border-stone-200 bg-stone-50 p-3 dark:border-stone-700 dark:bg-stone-900/50">
            <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="min-w-0">
                    <p class="text-[11px] font-semibold uppercase tracking-wide text-stone-400">
                        ${escapeHtml(t('microsoft.accountLabel'))}
                    </p>
                    <p class="truncate text-sm font-medium text-stone-800 dark:text-stone-100">
                        ${escapeHtml(label)}
                    </p>
                </div>
                <button type="button" data-microsoft-action="disconnect"
                    class="rounded-lg px-3 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-200 disabled:opacity-50 dark:text-stone-300 dark:hover:bg-stone-700"
                    ${disabledAttribute(busy)}>
                    ${escapeHtml(t('microsoft.disconnect'))}
                </button>
            </div>
        </section>
    `;
}

function renderInvalidConfiguration(config, local, busy) {
    if (!local) {
        return `
            <section class="space-y-2 text-center">
                <h3 class="text-base font-semibold text-stone-900 dark:text-stone-100">
                    ${escapeHtml(t('microsoft.adminConfigTitle'))}
                </h3>
                <p class="text-sm leading-relaxed text-stone-600 dark:text-stone-400">
                    ${escapeHtml(t('microsoft.adminConfigBody'))}
                </p>
            </section>
        `;
    }

    const canClear = Boolean(
        config?.source === 'localhost-session' ||
        config?.clientId ||
        config?.tenantId ||
        config?.sharePointHost,
    );
    return `
        <section class="space-y-3">
            <div>
                <h3 class="text-base font-semibold text-stone-900 dark:text-stone-100">
                    ${escapeHtml(t('microsoft.devConfigTitle'))}
                </h3>
                <p class="mt-1 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
                    ${escapeHtml(t('microsoft.devConfigBody'))}
                </p>
            </div>
            <form data-microsoft-config-form class="space-y-3" novalidate>
                <label class="block text-sm font-medium text-stone-700 dark:text-stone-200">
                    ${escapeHtml(t('microsoft.clientIdLabel'))}
                    <input data-microsoft-client-id type="text" required autocomplete="off" autocapitalize="off" spellcheck="false"
                        value="${escapeAttr(config?.clientId || '')}"
                        class="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-mono text-sm text-stone-800 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100" />
                </label>
                <label class="block text-sm font-medium text-stone-700 dark:text-stone-200">
                    ${escapeHtml(t('microsoft.tenantIdLabel'))}
                    <input data-microsoft-tenant-id type="text" required autocomplete="off" autocapitalize="off" spellcheck="false"
                        value="${escapeAttr(config?.tenantId || '')}"
                        class="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-mono text-sm text-stone-800 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100" />
                </label>
                <label class="block text-sm font-medium text-stone-700 dark:text-stone-200">
                    ${escapeHtml(t('microsoft.sharePointHostLabel'))}
                    <input data-microsoft-sharepoint-host type="text" required autocomplete="off" autocapitalize="off" spellcheck="false"
                        value="${escapeAttr(config?.sharePointHost || '')}"
                        class="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-mono text-sm text-stone-800 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100" />
                </label>
                <div class="flex flex-wrap justify-end gap-2">
                    ${canClear ? `
                        <button type="button" data-microsoft-action="clear-configuration"
                            class="rounded-lg px-3 py-2 text-sm font-semibold text-stone-600 hover:bg-stone-100 disabled:opacity-50 dark:text-stone-300 dark:hover:bg-stone-700"
                            ${disabledAttribute(busy)}>
                            ${escapeHtml(t('microsoft.clearConfiguration'))}
                        </button>
                    ` : ''}
                    <button type="submit"
                        class="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                        ${disabledAttribute(busy)}>
                        ${escapeHtml(t('microsoft.saveConfiguration'))}
                    </button>
                </div>
            </form>
        </section>
    `;
}

function renderSignedOut(busy) {
    return `
        <section class="space-y-3 text-center">
            <div>
                <h3 class="text-base font-semibold text-stone-900 dark:text-stone-100">
                    ${escapeHtml(t('microsoft.connectionTitle'))}
                </h3>
                <p class="mt-1 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
                    ${escapeHtml(t('microsoft.connectionBody'))}
                </p>
            </div>
            <button type="button" data-microsoft-action="connect" data-autofocus
                class="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                ${disabledAttribute(busy)}>
                ${escapeHtml(t('microsoft.connect'))}
            </button>
        </section>
    `;
}

function renderUnavailableLinkedDocument(syncState, busy) {
    const fileName = syncState?.link?.fileName
        || syncState?.document?.microsoft365?.fileName
        || '';
    return `
        <section class="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
            <div>
                <h3 class="text-base font-semibold text-stone-900 dark:text-stone-100">
                    ${escapeHtml(t('microsoft.editorTitle'))}
                </h3>
                <p class="mt-1 text-sm leading-relaxed text-stone-700 dark:text-stone-300">
                    ${escapeHtml(t('microsoft.localUnlinkAvailable'))}
                </p>
                ${fileName ? `
                    <p class="mt-1 truncate text-xs text-stone-500">${escapeHtml(fileName)}</p>
                ` : ''}
            </div>
            <div class="flex justify-end">
                <button type="button" data-microsoft-action="unlink" data-autofocus
                    class="rounded-lg bg-stone-700 px-3 py-2 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-50 dark:bg-stone-200 dark:text-stone-900 dark:hover:bg-white"
                    ${disabledAttribute(busy)}>
                    ${escapeHtml(t('microsoft.unlink'))}
                </button>
            </div>
        </section>
    `;
}

function renderClearTestConfiguration(config, busy) {
    if (!isLocalEnvironment(config) || config?.source !== 'localhost-session') return '';
    return `
        <section class="flex justify-end border-t border-stone-100 pt-3 dark:border-stone-700">
            <button type="button" data-microsoft-action="clear-configuration"
                class="rounded-lg px-3 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-100 disabled:opacity-50 dark:text-stone-300 dark:hover:bg-stone-700"
                ${disabledAttribute(busy)}>
                ${escapeHtml(t('microsoft.clearConfiguration'))}
            </button>
        </section>
    `;
}

function renderFolderPicker(account, busy) {
    return `
        <div class="space-y-3">
            ${renderAccount(account, busy)}
            <section class="space-y-3">
                <div>
                    <h3 class="text-base font-semibold text-stone-900 dark:text-stone-100">
                        ${escapeHtml(t('microsoft.folderTitle'))}
                    </h3>
                    <p id="microsoft-folder-help" class="mt-1 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
                        ${escapeHtml(t('microsoft.folderBody'))}
                    </p>
                </div>
                <form data-microsoft-folder-form class="space-y-2">
                    <label class="block text-sm font-medium text-stone-700 dark:text-stone-200">
                        ${escapeHtml(t('microsoft.folderLinkLabel'))}
                        <input data-microsoft-folder-link type="password" inputmode="url" required autocomplete="off"
                            autocapitalize="off" spellcheck="false" aria-describedby="microsoft-folder-help"
                            placeholder="${escapeAttr(t('microsoft.folderLinkPlaceholder'))}"
                            class="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100" />
                    </label>
                    <div class="flex justify-end">
                        <button type="submit"
                            class="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                            ${disabledAttribute(busy)}>
                            ${escapeHtml(t('microsoft.selectFolder'))}
                        </button>
                    </div>
                </form>
            </section>
        </div>
    `;
}

function renderTargetSummary(account, target, config, busy) {
    const folderUrl = targetWebUrl(target, config?.sharePointHost);
    return `
        <div class="space-y-3">
            ${renderAccount(account, busy)}
            <section class="rounded-xl border border-stone-200 p-3 dark:border-stone-700">
                <div class="flex flex-wrap items-center justify-between gap-2">
                    <div class="min-w-0">
                        <p class="text-[11px] font-semibold uppercase tracking-wide text-stone-400">
                            ${escapeHtml(t('microsoft.selectedFolderLabel'))}
                        </p>
                        <p class="truncate text-sm font-medium text-stone-800 dark:text-stone-100">
                            ${escapeHtml(targetLabel(target))}
                        </p>
                    </div>
                    <div class="flex flex-wrap gap-1">
                        ${folderUrl ? `
                            <a href="${escapeAttr(folderUrl)}" target="_blank" rel="noopener noreferrer"
                                class="rounded-lg px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40">
                                ${escapeHtml(t('microsoft.openFolder'))}
                            </a>
                        ` : ''}
                        <button type="button" data-microsoft-action="clear-target"
                            class="rounded-lg px-3 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-100 disabled:opacity-50 dark:text-stone-300 dark:hover:bg-stone-700"
                            ${disabledAttribute(busy)}>
                            ${escapeHtml(t('microsoft.changeFolder'))}
                        </button>
                    </div>
                </div>
            </section>
        </div>
    `;
}

function renderRemoteLibrary(remoteState, busy) {
    let content = '';
    if (remoteState.status === 'loading' || remoteState.status === 'idle') {
        content = `
            <div role="status" class="py-6 text-center text-sm text-stone-500 dark:text-stone-400">
                ${escapeHtml(t('microsoft.loading'))}
            </div>
        `;
    } else if (remoteState.status === 'error') {
        content = `
            <div class="rounded-lg border border-red-200 bg-red-50 p-3 text-center dark:border-red-800 dark:bg-red-950/40">
                <p role="alert" class="text-sm text-red-800 dark:text-red-200">
                    ${escapeHtml(t(remoteState.errorKey || 'microsoft.error.generic'))}
                </p>
                <button type="button" data-microsoft-action="retry-list"
                    class="mt-2 rounded-lg px-3 py-2 text-sm font-semibold text-red-800 hover:bg-red-100 dark:text-red-200 dark:hover:bg-red-900/40"
                    ${disabledAttribute(busy)}>
                    ${escapeHtml(t('microsoft.retry'))}
                </button>
            </div>
        `;
    } else if (remoteState.items.length === 0) {
        content = `
            <p class="rounded-lg bg-stone-50 px-3 py-5 text-center text-sm text-stone-500 dark:bg-stone-900/50 dark:text-stone-400">
                ${escapeHtml(t('microsoft.libraryEmpty'))}
            </p>
        `;
    } else {
        content = `
            <ul class="max-h-64 space-y-2 overflow-y-auto" aria-label="${escapeAttr(t('microsoft.libraryTitle'))}">
                ${remoteState.items.map((item, index) => {
                    const importing = remoteState.importingIndex === index;
                    return `
                        <li class="flex items-center justify-between gap-3 rounded-lg border border-stone-200 px-3 py-2 dark:border-stone-700">
                            <span class="min-w-0 truncate text-sm font-medium text-stone-800 dark:text-stone-100">
                                ${escapeHtml(item.name || '')}
                            </span>
                            <button type="button" data-microsoft-action="import" data-remote-index="${index}"
                                class="flex-shrink-0 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                                ${disabledAttribute(busy)}>
                                ${escapeHtml(t(importing ? 'microsoft.loading' : 'microsoft.import'))}
                            </button>
                        </li>
                    `;
                }).join('')}
            </ul>
        `;
    }

    return `
        <section class="space-y-2">
            <h3 class="text-base font-semibold text-stone-900 dark:text-stone-100">
                ${escapeHtml(t('microsoft.libraryTitle'))}
            </h3>
            ${content}
        </section>
    `;
}

function renderEditorSync(syncState, busy) {
    const state = getSyncStateName(syncState);
    const linked = isDocumentLinked(syncState);
    const needsReconnect = linked && ['needs-sign-in', 'account-mismatch'].includes(state);
    const fileName = syncState?.link?.fileName || syncState?.document?.microsoft365?.fileName || '';
    return `
        <section class="space-y-3">
            <div>
                <h3 class="text-base font-semibold text-stone-900 dark:text-stone-100">
                    ${escapeHtml(t('microsoft.editorTitle'))}
                </h3>
                <div class="mt-2 rounded-lg bg-stone-50 px-3 py-2 dark:bg-stone-900/50">
                    <p role="status" class="text-sm font-medium text-stone-700 dark:text-stone-200">
                        ${escapeHtml(t(getMicrosoftSyncStateKey(state)))}
                    </p>
                    ${fileName ? `
                        <p class="mt-0.5 truncate text-xs text-stone-400">${escapeHtml(fileName)}</p>
                    ` : ''}
                </div>
            </div>
            <div class="flex flex-wrap justify-end gap-2">
                ${linked ? `
                    <button type="button" data-microsoft-action="unlink"
                        class="rounded-lg px-3 py-2 text-sm font-semibold text-stone-600 hover:bg-stone-100 disabled:opacity-50 dark:text-stone-300 dark:hover:bg-stone-700"
                        ${disabledAttribute(busy)}>
                        ${escapeHtml(t('microsoft.unlink'))}
                    </button>
                ` : ''}
                ${state === 'conflict' ? `
                    <button type="button" data-microsoft-action="keep-both"
                        class="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
                        ${disabledAttribute(busy)}>
                        ${escapeHtml(t('microsoft.keepBoth'))}
                    </button>
                ` : ''}
                ${needsReconnect ? `
                    <button type="button" data-microsoft-action="reconnect"
                        class="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                        ${disabledAttribute(busy)}>
                        ${escapeHtml(t('microsoft.reconnect'))}
                    </button>
                ` : `
                    <button type="button" data-microsoft-action="sync"
                        class="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                        ${disabledAttribute(busy)}>
                        ${escapeHtml(t(linked ? 'microsoft.syncNow' : 'microsoft.linkNow'))}
                    </button>
                `}
            </div>
        </section>
    `;
}

/**
 * Show the optional Microsoft 365 storage dialog.
 *
 * @param {Object} options
 * @param {Object} options.storage Microsoft storage service
 * @param {string} [options.documentId] Present in editor mode
 * @param {Function} [options.onImported]
 * @param {Function} [options.onDocumentChanged]
 * @param {Function} [options.onConfigurationChanged]
 * @returns {Promise<void>} Resolves when the dialog closes
 */
export function showMicrosoftStorageDialog({
    storage,
    documentId,
    onImported = () => {},
    onDocumentChanged = () => {},
    onConfigurationChanged = () => {},
} = {}) {
    if (!storage) throw new TypeError('A Microsoft storage service is required.');

    document.querySelectorAll('[data-microsoft-storage-dialog]').forEach(element => element.remove());

    return new Promise((resolve) => {
        const previousFocus = document.activeElement;
        let closed = false;
        let hasFocused = false;
        let refreshVersion = 0;
        let remoteLoadVersion = 0;
        let busyAction = '';
        let notice = null;
        let currentSyncState = null;
        let currentConfig = null;
        const remoteState = {
            status: 'idle',
            items: [],
            errorKey: '',
            importingIndex: -1,
        };

        const overlay = document.createElement('div');
        overlay.setAttribute('data-microsoft-storage-dialog', '');
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'microsoft-storage-title');
        overlay.className = 'fixed inset-0 flex items-center justify-center bg-black/70 p-4';
        overlay.style.zIndex = '220';
        overlay.innerHTML = `
            <div class="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-stone-800">
                <header class="flex items-center justify-between gap-3 border-b border-stone-200 px-5 py-4 dark:border-stone-700">
                    <div class="min-w-0">
                        <h2 id="microsoft-storage-title" class="truncate text-lg font-bold text-stone-900 dark:text-stone-100">
                            ${escapeHtml(t('microsoft.title'))}
                        </h2>
                    </div>
                    <button type="button" data-microsoft-close data-autofocus
                        class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-xl text-stone-500 hover:bg-stone-100 hover:text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:hover:bg-stone-700 dark:hover:text-stone-100"
                        aria-label="${escapeAttr(t('microsoft.close'))}" title="${escapeAttr(t('microsoft.close'))}">
                        <span aria-hidden="true">&times;</span>
                    </button>
                </header>
                <div class="max-h-[min(76vh,42rem)] overflow-y-auto px-5 py-4">
                    <div data-microsoft-notice aria-live="polite"></div>
                    <div data-microsoft-body class="mt-3">
                        <div role="status" class="py-8 text-center text-sm text-stone-500 dark:text-stone-400">
                            ${escapeHtml(t('microsoft.loading'))}
                        </div>
                    </div>
                    <p class="mt-4 border-t border-stone-100 pt-3 text-xs leading-relaxed text-stone-500 dark:border-stone-700 dark:text-stone-400">
                        ${escapeHtml(t('microsoft.localAutosave'))}
                    </p>
                </div>
            </div>
        `;

        const body = overlay.querySelector('[data-microsoft-body]');
        const noticeElement = overlay.querySelector('[data-microsoft-notice]');

        function close() {
            if (closed) return;
            closed = true;
            refreshVersion += 1;
            remoteLoadVersion += 1;
            overlay.remove();
            if (previousFocus?.focus) previousFocus.focus();
            resolve();
        }

        function focusInitialControl() {
            if (closed) return;
            if (hasFocused) {
                if (!overlay.contains(document.activeElement)) {
                    overlay.querySelector('[data-microsoft-close]')?.focus?.();
                }
                return;
            }
            hasFocused = true;
            const control = overlay.querySelector('[data-autofocus]') || overlay.querySelector(FOCUSABLE_SELECTOR);
            control?.focus?.();
        }

        function showNotice(key, tone = 'success', params) {
            notice = { key, tone, params };
        }

        function resetRemoteState() {
            remoteLoadVersion += 1;
            remoteState.status = 'idle';
            remoteState.items = [];
            remoteState.errorKey = '';
            remoteState.importingIndex = -1;
        }

        async function loadRemoteDocuments() {
            const version = ++remoteLoadVersion;
            try {
                const result = await storage.listRemoteDocuments();
                if (closed || version !== remoteLoadVersion) return;
                remoteState.items = normalizeRemoteDocuments(result);
                remoteState.status = 'loaded';
                remoteState.errorKey = '';
            } catch (error) {
                if (closed || version !== remoteLoadVersion) return;
                remoteState.items = [];
                remoteState.status = 'error';
                remoteState.errorKey = getMicrosoftStorageErrorKey(error);
            }
            await refresh();
        }

        async function refresh() {
            if (closed) return;
            const version = ++refreshVersion;
            noticeElement.innerHTML = renderNotice(notice);

            try {
                const config = await Promise.resolve(storage.getConfig());
                currentConfig = config;
                const configured = await Promise.resolve(storage.isConfigured());
                if (closed || version !== refreshVersion) return;

                if (!configured) {
                    if (documentId) {
                        currentSyncState = await Promise.resolve(
                            storage.getDocumentSyncState(documentId),
                        );
                        if (closed || version !== refreshVersion) return;
                    }
                    const linked = documentId && isDocumentLinked(currentSyncState);
                    body.innerHTML = linked
                        ? `<div class="space-y-4">
                            ${renderUnavailableLinkedDocument(currentSyncState, Boolean(busyAction))}
                            ${renderInvalidConfiguration(
                                config,
                                isLocalEnvironment(config),
                                Boolean(busyAction),
                            )}
                        </div>`
                        : renderInvalidConfiguration(
                            config,
                            isLocalEnvironment(config),
                            Boolean(busyAction),
                        );
                    focusInitialControl();
                    return;
                }

                const localConfigurationControl = renderClearTestConfiguration(
                    config,
                    Boolean(busyAction),
                );

                if (documentId) {
                    currentSyncState = await Promise.resolve(
                        storage.getDocumentSyncState(documentId),
                    );
                    if (closed || version !== refreshVersion) return;
                }
                const localUnlinkControl = documentId && isDocumentLinked(currentSyncState)
                    ? renderUnavailableLinkedDocument(currentSyncState, Boolean(busyAction))
                    : '';

                const account = await Promise.resolve(storage.getAccount());
                if (closed || version !== refreshVersion) return;
                if (!account) {
                    body.innerHTML = `<div class="space-y-4">
                        ${localUnlinkControl}
                        ${renderSignedOut(Boolean(busyAction))}
                        ${localConfigurationControl}
                    </div>`;
                    focusInitialControl();
                    return;
                }

                const target = await Promise.resolve(storage.getTarget());
                if (closed || version !== refreshVersion) return;
                const targetAllowed = target && isMicrosoftSharePointUrlAllowed(
                    target?.folderWebUrl || target?.webUrl || '',
                    config?.sharePointHost,
                );
                if (!targetAllowed) {
                    if (target) {
                        // Discard stale or cross-tenant session coordinates.
                        // This only clears Skriv's local session target; it
                        // never deletes or changes anything in Microsoft 365.
                        await Promise.resolve(storage.clearTarget()).catch(() => {});
                        if (closed || version !== refreshVersion) return;
                        notice = { key: 'microsoft.error.folderHost', tone: 'error' };
                        noticeElement.innerHTML = renderNotice(notice);
                    }
                    body.innerHTML = `<div class="space-y-4">
                        ${localUnlinkControl}
                        ${renderFolderPicker(account, Boolean(busyAction))}
                        ${localConfigurationControl}
                    </div>`;
                    focusInitialControl();
                    return;
                }

                if (documentId) {
                    body.innerHTML = `
                        <div class="space-y-4">
                            ${renderTargetSummary(account, target, config, Boolean(busyAction))}
                            ${renderEditorSync(currentSyncState, Boolean(busyAction))}
                            ${localConfigurationControl}
                        </div>
                    `;
                } else {
                    const shouldLoadRemoteDocuments = remoteState.status === 'idle';
                    if (shouldLoadRemoteDocuments) remoteState.status = 'loading';
                    body.innerHTML = `
                        <div class="space-y-4">
                            ${renderTargetSummary(account, target, config, Boolean(busyAction))}
                            ${renderRemoteLibrary(remoteState, Boolean(busyAction))}
                            ${localConfigurationControl}
                        </div>
                    `;
                    if (shouldLoadRemoteDocuments) {
                        void loadRemoteDocuments();
                    }
                }
                focusInitialControl();
            } catch (error) {
                if (closed || version !== refreshVersion) return;
                body.innerHTML = `
                    <div class="rounded-lg border border-red-200 bg-red-50 p-4 text-center dark:border-red-800 dark:bg-red-950/40">
                        <p role="alert" class="text-sm text-red-800 dark:text-red-200">
                            ${escapeHtml(t(getMicrosoftStorageErrorKey(error)))}
                        </p>
                        <button type="button" data-microsoft-action="retry-view"
                            class="mt-2 rounded-lg px-3 py-2 text-sm font-semibold text-red-800 hover:bg-red-100 dark:text-red-200 dark:hover:bg-red-900/40">
                            ${escapeHtml(t('microsoft.retry'))}
                        </button>
                    </div>
                `;
                focusInitialControl();
            }
        }

        async function perform(actionName, operation, successKey, afterSuccess) {
            if (busyAction || closed) return;
            busyAction = actionName;
            notice = null;
            // Start the operation before the first await. In particular, MSAL
            // must open its sign-in popup while the original click still has
            // browser user activation.
            let operationOutcome;
            try {
                operationOutcome = Promise.resolve(operation()).then(
                    result => ({ ok: true, result }),
                    error => ({ ok: false, error }),
                );
            } catch (error) {
                operationOutcome = Promise.resolve({ ok: false, error });
            }
            await refresh();
            try {
                const outcome = await operationOutcome;
                if (!outcome.ok) throw outcome.error;
                const result = outcome.result;
                if (closed) return;
                await afterSuccess?.(result);
                if (successKey) showNotice(successKey);
            } catch (error) {
                if (!closed) showNotice(getMicrosoftStorageErrorKey(error), 'error');
            } finally {
                busyAction = '';
                if (!closed) await refresh();
            }
        }

        overlay.addEventListener('submit', (event) => {
            const configForm = event.target.closest?.('[data-microsoft-config-form]');
            if (configForm) {
                event.preventDefault();
                const clientId = configForm.querySelector('[data-microsoft-client-id]')?.value || '';
                const tenantId = configForm.querySelector('[data-microsoft-tenant-id]')?.value || '';
                const sharePointHost = configForm.querySelector('[data-microsoft-sharepoint-host]')?.value || '';
                void perform(
                    'configuration',
                    () => setMicrosoftConfigOverrides({ clientId, tenantId, sharePointHost }),
                    'microsoft.notice.configurationSaved',
                    async (config) => onConfigurationChanged(config),
                );
                return;
            }

            const folderForm = event.target.closest?.('[data-microsoft-folder-form]');
            if (folderForm) {
                event.preventDefault();
                const input = folderForm.querySelector('[data-microsoft-folder-link]');
                const sharingUrl = input?.value || '';
                if (input) input.value = '';
                if (!sharingUrl) {
                    showNotice('microsoft.error.folderLink', 'error');
                    void refresh();
                    return;
                }
                if (!isMicrosoftSharePointUrlAllowed(
                    sharingUrl,
                    currentConfig?.sharePointHost,
                )) {
                    showNotice('microsoft.error.folderHost', 'error');
                    void refresh();
                    return;
                }
                void perform(
                    'folder',
                    () => storage.selectTarget(sharingUrl),
                    'microsoft.notice.folderSelected',
                    async () => resetRemoteState(),
                );
            }
        });

        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) {
                close();
                return;
            }
            if (event.target.closest?.('[data-microsoft-close]')) {
                close();
                return;
            }

            const actionElement = event.target.closest?.('[data-microsoft-action]');
            const action = actionElement?.dataset.microsoftAction;
            if (!action) return;

            if (action === 'connect') {
                void perform('connect', () => storage.connect(), 'microsoft.notice.connected');
            } else if (action === 'reconnect' && documentId) {
                void perform(
                    'reconnect',
                    async () => {
                        await storage.connect();
                        return storage.syncDocument(documentId);
                    },
                    'microsoft.notice.synced',
                    async (result) => {
                        const doc = changedDocument(result, currentSyncState);
                        if (doc) await onDocumentChanged(doc);
                        const syncError = unsuccessfulSyncResult(result);
                        if (syncError) throw syncError;
                    },
                );
            } else if (action === 'disconnect') {
                void perform(
                    'disconnect',
                    () => storage.disconnect(),
                    'microsoft.notice.disconnected',
                    async () => resetRemoteState(),
                );
            } else if (action === 'clear-target') {
                void perform(
                    'clear-target',
                    () => storage.clearTarget(),
                    'microsoft.notice.folderCleared',
                    async () => resetRemoteState(),
                );
            } else if (action === 'clear-configuration') {
                void perform(
                    'clear-configuration',
                    async () => {
                        try {
                            await storage.disconnect();
                        } catch {
                            // Clearing the local test setup remains available
                            // even if Microsoft sign-out itself is unavailable.
                        }
                        return clearMicrosoftConfigOverrides();
                    },
                    'microsoft.notice.configurationCleared',
                    async (config) => onConfigurationChanged(config),
                );
            } else if (action === 'retry-view') {
                notice = null;
                void refresh();
            } else if (action === 'retry-list') {
                resetRemoteState();
                void refresh();
            } else if (action === 'sync' && documentId) {
                void perform(
                    'sync',
                    () => storage.syncDocument(documentId),
                    'microsoft.notice.synced',
                    async (result) => {
                        const doc = changedDocument(result, currentSyncState);
                        if (doc) await onDocumentChanged(doc);
                        const syncError = unsuccessfulSyncResult(result);
                        if (syncError) throw syncError;
                    },
                );
            } else if (action === 'keep-both' && documentId) {
                void perform(
                    'keep-both',
                    () => storage.syncDocument(documentId, { conflictStrategy: 'keep-both' }),
                    'microsoft.notice.keptBoth',
                    async (result) => {
                        const doc = changedDocument(result, currentSyncState);
                        if (doc) await onDocumentChanged(doc);
                        const syncError = unsuccessfulSyncResult(result);
                        if (syncError) throw syncError;
                    },
                );
            } else if (action === 'unlink' && documentId) {
                void perform(
                    'unlink',
                    () => storage.unlinkDocument(documentId),
                    'microsoft.notice.unlinked',
                    async (result) => {
                        if (result?.linked !== false || result?.document?.microsoft365) {
                            throw { code: 'unlink-failed' };
                        }
                        const doc = changedDocument(result, currentSyncState);
                        if (doc) await onDocumentChanged(doc);
                    },
                );
            } else if (action === 'import') {
                const index = Number(actionElement.dataset.remoteIndex);
                const item = Number.isInteger(index) ? remoteState.items[index] : null;
                if (!item) return;
                remoteState.importingIndex = index;
                void perform(
                    `import-${index}`,
                    async () => {
                        try {
                            return await storage.importRemoteDocument(item);
                        } finally {
                            remoteState.importingIndex = -1;
                        }
                    },
                    null,
                    async (result) => {
                        const doc = changedDocument(result, null) || result;
                        close();
                        await onImported(doc);
                    },
                );
            }
        });

        overlay.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                close();
                return;
            }
            if (event.key !== 'Tab') return;

            const focusable = Array.from(overlay.querySelectorAll(FOCUSABLE_SELECTOR));
            if (focusable.length === 0) {
                event.preventDefault();
                return;
            }
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (!overlay.contains(document.activeElement)) {
                event.preventDefault();
                (event.shiftKey ? last : first).focus();
            } else if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        });

        getModalParent().appendChild(overlay);
        void refresh();
    });
}
