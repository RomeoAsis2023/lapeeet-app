/* =============================================================
   Lapeeet — DB Layer (sql.js / SQLite in WASM) — Phase 2 REAL
   - initSqlJs with embedded WASM (window.LAPEEET_WASM_B64) or
     locateFile fallback (vendor-live/ + dist/ paths, file:// safe)
   - Tenant schema with CHECK constraints (capacity whitelist, 60km)
   - Persist exported DB blob to IndexedDB (kv store), debounced
   - Export / Import / Wipe + JSON dump
   - CRUD: profile, ebikes, rides, ride_events, geocode cache
   - Photo pipeline: canvas resize 1280px long-edge, JPEG q0.85
   ============================================================= */

(function (global) {
    'use strict';

    const DB_LAYER_VERSION = '2.0.0-phase2';
    const IDB_NAME = 'lapeeet-idb-v1';
    const IDB_STORE = 'kv';

    /* ---------- tiny IndexedDB kv wrapper (no deps) ---------- */
    function idbOpen() {
        return new Promise((resolve, reject) => {
            try {
                const req = indexedDB.open(IDB_NAME, 1);
                req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            } catch (e) { reject(e); }
        });
    }
    function idbGet(key) {
        return idbOpen().then(db => new Promise((resolve, reject) => {
            try {
                const tx = db.transaction(IDB_STORE, 'readonly');
                const rq = tx.objectStore(IDB_STORE).get(key);
                rq.onsuccess = () => { resolve(rq.result); db.close(); };
                rq.onerror = () => { reject(rq.error); db.close(); };
            } catch (e) { try { db.close(); } catch (_) {} reject(e); }
        }));
    }
    function idbSet(key, val) {
        return idbOpen().then(db => new Promise((resolve, reject) => {
            try {
                const tx = db.transaction(IDB_STORE, 'readwrite');
                tx.objectStore(IDB_STORE).put(val, key);
                tx.oncomplete = () => { resolve(true); db.close(); };
                tx.onerror = () => { reject(tx.error); db.close(); };
            } catch (e) { try { db.close(); } catch (_) {} reject(e); }
        }));
    }
    function idbDel(key) {
        return idbOpen().then(db => new Promise((resolve, reject) => {
            try {
                const tx = db.transaction(IDB_STORE, 'readwrite');
                tx.objectStore(IDB_STORE).delete(key);
                tx.oncomplete = () => { resolve(true); db.close(); };
                tx.onerror = () => { reject(tx.error); db.close(); };
            } catch (e) { try { db.close(); } catch (_) {} reject(e); }
        }));
    }

    function b64ToU8(b64) {
        const bin = atob(b64);
        const u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        return u8;
    }

    const SCHEMA = `
    CREATE TABLE IF NOT EXISTS me(
        id INTEGER PRIMARY KEY CHECK(id = 1),
        connectId TEXT UNIQUE,
        pubkey TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS my_profile(
        id INTEGER PRIMARY KEY CHECK(id = 1),
        name TEXT DEFAULT '',
        phone TEXT DEFAULT '',
        avatar_url TEXT DEFAULT '',
        passkey_json TEXT DEFAULT '',
        first_name TEXT DEFAULT '',
        last_name TEXT DEFAULT '',
        email TEXT DEFAULT '',
        pin_json TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS my_ebikes(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        brand TEXT NOT NULL,
        model TEXT NOT NULL,
        color TEXT DEFAULT '',
        capacity INTEGER NOT NULL CHECK(capacity IN (1,2,3,6,8,10,12,15)),
        photo1 TEXT DEFAULT '',
        photo2 TEXT DEFAULT '',
        photo3 TEXT DEFAULT '',
        is_primary INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS my_rides_as_rider(
        id TEXT PRIMARY KEY,
        pickup_lat REAL, pickup_lng REAL, drop_lat REAL, drop_lng REAL,
        distance_km REAL CHECK(distance_km <= 60),
        fare_php REAL DEFAULT 0,
        status TEXT DEFAULT 'requested',
        peer_id TEXT DEFAULT '',
        created_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS my_rides_as_driver(
        id TEXT PRIMARY KEY,
        pickup_lat REAL, pickup_lng REAL, drop_lat REAL, drop_lng REAL,
        distance_km REAL CHECK(distance_km <= 60),
        fare_php REAL DEFAULT 0,
        status TEXT DEFAULT 'offered',
        peer_id TEXT DEFAULT '',
        created_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS ride_events(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ride_id TEXT NOT NULL,
        type TEXT NOT NULL,
        from_id TEXT NOT NULL,
        ts INTEGER NOT NULL,
        body_json TEXT NOT NULL,
        sig TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_ride_events_ride ON ride_events(ride_id);
    CREATE TABLE IF NOT EXISTS geocode_cache(
        q TEXT PRIMARY KEY,
        lat REAL, lng REAL,
        address TEXT,
        ts INTEGER
    );
    `;

    const LapeeetDB = {
        version: DB_LAYER_VERSION,
        db: null,
        SQL: null,
        storageKey: 'lapeeet::tenant_db_v1',
        role: null,         // 'RIDER' | 'DRIVER'
        initialized: false,
        _persistTimer: null,

        /* ---------- LIFECYCLE ---------- */

        async init(role) {
            if (this.initialized && this.db) {
                if (role) this.role = role;
                return true;
            }
            if (typeof global.initSqlJs !== 'function') {
                throw new Error('sql.js runtime missing (initSqlJs not found)');
            }
            const cfg = {};
            if (global.LAPEEET_WASM_B64) {
                // True single-file: WASM embedded as base64 by the builder.
                cfg.wasmBinary = b64ToU8(global.LAPEEET_WASM_B64);
            } else {
                // Dev/file layout: resolve adjacent wasm (file:// + http safe).
                cfg.locateFile = (f) => {
                    try {
                        const base = (document.currentScript && document.currentScript.src) || '';
                        if (base.includes('vendor-live/')) return base.replace(/[^/]+$/, f);
                    } catch (e) { /* ignore */ }
                    return 'assets/vendor-live/' + f;
                };
            }
            this.SQL = await global.initSqlJs(cfg);

            // Load persisted blob (IndexedDB first, localStorage legacy fallback).
            let saved = null;
            try { saved = await idbGet(this.storageKey); } catch (e) { saved = null; }
            if (!saved) {
                try {
                    const legacy = localStorage.getItem(this.storageKey);
                    if (legacy) saved = Uint8Array.from(JSON.parse(legacy));
                } catch (e) { saved = null; }
            }
            if (saved && saved.length) {
                this.db = new this.SQL.Database(saved instanceof Uint8Array ? saved : new Uint8Array(saved));
            } else {
                this.db = new this.SQL.Database();
            }
            this.db.exec(SCHEMA);
            // Migrations for pre-existing tenant DBs (each guarded; repeat-safe).
            try { this.db.exec('ALTER TABLE my_profile ADD COLUMN passkey_json TEXT DEFAULT ' + "''"); }
            catch (e) { /* column already exists — ignore */ }
            ['first_name', 'last_name', 'email', 'pin_json'].forEach(col => {
                try { this.db.exec(`ALTER TABLE my_profile ADD COLUMN ${col} TEXT DEFAULT ''`); }
                catch (e) { /* already exists — ignore */ }
            });
            // Ensure singleton rows exist.
            this.db.exec("INSERT OR IGNORE INTO me(id) VALUES (1)");
            this.db.exec("INSERT OR IGNORE INTO my_profile(id) VALUES (1)");
            this.role = role || this.role || 'RIDER';
            this.initialized = true;
            this._persistSoon();
            return true;
        },

        _persistSoon() {
            if (!this.initialized || !this.db) return;
            if (this._persistTimer) clearTimeout(this._persistTimer);
            this._persistTimer = setTimeout(() => this._persistNow(), 400);
        },

        async _persistNow() {
            if (!this.initialized || !this.db) return false;
            this._persistTimer = null;
            try {
                const data = this.db.export();
                await idbSet(this.storageKey, data);
                try { localStorage.removeItem(this.storageKey); } catch (e) {}
                return true;
            } catch (e) {
                console.warn('[DB] persist failed:', e && e.message);
                return false;
            }
        },

        /* ---------- row helpers ---------- */
        _one(sql, params) {
            const stmt = this.db.prepare(sql);
            try {
                if (params) stmt.bind(params);
                return stmt.step() ? stmt.getAsObject() : null;
            } finally { stmt.free(); }
        },
        _all(sql, params) {
            const stmt = this.db.prepare(sql);
            const out = [];
            try {
                if (params) stmt.bind(params);
                while (stmt.step()) out.push(stmt.getAsObject());
                return out;
            } finally { stmt.free(); }
        },
        _run(sql, params) {
            this.db.run(sql, params || []);
            this._persistSoon();
        },

        _needInit() {
            if (!this.initialized || !this.db) throw new Error('DB not initialised — call LapeeetDB.init() first');
        },

        /* ---------- PROFILE / IDENTITY ---------- */
        getProfile() {
            this._needInit();
            return this._one('SELECT * FROM my_profile WHERE id = 1') || {};
        },
        saveProfile(patch) {
            this._needInit();
            const cur = this.getProfile();
            const next = {
                name: patch.name !== undefined ? patch.name : (cur.name || ''),
                phone: patch.phone !== undefined ? patch.phone : (cur.phone || ''),
                avatar_url: patch.avatar_url !== undefined ? patch.avatar_url : (cur.avatar_url || ''),
                passkey_json: patch.passkey_json !== undefined ? patch.passkey_json : (cur.passkey_json || ''),
                first_name: patch.first_name !== undefined ? patch.first_name : (cur.first_name || ''),
                last_name: patch.last_name !== undefined ? patch.last_name : (cur.last_name || ''),
                email: patch.email !== undefined ? patch.email : (cur.email || '')
            };
            // Keep legacy display name in sync when first/last are edited.
            if (patch.first_name !== undefined || patch.last_name !== undefined) {
                const full = (next.first_name + ' ' + next.last_name).trim();
                if (full) next.name = full;
            }
            this._run('UPDATE my_profile SET name = ?, phone = ?, avatar_url = ?, passkey_json = ?, first_name = ?, last_name = ?, email = ? WHERE id = 1',
                [next.name, next.phone, next.avatar_url, next.passkey_json, next.first_name, next.last_name, next.email]);
            return next;
        },
        /** Best display name: first+last, else legacy name, else ''. */
        displayName() {
            this._needInit();
            const p = this.getProfile() || {};
            const full = ((p.first_name || '') + ' ' + (p.last_name || '')).trim();
            return full || (p.name || '').trim() || '';
        },
        /** Enrolled passkey record object, 'SKIP', or null. */
        getPasskey() {
            this._needInit();
            const raw = (this.getProfile().passkey_json || '').trim();
            if (!raw) return null;
            if (raw === 'SKIP') return 'SKIP';
            try { return JSON.parse(raw); } catch (e) { return null; }
        },
        setPasskey(recordOrSkip) {
            this._needInit();
            const val = recordOrSkip === 'SKIP' ? 'SKIP' : JSON.stringify(recordOrSkip || {});
            this._run('UPDATE my_profile SET passkey_json = ? WHERE id = 1', [val]);
        },
        /** Device PIN record {salt, hash, iter} object, or null. Never stores the PIN. */
        getPin() {
            this._needInit();
            const raw = (this.getProfile().pin_json || '').trim();
            if (!raw) return null;
            try {
                const rec = JSON.parse(raw);
                return (rec && rec.salt && rec.hash) ? rec : null;
            } catch (e) { return null; }
        },
        setPin(recordOrNull) {
            this._needInit();
            this._run('UPDATE my_profile SET pin_json = ? WHERE id = 1',
                [recordOrNull ? JSON.stringify(recordOrNull) : '']);
        },
        setIdentity(connectId, pubkey) {
            this._needInit();
            this._run('UPDATE me SET connectId = ?, pubkey = ? WHERE id = 1', [connectId, pubkey]);
        },
        getIdentity() {
            this._needInit();
            return this._one('SELECT * FROM me WHERE id = 1') || {};
        },

        /* ---------- E-BIKE CRUD (driver tenants) ---------- */
        createEbike(payload) {
            this._needInit();
            const cap = Number(payload.capacity);
            if (this.getCapacityWhitelist().indexOf(cap) === -1) {
                throw new Error('Capacity ' + payload.capacity + ' not whitelisted ' +
                    JSON.stringify(this.getCapacityWhitelist()));
            }
            if (!payload.brand || !payload.model) throw new Error('brand + model required');
            const photos = payload.photos || [];
            if (photos.length > 3) throw new Error('Max 3 photos per e-bike');
            this._run(
                'INSERT INTO my_ebikes (brand, model, color, capacity, photo1, photo2, photo3, is_primary)' +
                ' VALUES (?,?,?,?,?,?,?,?)',
                [payload.brand, payload.model, payload.color || '', cap,
                 photos[0] || '', photos[1] || '', photos[2] || '',
                 payload.is_primary ? 1 : 0]
            );
            const row = this._one('SELECT * FROM my_ebikes WHERE id = last_insert_rowid()');
            if (row && row.is_primary) this.setPrimaryEbike(row.id);
            return row;
        },
        listEbikes() {
            this._needInit();
            return this._all('SELECT * FROM my_ebikes ORDER BY is_primary DESC, id ASC');
        },
        getPrimaryEbike() {
            this._needInit();
            return this._one('SELECT * FROM my_ebikes WHERE is_primary = 1 ORDER BY id ASC');
        },
        setPrimaryEbike(id) {
            this._needInit();
            this.db.run('UPDATE my_ebikes SET is_primary = 0');
            this._run('UPDATE my_ebikes SET is_primary = 1 WHERE id = ?', [id]);
        },
        deleteEbike(id) {
            this._needInit();
            this._run('DELETE FROM my_ebikes WHERE id = ?', [id]);
        },

        /* ---------- RIDES ---------- */
        upsertRide(asRole, ride) {
            this._needInit();
            const table = asRole === 'DRIVER' ? 'my_rides_as_driver' : 'my_rides_as_rider';
            if (ride.distance_km != null && Number(ride.distance_km) > 60) {
                throw new Error('Trip exceeds 60 km hard cap');
            }
            this._run(
                `INSERT OR REPLACE INTO ${table}` +
                ' (id, pickup_lat, pickup_lng, drop_lat, drop_lng, distance_km, fare_php, status, peer_id, created_at)' +
                ' VALUES (?,?,?,?,?,?,?,?,?,?)',
                [ride.id, ride.pickup_lat, ride.pickup_lng, ride.drop_lat, ride.drop_lng,
                 ride.distance_km, ride.fare_php || 0, ride.status || 'requested',
                 ride.peer_id || '', ride.created_at || Date.now()]
            );
        },
        listRides(asRole, limit) {
            this._needInit();
            const table = asRole === 'DRIVER' ? 'my_rides_as_driver' : 'my_rides_as_rider';
            const rows = this._all(`SELECT * FROM ${table} ORDER BY created_at DESC`);
            return limit ? rows.slice(0, limit) : rows;
        },

        /* ---------- RIDE EVENTS (Phase 3 double-entry) ---------- */
        appendEvent(eventObj, signatureBase64) {
            this._needInit();
            this._run(
                'INSERT INTO ride_events (ride_id, type, from_id, ts, body_json, sig) VALUES (?,?,?,?,?,?)',
                [eventObj.ride_id, eventObj.type, eventObj.from_id, eventObj.ts || Date.now(),
                 typeof eventObj.body === 'string' ? eventObj.body : JSON.stringify(eventObj.body || {}),
                 signatureBase64 || '']
            );
            this._persistSoon();
        },
        listEvents(rideId) {
            this._needInit();
            return this._all('SELECT * FROM ride_events WHERE ride_id = ? ORDER BY id ASC', [rideId]);
        },

        /* ---------- GEOCODE CACHE (shared with map-layer) ---------- */
        geoGet(q) {
            this._needInit();
            const row = this._one('SELECT * FROM geocode_cache WHERE q = ?', [q]);
            return row || null;
        },
        geoSet(q, lat, lng, address) {
            this._needInit();
            this._run('INSERT OR REPLACE INTO geocode_cache (q, lat, lng, address, ts) VALUES (?,?,?,?,?)',
                [q, lat, lng, address || '', Date.now()]);
        },

        /* ---------- PORTABILITY ---------- */
        exportBinary() {
            this._needInit();
            return this.db.export();
        },
        exportJSON() {
            this._needInit();
            const tables = ['me', 'my_profile', 'my_ebikes', 'my_rides_as_rider',
                'my_rides_as_driver', 'ride_events', 'geocode_cache'];
            const out = { version: this.version, exported_at: Date.now(), tables: {} };
            tables.forEach(t => { out.tables[t] = this._all(`SELECT * FROM ${t}`); });
            return out;
        },
        async importBinary(uint8Data) {
            if (!this.SQL) throw new Error('DB runtime not loaded — init() first');
            const candidate = new this.SQL.Database(uint8Data);
            // Validate: must contain our tenant tables.
            const tables = candidate.exec(
                "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('me','my_profile','my_ebikes')");
            if (!tables.length || !tables[0].values.length || tables[0].values.length < 3) {
                candidate.close();
                throw new Error('Not a Lapeeet tenant database (missing tables)');
            }
            if (this.db) { try { this.db.close(); } catch (e) {} }
            this.db = candidate;
            this.db.exec(SCHEMA); // forward-compatible: add any missing tables
            this.initialized = true;
            await this._persistNow();
            return true;
        },
        async wipe() {
            if (this._persistTimer) clearTimeout(this._persistTimer);
            if (this.db) { try { this.db.close(); } catch (e) {} this.db = null; }
            this.initialized = false;
            this.role = null;
            try { await idbDel(this.storageKey); } catch (e) {}
            try { localStorage.removeItem(this.storageKey); } catch (e) {}
            try { localStorage.removeItem('lapeeet::geocode_cache_v1'); } catch (e) {}
        },

        /* ---------- PHOTO PIPELINE (1280px / JPEG q0.85 / max 3) ---------- */
        processPhoto(file) {
            const MAX_EDGE = 1280;
            const QUALITY = 0.85;
            return new Promise((resolve, reject) => {
                if (!file || !file.type || file.type.indexOf('image/') !== 0) {
                    reject(new Error('Not an image file'));
                    return;
                }
                const url = URL.createObjectURL(file);
                const img = new Image();
                img.onload = () => {
                    try {
                        let w = img.naturalWidth || img.width;
                        let h = img.naturalHeight || img.height;
                        const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
                        w = Math.round(w * scale);
                        h = Math.round(h * scale);
                        const canvas = document.createElement('canvas');
                        canvas.width = w;
                        canvas.height = h;
                        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                        URL.revokeObjectURL(url);
                        resolve(canvas.toDataURL('image/jpeg', QUALITY));
                    } catch (e) { URL.revokeObjectURL(url); reject(e); }
                };
                img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
                img.src = url;
            });
        },

        /* ---------- AVATAR PIPELINE (256px square center-crop, JPEG q0.85) ---------- */
        processAvatar(file) {
            const SIZE = 256;
            const QUALITY = 0.85;
            return new Promise((resolve, reject) => {
                if (!file || !file.type || file.type.indexOf('image/') !== 0) {
                    reject(new Error('Not an image file'));
                    return;
                }
                const url = URL.createObjectURL(file);
                const img = new Image();
                img.onload = () => {
                    try {
                        const w = img.naturalWidth || img.width;
                        const h = img.naturalHeight || img.height;
                        const side = Math.min(w, h);
                        const sx = Math.round((w - side) / 2);
                        const sy = Math.round((h - side) / 2);
                        const canvas = document.createElement('canvas');
                        canvas.width = SIZE;
                        canvas.height = SIZE;
                        canvas.getContext('2d').drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE);
                        URL.revokeObjectURL(url);
                        resolve(canvas.toDataURL('image/jpeg', QUALITY));
                    } catch (e) { URL.revokeObjectURL(url); reject(e); }
                };
                img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
                img.src = url;
            });
        },

        /* ---------- UTIL ---------- */
        getCapacityWhitelist() {
            return [1, 2, 3, 6, 8, 10, 12, 15];
        },
        getMaxTripKm() {
            return 60;
        }
    };

    global.LapeeetDB = LapeeetDB;
})(window);
