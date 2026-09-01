/**
 * Minimal in-memory IndexedDB for Node tests.
 *
 * Implements exactly the surface the three store modules
 * (document-store.js, trash-store.js, folder-store.js) use:
 * open → onupgradeneeded (createObjectStore, createIndex, objectStore,
 * openCursor with update/continue, add with per-request onerror) →
 * onsuccess, plus data transactions (get/getAll/put/add/delete/count)
 * with oncomplete.
 *
 * Not a general IndexedDB. Ordering is simplified: operations apply
 * synchronously, callbacks fire on the microtask queue.
 */

function later(fn) { queueMicrotask(fn); }

class FakeRequest {
    constructor() {
        this.onsuccess = null;
        this.onerror = null;
        this.result = undefined;
        this.error = null;
    }
    _succeed(result) {
        this.result = result;
        later(() => { if (this.onsuccess) this.onsuccess({ target: this }); });
    }
    _fail(error) {
        this.error = error;
        later(() => {
            if (this.onerror) this.onerror({
                target: this,
                preventDefault() {},
                stopPropagation() {},
            });
        });
    }
}

class FakeIndex {
    constructor(name, keyPath, options) {
        this.name = name;
        this.keyPath = keyPath;
        this.options = { ...options };
    }
}

// One cursor shape for both store and index walks. `advance` re-fires the
// owning request, which is how IndexedDB delivers the next row.
function makeCursor(store, key, advance) {
    return {
        get value() { return structuredClone(store.records.get(key)); },
        get primaryKey() { return key; },
        update(newValue) {
            store.records.set(key, structuredClone(newValue));
            return new FakeRequest();
        },
        delete() {
            store.records.delete(key);
            return new FakeRequest();
        },
        continue() { later(advance); },
    };
}

class FakeObjectStore {
    constructor(name, options = {}) {
        this.name = name;
        this.keyPath = options.keyPath || null;
        this.records = new Map();
        this.indexes = new Map();
    }

    get indexNames() {
        const names = [...this.indexes.keys()];
        return { contains: (n) => names.includes(n) };
    }

    createIndex(name, keyPath, options = {}) {
        const idx = new FakeIndex(name, keyPath, options);
        this.indexes.set(name, idx);
        return idx;
    }

    // Index reads over a single-property keyPath: enough for the version
    // snapshot purge, which walks the 'docId' index and deletes as it goes.
    index(name) {
        const idx = this.indexes.get(name);
        if (!idx) throw new Error(`NotFoundError: no index ${name} on ${this.name}`);
        const store = this;
        const matching = (query) => [...store.records.entries()]
            .filter(([, value]) => query === undefined || value[idx.keyPath] === query)
            .map(([key]) => key);

        return {
            name,
            keyPath: idx.keyPath,
            getAll(query) {
                const req = new FakeRequest();
                req._succeed(matching(query).map(k => structuredClone(store.records.get(k))));
                return req;
            },
            openCursor(query) {
                const req = new FakeRequest();
                // Snapshot the key list up front so deleting during the walk
                // cannot disturb the iteration, as a real index cursor does.
                const keys = matching(query);
                let i = -1;
                function fire() {
                    i += 1;
                    if (i >= keys.length) { req._succeed(null); return; }
                    req._succeed(makeCursor(store, keys[i], fire));
                }
                later(fire);
                return req;
            },
        };
    }

    _key(value) { return value[this.keyPath]; }

    add(value) {
        const req = new FakeRequest();
        const key = this._key(value);
        if (this.records.has(key)) {
            req._fail(new Error(`ConstraintError: key ${key} already exists in ${this.name}`));
        } else {
            this.records.set(key, structuredClone(value));
            req._succeed(key);
        }
        return req;
    }

    put(value) {
        const req = new FakeRequest();
        this.records.set(this._key(value), structuredClone(value));
        req._succeed(this._key(value));
        return req;
    }

    get(key) {
        const req = new FakeRequest();
        const value = this.records.get(key);
        req._succeed(value ? structuredClone(value) : undefined);
        return req;
    }

    getAll() {
        const req = new FakeRequest();
        req._succeed([...this.records.values()].map(v => structuredClone(v)));
        return req;
    }

    delete(key) {
        const req = new FakeRequest();
        this.records.delete(key);
        req._succeed(undefined);
        return req;
    }

    count() {
        const req = new FakeRequest();
        req._succeed(this.records.size);
        return req;
    }

    clear() {
        const req = new FakeRequest();
        this.records.clear();
        req._succeed(undefined);
        return req;
    }

    openCursor() {
        const req = new FakeRequest();
        const store = this;
        const keys = [...this.records.keys()];
        let i = -1;

        function fire() {
            i += 1;
            if (i >= keys.length) { req._succeed(null); return; }
            req._succeed(makeCursor(store, keys[i], fire));
        }
        later(fire);
        return req;
    }
}

class FakeTransaction {
    constructor(db, storeNames) {
        this.db = db;
        this.storeNames = Array.isArray(storeNames) ? storeNames : [storeNames];
        this.oncomplete = null;
        this.onerror = null;
        // Data transactions complete on the next macrotask so every
        // microtask-scheduled request callback has already fired.
        setTimeout(() => { if (this.oncomplete) this.oncomplete({ target: this }); }, 0);
    }
    objectStore(name) { return this.db._stores.get(name); }
}

class FakeDB {
    constructor(name, version) {
        this.name = name;
        this.version = version;
        this._stores = new Map();
        this.onversionchange = null;
    }

    get objectStoreNames() {
        const names = [...this._stores.keys()];
        return { contains: (n) => names.includes(n) };
    }

    createObjectStore(name, options) {
        const store = new FakeObjectStore(name, options);
        this._stores.set(name, store);
        return store;
    }

    transaction(storeNames) {
        return new FakeTransaction(this, storeNames);
    }

    close() { /* no-op */ }
}

/**
 * Install a fresh fake environment on globalThis and return an inspector.
 * Each call gets its own database registry — no state leaks between tests.
 */
export function installFakeIndexedDB() {
    const databases = new Map();      // name → FakeDB
    const openedVersions = [];        // every version number passed to open()

    globalThis.indexedDB = {
        open(name, version) {
            openedVersions.push(version);
            const req = new FakeRequest();
            later(() => {
                let db = databases.get(name);
                const oldVersion = db ? db.version : 0;
                if (!db) {
                    db = new FakeDB(name, version);
                    databases.set(name, db);
                }
                if (version > oldVersion) {
                    db.version = version;
                    const upgradeTx = { objectStore: (n) => db._stores.get(n) };
                    if (req.onupgradeneeded) {
                        req.onupgradeneeded({
                            oldVersion,
                            target: { result: db, transaction: upgradeTx },
                        });
                    }
                }
                req._succeed(db);
            });
            return req;
        },
    };

    // Always override — Node's own experimental localStorage global throws
    // (or warns) without --localstorage-file, and tests must be deterministic.
    const map = new Map();
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
            getItem: (k) => (map.has(k) ? map.get(k) : null),
            setItem: (k, v) => map.set(k, String(v)),
            removeItem: (k) => map.delete(k),
        },
    });

    return {
        /** Structured snapshot of one database's schema + data for comparisons. */
        dump(name = 'skriv-documents') {
            const db = databases.get(name);
            if (!db) return null;
            const stores = {};
            for (const [storeName, store] of [...db._stores].sort()) {
                stores[storeName] = {
                    keyPath: store.keyPath,
                    indexes: Object.fromEntries(
                        [...store.indexes].sort().map(([n, idx]) => [n, { keyPath: idx.keyPath, options: idx.options }])
                    ),
                    rows: [...store.records.values()].sort((a, b) => String(a.id).localeCompare(String(b.id))),
                };
            }
            return { version: db.version, stores };
        },
        /** Direct access for seeding/mutating records in tests. */
        store(storeName, name = 'skriv-documents') {
            return databases.get(name)?._stores.get(storeName) || null;
        },
        openedVersions,
    };
}

/** Wait until all queued micro/macro-tasks (fake tx completions) have run. */
export function settle() {
    return new Promise(resolve => setTimeout(resolve, 5));
}
