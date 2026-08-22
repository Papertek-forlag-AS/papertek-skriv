import test from 'node:test';
import assert from 'node:assert/strict';
import { initServiceWorker } from '../public/js/app/sw-manager.js';

function createEventTarget() {
    const listeners = new Map();
    return {
        addEventListener(type, listener) {
            if (!listeners.has(type)) listeners.set(type, new Set());
            listeners.get(type).add(listener);
        },
        dispatchEvent(event) {
            for (const listener of listeners.get(event.type) || []) listener(event);
            return true;
        },
        dispatch(type, event = {}) {
            for (const listener of listeners.get(type) || []) listener(event);
        },
    };
}

function installEnvironment(waitingWorker) {
    const keys = ['window', 'document', 'navigator', 'CustomEvent'];
    const originals = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    const documentTarget = createEventTarget();
    const serviceWorkerTarget = createEventTarget();
    const elements = new Map();
    let reloads = 0;

    function createElement() {
        const listeners = new Map();
        const element = {
            id: '',
            style: {},
            _innerHTML: '',
            addEventListener(type, listener) { listeners.set(type, listener); },
            async click() { return listeners.get('click')?.({ target: element }); },
            remove() { if (element.id) elements.delete(element.id); },
        };
        Object.defineProperty(element, 'innerHTML', {
            get() { return element._innerHTML; },
            set(value) {
                element._innerHTML = value;
                if (value.includes('id="sw-update-btn"')) {
                    const button = createElement();
                    button.id = 'sw-update-btn';
                    elements.set(button.id, button);
                }
            },
        });
        return element;
    }

    Object.assign(documentTarget, {
        body: {
            prepend(element) { if (element.id) elements.set(element.id, element); },
        },
        createElement,
        getElementById(id) { return elements.get(id) || null; },
    });

    const registration = {
        waiting: waitingWorker,
        installing: null,
        addEventListener() {},
    };
    const serviceWorker = {
        controller: {},
        async register() { return registration; },
        addEventListener: serviceWorkerTarget.addEventListener,
    };

    Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: {
            location: {
                hostname: 'skriv.example',
                reload() { reloads += 1; },
            },
        },
    });
    Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: documentTarget,
    });
    Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: { serviceWorker },
    });
    Object.defineProperty(globalThis, 'CustomEvent', {
        configurable: true,
        value: class CustomEvent {
            constructor(type, init = {}) {
                this.type = type;
                this.detail = init.detail;
            }
        },
    });

    return {
        documentTarget,
        serviceWorkerTarget,
        get reloads() { return reloads; },
        getElementById: id => elements.get(id),
        restore() {
            for (const [key, descriptor] of originals) {
                if (descriptor) Object.defineProperty(globalThis, key, descriptor);
                else delete globalThis[key];
            }
        },
    };
}

test('service-worker manager ignores initial claim and awaits save hooks for accepted update', async () => {
    const originalConsoleWarn = console.warn;
    let postMessageCalls = 0;
    const waitingWorker = {
        postMessage(message) {
            assert.deepEqual(message, { type: 'SKIP_WAITING' });
            postMessageCalls += 1;
        },
    };
    const environment = installEnvironment(waitingWorker);
    let releaseSave;
    const saving = new Promise(resolve => { releaseSave = resolve; });

    try {
        console.warn = () => {};
        environment.documentTarget.addEventListener('skriv:before-app-reload', (event) => {
            event.detail.waitUntil(saving);
        });

        initServiceWorker();
        await Promise.resolve();

        environment.serviceWorkerTarget.dispatch('controllerchange');
        assert.equal(environment.reloads, 0, 'first installation must not reload an open page');

        const updateButton = environment.getElementById('sw-update-btn');
        assert.ok(updateButton, 'waiting update displays an explicit prompt');
        const accepting = updateButton.click();
        await Promise.resolve();
        assert.equal(postMessageCalls, 0, 'worker remains waiting while save hook is pending');

        releaseSave();
        await accepting;
        assert.equal(postMessageCalls, 1);

        environment.serviceWorkerTarget.dispatch('controllerchange');
        assert.equal(environment.reloads, 1, 'accepted activation reloads exactly once');
        environment.serviceWorkerTarget.dispatch('controllerchange');
        assert.equal(environment.reloads, 1);
    } finally {
        console.warn = originalConsoleWarn;
        environment.restore();
    }
});
