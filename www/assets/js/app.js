/* =============================================================
   Lapeeet — Main App Entry Point
   Orchestrates all layers: DB → P2P → MAP → CALL → UI
   ============================================================= */

(function (global) {
    'use strict';

    const APP_VERSION = '0.0.1-phase0-uikit';

    const LapeeetApp = {
        version: APP_VERSION,
        startedAt: null,
        started: false,
        role: 'RIDER',

        async start() {
            this.startedAt = Date.now();

            // 0. LOCK PERMANENT DARK MODE (body class + localStorage + guard handler)
            this._lockPermanentDarkMode();

            // 0b. Resolve tenant role: ?mode= URL param > saved role > RIDER.
            // (Phase 6 deep links: ?mode=driver | ?mode=passenger, case-insensitive.)
            this.role = this.resolveInitialRole();
            try { localStorage.setItem('lapeeet::role', this.role); } catch (e) { /* ignore */ }
            this._syncModeUrl();

            // 1. UI COMPONENTS FIRST (router needs to be ready for screen renders)
            LapeeetUI.init({
                initialRole: this.role,
                onRoleChange: (newRole) => {
                    this.role = newRole;
                    try { localStorage.setItem('lapeeet::role', newRole); } catch (e) { /* ignore */ }
                    try { if (window.LapeeetP2P) LapeeetP2P.setRole(newRole); } catch (e) {}
                    this._syncModeUrl();
                    console.info('[APP] Role changed to', newRole);
                },
                onScreenChange: (s) => {
                    console.debug('[APP] Screen →', s);
                    try { document.body.classList.toggle('auth-mode', s === 'onboarding' || s === 'lock' || s === 'recover'); } catch (e) {}
                    if (s === 'map') {
                        if (!LapeeetMap.initialized) this._initMapDeferred();
                        else {
                            setTimeout(() => {
                                try { LapeeetMap.map && LapeeetMap.map.invalidateSize(); } catch (e) { /* noop */ }
                                this._bindMapScreenButtons();
                            }, 40);
                        }
                    }
                    if (s === 'home') this._populateHomeStatus();
                    if (s === 'settings') { this._populateSettingsGit(); this._bindSettingsScreen(); }
                    if (s === 'data') this._bindDataScreen();
                    if (s === 'profile') this._bindProfileScreen();
                    if (s === 'ebike') this._bindEbikeScreen();
                    if (s === 'messages') this._bindMessagesScreen();
                    if (s === 'trips') this._bindTripsScreen();
                    if (s === 'lock') this._bindLockScreen();
                    if (s === 'recover') this._bindRecoverScreen();
                    if (s === 'onboarding') this._bindOnboardingScreen();
                }
            });

            // 2. DB LAYER (Phase 2 real sql.js tenant DB)
            try { await LapeeetDB.init(this.role); }
            catch (e) {
                console.warn('[APP] DB init failed:', e && e.message);
                LapeeetUI.showToast('Local database unavailable — Data features disabled', 'danger');
            }

            // 2b. Backup reminder: nudge export if tenant has data but no recent backup.
            try {
                if (LapeeetDB.initialized) {
                    const hasData = LapeeetDB.listEbikes().length > 0 ||
                        LapeeetDB.listRides('RIDER', 1).length > 0 ||
                        LapeeetDB.listRides('DRIVER', 1).length > 0;
                    const last = Number(localStorage.getItem('lapeeet::last_backup') || 0);
                    if (hasData && Date.now() - last > 30 * 86400000) {
                        setTimeout(() => LapeeetUI.showToast('Back up your data: Data tab → Export', 'warning', 6000), 4000);
                    }
                }
            } catch (e) { /* ignore */ }
            // 2c. GIT LAYER (dev-only: no-op in live single-file, window.LapeeetGit undefined)
            //     Runs atop LightningFS → IndexedDB. No backend required.
            //     If the ESM 'lapeeet:git-ready' event hasn't fired yet, our
            //     git-layer.js will init() on that event. For app start we
            //     try synchronously too; it's idempotent.
            try {
                if (window.LapeeetGit && !window.LapeeetGit.initialized) {
                    await window.LapeeetGit.init({
                        author: { name: 'Lapeeet User', email: 'user@lapeeet.local' }
                    });
                }
            } catch (e) { console.warn('[APP] Git init failed:', e && e.message); }

            // 3. CALL LAYER stub
            LapeeetCall.init({
                onIncoming:    (info) => console.info('[APP] Incoming call:', info),
                onStateChange: (s)    => console.debug('[APP] Call state →', s),
                onEnded:       (e)    => console.info('[APP] Call ended:', e)
            });

            // 4. P2P LAYER (Phase 3 real mesh)
            try {
                await LapeeetP2P.init({
                    lat: 14.5995, lng: 120.9842,
                    role: this.role,
                    onEventCallback: (evt) => this._onP2PEvent(evt)
                });
            } catch (e) {
                console.warn('[APP] P2P init failed:', e && e.message);
                LapeeetUI.showToast('P2P mesh unavailable — maps + DB still work', 'warning');
            }
            try { if (window.LapeeetCall) LapeeetCall.attachMesh(); } catch (e) {}

            // 5. Update sidebar identity (profile name when DB ready)
            let sidebarName = 'Guest User';
            try {
                if (LapeeetDB.initialized) {
                    sidebarName = LapeeetDB.displayName() || sidebarName;
                }
            } catch (e) { /* keep default */ }
            LapeeetUI.updateSidebar({
                name: sidebarName,
                peerId: LapeeetP2P.connectId || 'pending-mesh-id',
                role: this.role,
                p2pStatus: LapeeetP2P.status || 'offline'
            });

            // 5b. REGISTRATION GATE (Phase 9): install navigate guard, then
            // redirect first-run users to onboarding and locked users to lock.
            this._installNavGuard();
            $('#btnLogout').off('click').on('click', () => this._doLogout());
            if (!this._isRegistered()) {
                LapeeetUI.navigate('onboarding');
            } else if (this._needsUnlock()) {
                LapeeetUI.navigate('lock');
            }

            // 6. Update home screen status indicators
            setTimeout(() => this._populateHomeStatus(), 200);

            // 7. Reveal app shell: hide #loader, show header/capsule/bottomMenu
            // NOTE: base.js already fades #loader after DOMContentLoaded. Here we just unhide the rest.
            setTimeout(() => this._revealShell(), 500);

            this.started = true;
            console.info(`[APP] Lapeeet v${APP_VERSION} ready. Role = ${this.role}.`);
            LapeeetUI.showToast('Lapeeet started — Phase 0 scaffold complete', 'success');
        },

        /* ---------- PHASE 9: REGISTRATION GATE + PASSKEY LOCK ---------- */

        _unlocked: false, // session flag: true after passkey assertion (or no passkey enrolled)

        /** Registered = profile has a name AND a valid PH mobile. */
        _isRegistered() {
            try {
                if (!(window.LapeeetDB && LapeeetDB.initialized)) return false;
                const p = LapeeetDB.getProfile() || {};
                const named = !!(((p.first_name || '').trim() || (p.name || '').trim()));
                return named &&
                    !!(window.LapeeetAuth && LapeeetAuth.isValidPHMobile(p.phone));
            } catch (e) { return false; }
        },

        /** Lock needed = passkey enrolled or device PIN set (and not unlocked). */
        _needsUnlock() {
            if (this._unlocked) return false;
            try {
                if (!(window.LapeeetDB && LapeeetDB.initialized)) return false;
                const pk = LapeeetDB.getPasskey();
                if (pk && pk !== 'SKIP') return true;
                return !!LapeeetDB.getPin();
            } catch (e) { return false; }
        },

        _gateTarget(screen) {
            const FREE = ['onboarding', 'lock', 'recover'];
            if (!this._isRegistered()) {
                return (FREE.indexOf(screen) !== -1) ? null : 'onboarding';
            }
            if (this._needsUnlock()) {
                return (screen === 'lock' || screen === 'recover') ? null : 'lock';
            }
            return (screen === 'lock') ? 'home' : null; // unlocked users never see lock
        },

        _installNavGuard() {
            if (this._navGuardInstalled || !window.LapeeetUI) return;
            this._navGuardInstalled = true;
            const orig = LapeeetUI.navigate.bind(LapeeetUI);
            LapeeetUI.navigate = (screen) => {
                const redirect = this._gateTarget(screen);
                return orig(redirect || screen);
            };
        },

        _bindSettingsScreen() {
            const $st = $('#settingsPasskeyState');
            const refresh = () => {
                if (!$st.length) return;
                try {
                    const pk = LapeeetDB.getPasskey();
                    if (pk && pk !== 'SKIP') $st.html('<span class="text-success">Enrolled on this device</span>');
                    else if (pk === 'SKIP') $st.html('<span class="text-muted">Skipped</span>');
                    else $st.html('<span class="text-warning">Not set up</span>');
                } catch (e) { $st.text('—'); }
            };
            refresh();
            $('#btnPasskeyAdd').off('click').on('click', async () => {
                const btn = $('#btnPasskeyAdd');
                if (btn.prop('disabled')) return;
                btn.prop('disabled', true);
                try {
                    const prof = LapeeetDB.getProfile();
                    const rec = await LapeeetAuth.registerPasskey({ name: LapeeetDB.displayName() || 'Lapeeet User', phone: prof.phone });
                    LapeeetDB.setPasskey(rec);
                    LapeeetUI.showToast('Passkey enrolled', 'success');
                    refresh();
                } catch (e) { LapeeetUI.showToast('Passkey failed: ' + LapeeetAuth.friendlyError(e, 'create'), 'danger'); }
                btn.prop('disabled', false);
            });
            $('#btnPasskeyRemove').off('click').on('click', () => {
                try {
                    LapeeetDB.setPasskey('SKIP');
                    LapeeetUI.showToast('Passkey removed — lock screen off', 'info');
                    refresh();
                } catch (e) { LapeeetUI.showToast('Remove failed: ' + (e.message || e), 'danger'); }
            });
            const refreshPin = () => {
                const el = $('#settingsPinState');
                if (!el.length) return;
                try {
                    el.html(LapeeetDB.getPin()
                        ? '<span class="text-success">Set on this device</span>'
                        : '<span class="text-muted">Not set</span>');
                } catch (e) { el.text('—'); }
            };
            refreshPin();
            $('#btnPinSet').off('click').on('click', async () => {
                const w0 = $('#pinCurWrap'), w1 = $('#pinSetWrap'), w2 = $('#pinSetWrap2');
                const existing = (() => { try { return LapeeetDB.getPin(); } catch (e) { return null; } })();
                if (!w1.is(':visible')) {
                    w0.toggle(!!existing);
                    w1.show(); w2.show();
                    (existing ? $('#settingsPinCur') : $('#settingsPin1')).focus();
                    return;
                }
                const p1 = ($('#settingsPin1').val() || '').trim();
                const p2 = ($('#settingsPin2').val() || '').trim();
                if (!LapeeetAuth.isValidPinFormat(p1) || p1 !== p2) {
                    LapeeetUI.showToast('PINs must match and be 4–12 digits', 'warning');
                    return;
                }
                try {
                    if (existing) {
                        const cur = ($('#settingsPinCur').val() || '').trim();
                        if (!(await LapeeetAuth.verifyPin(cur, existing))) {
                            LapeeetUI.showToast('Current PIN is wrong', 'danger');
                            return;
                        }
                    }
                    LapeeetDB.setPin(await LapeeetAuth.hashPin(p1));
                    $('#settingsPinCur, #settingsPin1, #settingsPin2').val('');
                    w0.hide(); w1.hide(); w2.hide();
                    LapeeetUI.showToast('Device PIN saved', 'success');
                    refreshPin();
                } catch (e) { LapeeetUI.showToast('PIN save failed: ' + (e.message || e), 'danger'); }
            });
            $('#btnPinRemove').off('click').on('click', () => {
                try {
                    LapeeetDB.setPin(null);
                    LapeeetUI.showToast('Device PIN removed', 'info');
                    refreshPin();
                } catch (e) { LapeeetUI.showToast('Remove failed: ' + (e.message || e), 'danger'); }
            });
        },

        _bindRecoverScreen() {
            const errBox = $('#recoverError');
            $('#btnRecoverImport').off('click').on('click', () => $('#fileRecoverDb').click());
            $('#fileRecoverDb').off('change').on('change', (e) => {
                const f = e.target.files && e.target.files[0];
                if (!f) return;
                errBox.hide();
                const rd = new FileReader();
                rd.onload = async () => {
                    try {
                        await LapeeetDB.importBinary(new Uint8Array(rd.result));
                        // Passkeys are device-bound: a backup's enrollment can never
                        // verify on a new device, so clear it and let the user re-enroll.
                        try { LapeeetDB.setPasskey(''); } catch (err) {}
                        this._unlocked = true;
                        LapeeetUI.updateSidebar({ name: LapeeetDB.displayName() || 'Guest User' });
                        LapeeetUI.showToast('Account recovered — add a fresh passkey in Settings', 'success');
                        LapeeetUI.navigate('home');
                    } catch (err) {
                        errBox.text('Recovery failed: ' + (err.message || err)).show();
                    }
                    e.target.value = '';
                };
                rd.onerror = () => errBox.text('Could not read file').show();
                rd.readAsArrayBuffer(f);
            });
            $('#btnRecoverFresh').off('click').on('click', async () => {
                try { await LapeeetDB.wipe(); } catch (e) {}
                try { localStorage.removeItem('lapeeet::role'); } catch (e) {}
                window.location.reload();
            });
            $('#btnRecoverBack').off('click').on('click', () => {
                if (!this._isRegistered()) LapeeetUI.navigate('onboarding');
                else if (this._needsUnlock()) LapeeetUI.navigate('lock');
                else LapeeetUI.navigate('home');
            });
        },

        /* ---------- LOGOUT (session lock) ---------- */

        _doLogout() {
            this._unlocked = false;
            try {
                const pk = (window.LapeeetDB && LapeeetDB.initialized) ? LapeeetDB.getPasskey() : null;
                if (pk && pk !== 'SKIP') {
                    try { $('#sidebarPanel').modal('hide'); } catch (e) {}
                    LapeeetUI.showToast('Locked — passkey required', 'info');
                    LapeeetUI.navigate('lock');
                    return;
                }
            } catch (e) {}
            try { $('#sidebarPanel').modal('hide'); } catch (e) {}
            LapeeetUI.showToast('No passkey on this device — add one in Settings to enable lock', 'warning');
        },

        _pinAttempts: 0,
        _pinLockUntil: 0,

        _bindLockScreen() {
            $('#btnLockRecover').off('click').on('click', () => LapeeetUI.navigate('recover'));
            // Show only the unlock methods actually enrolled on this device.
            try {
                const hasPk = (() => { const pk = LapeeetDB.getPasskey(); return !!(pk && pk !== 'SKIP'); })();
                const hasPin = !!LapeeetDB.getPin();
                $('#lockPkWrap').toggle(hasPk);
                $('#lockPinWrap').toggle(hasPin);
            } catch (e) {}
            $('#btnPinUnlock').off('click').on('click', async () => {
                const errBox = $('#lockError');
                errBox.hide();
                const now = Date.now();
                if (now < this._pinLockUntil) {
                    const s = Math.ceil((this._pinLockUntil - now) / 1000);
                    errBox.text(`Too many tries — wait ${s}s`).show();
                    return;
                }
                try {
                    const okPin = await LapeeetAuth.verifyPin(($('#lockPin').val() || '').trim(), LapeeetDB.getPin());
                    if (!okPin) throw new Error('Wrong PIN');
                    this._pinAttempts = 0;
                    this._pinLockUntil = 0;
                    this._unlocked = true;
                    LapeeetUI.showToast('Unlocked — welcome back', 'success');
                    LapeeetUI.navigate('home');
                } catch (e) {
                    this._pinAttempts++;
                    this._pinLockUntil = Date.now() + Math.min(this._pinAttempts * 2000, 15000);
                    errBox.text('Unlock failed: ' + (e.message || e)).show();
                    try { $('#lockPin').val(''); } catch (err) {}
                }
            });
            $('#btnUnlock').off('click').on('click', async () => {
                const btn = $('#btnUnlock');
                if (btn.prop('disabled')) return; // double-tap guard (one ceremony at a time)
                btn.prop('disabled', true);
                const errBox = $('#lockError');
                errBox.hide();
                try {
                    const enrolled = LapeeetDB.getPasskey();
                    const updated = await LapeeetAuth.unlockWithPasskey(enrolled);
                    LapeeetDB.setPasskey(updated);
                    this._unlocked = true;
                    LapeeetUI.showToast('Unlocked — welcome back', 'success');
                    LapeeetUI.navigate('home');
                } catch (e) {
                    errBox.text('Unlock failed: ' + LapeeetAuth.friendlyError(e, 'unlock')).show();
                    btn.prop('disabled', false);
                }
            });
            $('#btnLockErase').off('click').on('click', () => {
                LapeeetUI.openModal({
                    title: 'Erase this device?',
                    bodyHtml: '<p class="small">This wipes your local tenant DB (profile, e-bikes, rides). Export first from another device if you need it. This cannot be undone.</p>',
                    footerHtml: '<button class="btn btn-secondary" id="lockEraseCancel">Cancel</button> ' +
                        '<button class="btn btn-danger" id="lockEraseGo">Erase everything</button>'
                });
                $('#lockEraseCancel').off('click').on('click', () => LapeeetUI.closeModal());
                $('#lockEraseGo').off('click').on('click', async () => {
                    try { await LapeeetDB.wipe(); } catch (e) {}
                    try { localStorage.removeItem('lapeeet::role'); } catch (e) {}
                    window.location.reload();
                });
            });
        },

        /* ---------- PHASE 6: ?mode= ROLE DEEP LINKS ---------- */

        /** Pure mapping: URL param value -> role (or null when absent/invalid). */
        _modeFromParam(v) {
            if (v === undefined || v === null) return null;
            const s = String(v).trim().toLowerCase();
            if (s === 'driver') return 'DRIVER';
            if (s === 'passenger' || s === 'rider') return 'RIDER';
            return null;
        },

        /** Boot role: ?mode= param wins, then saved role, then RIDER. */
        resolveInitialRole() {
            try {
                const q = new URLSearchParams(window.location.search).get('mode');
                const fromUrl = this._modeFromParam(q);
                if (fromUrl) return fromUrl;
            } catch (e) { /* file:// or odd env — fall through */ }
            try {
                const saved = localStorage.getItem('lapeeet::role');
                if (saved === 'RIDER' || saved === 'DRIVER') return saved;
            } catch (e) { /* ignore */ }
            return 'RIDER';
        },

        /** Reflect current role into the URL (?mode=driver|passenger), no reload. */
        _syncModeUrl() {
            try {
                const url = new URL(window.location.href);
                url.searchParams.set('mode', this.role === 'DRIVER' ? 'driver' : 'passenger');
                window.history.replaceState(null, '', url.toString());
            } catch (e) { /* non-browser env — ignore */ }
        },

        _revealShell() {
            $('#appHeader, #appCapsule, #appBottomMenu').removeClass('d-none');
        },

        _lockPermanentDarkMode() {
            const body = $('body');
            body.addClass('dark-mode-active');
            try { localStorage.setItem('MobilekitDarkModeActive', '1'); } catch (e) { /* ignore */ }

            $('.dark-mode-switch').each(function () {
                this.checked = true;
                this.disabled = true;
            });

            // Guard against any accidental toggle (label click, base.js handler):
            // re-apply class + checked state on any change event.
            const self = this;
            $(document).on('change', '.dark-mode-switch', function () {
                if (!body.hasClass('dark-mode-active')) body.addClass('dark-mode-active');
                if (!this.checked) this.checked = true;
                try { localStorage.setItem('MobilekitDarkModeActive', '1'); } catch (e) { /* ignore */ }
                console.debug('[APP] Permanent dark mode lock restored.');
            });
            // Also re-lock whenever any screen renders (switch gets re-inserted into DOM)
            if (window.LapeeetUI) {
                const orig = window.LapeeetUI.navigate;
                const origBind = window.LapeeetUI._bindScreenEvents;
                window.LapeeetUI._bindScreenEvents = function () {
                    setTimeout(() => self._lockPermanentDarkModeUIOnly(), 0);
                    return origBind.apply(this, arguments);
                };
            }
            setTimeout(() => this._lockPermanentDarkModeUIOnly(), 0);
        },

        _lockPermanentDarkModeUIOnly() {
            const body = $('body');
            if (!body.hasClass('dark-mode-active')) body.addClass('dark-mode-active');
            $('.dark-mode-switch').each(function () {
                this.checked = true;
                this.disabled = true;
            });
        },

        _populateHomeStatus() {
            $('#dbStatus').html( LapeeetDB.initialized   ? '<span class="text-success">Ready</span>' : '<span class="text-warning">Phase 2 stub</span>');
            const peerN = (LapeeetP2P.peerCount) ? LapeeetP2P.peerCount() : 0;
            $('#p2pStatus').html(LapeeetP2P.initialized   ? '<span class="text-success">' + (LapeeetP2P.status) + ' · ' + peerN + ' peers</span>' : '<span class="text-warning">Phase 3 stub</span>');
            $('#mapStatus').html(LapeeetMap.initialized   ? '<span class="text-success">Active</span>' : '<span class="text-info">Open Map tab</span>');
            $('#peerId').text   (LapeeetP2P.connectId     ? (this._shortId(LapeeetP2P.connectId) + (LapeeetP2P.channel ? ' · ' + LapeeetP2P.channel : '')) : ('not-yet-connected (Phase 3)'));
            $('#keyStatus').html(LapeeetP2P.myPublicKey   ? '<span class="text-success">Generated</span>' : '<span class="text-warning">Phase 3</span>');
            const g = window.LapeeetGit;
            if ($('#gitStatus').length) {
                if (!g) $('#gitStatus').html('<span class="text-muted">Not loaded</span>');
                else if (!g.initialized) $('#gitStatus').html('<span class="text-info">Booting…</span>');
                else if (g.available) $('#gitStatus').html('<span class="text-success">v' + g.version + ' · OK</span>');
                else $('#gitStatus').html('<span class="text-danger">Lib missing</span>');
            }
        },

        async _populateSettingsGit() {
            const $rt = $('#settingsGitRuntime');
            if (!$rt.length) return;
            const g = window.LapeeetGit;
            if (!g) { $rt.text('Facade missing (git-layer.js not loaded)'); return; }
            if (!g.available) {
                $rt.html('<span class="text-danger">isomorphic-git UMD or LightningFS UMD not present</span>');
                $('#settingsGitRepo').text('—');
                $('#settingsGitQuota').text('—');
                $('#settingsGitLast').text('—');
                $('#settingsGitWorking').text('—');
                return;
            }
            $rt.html('<span class="text-success">v' + g.version + ' · IndexedDB backed</span>');
            $('#settingsGitRepo').text(g.currentRepo());
            const info = await g.storageInfo();
            const fmt = (n) => {
                if (n == null) return 'n/a';
                if (n < 1024) return n + ' B';
                if (n < 1024*1024) return (n/1024).toFixed(1) + ' KB';
                if (n < 1024*1024*1024) return (n/(1024*1024)).toFixed(2) + ' MB';
                return (n/(1024*1024*1024)).toFixed(2) + ' GB';
            };
            if (info.usedBytes) {
                const qt = fmt(info.usedBytes) + (info.quotaBytes ? (' / ' + fmt(info.quotaBytes)) : '');
                $('#settingsGitQuota').text(qt);
            } else if (info.files != null) {
                $('#settingsGitQuota').text(info.files + ' files in repo');
            }
            const log = await g.log(5);
            if (log && log.length) {
                const c = log[0];
                const ts = c.commit && c.commit.author ? new Date(c.commit.author.timestamp * 1000).toLocaleString() : '';
                $('#settingsGitLast').text(`${c.oid.slice(0, 8)} · ${c.commit.message.split('\n')[0]}${ts ? ' · ' + ts : ''}`);
            } else {
                $('#settingsGitLast').text('(no commits yet)');
            }
            const tree = await g.inspectWorkingTree();
            const pending = tree.filter(r => r.workdir !== 0 && r.stage !== r.workdir);
            $('#settingsGitWorking').text(pending.length ? (pending.length + ' uncommitted change(s)') : 'Clean');
        },

        _initMapDeferred() {
            const self = this;
            LapeeetMap.init('map', {
                onPickupChange:   (p) => {
                    const el = document.getElementById('pickupInput');
                    if (el && p && p.address) el.value = this._truncate(p.address, 120);
                    if (self._mapDebug) console.debug('[APP] pickup:', p);
                },
                onDropoffChange:  (p) => {
                    const el = document.getElementById('dropoffInput');
                    if (el && p && p.address) el.value = this._truncate(p.address, 120);
                    if (self._mapDebug) console.debug('[APP] dropoff:', p);
                },
                onRouteCalculated: (r) => {
                    const cat = LapeeetMap.classifyDistance(r.distanceKm);
                    self._lastRoute = { distanceKm: r.distanceKm, durationMin: r.durationMin };
                    $('#distKm').text(`${r.distanceKm.toFixed(1)} km${r.haversine ? ' (approx)' : ''}`);
                    $('#etaMin').text(`${Math.round(r.durationMin)} min`);
                    $('#fareEst').text(this._calcFare(r.distanceKm, r.durationMin));
                    $('#distBadge')
                        .attr('class', 'badge ml-1 radius-indicator radius-' + cat)
                        .text(cat === 'bad' ? `Over 60 km · blocked at ${r.distanceKm.toFixed(1)} km`
                            : cat === 'warn' ? 'Near 60 km limit' : 'Within range');
                    const btn = $('#btnRequestRide');
                    const allowed = LapeeetMap.isDistanceAllowed(r.distanceKm);
                    btn.prop('disabled', !allowed);
                    if (!allowed) btn.removeClass('btn-primary shadowed').addClass('btn-secondary disabled');
                    else btn.removeClass('btn-secondary disabled').addClass('btn-primary shadowed');
                }
            });
            this._bindMapScreenButtons();
        },

        _bindMapScreenButtons() {
            const self = this;
            $('#btnOpenOm').off('click').on('click', () => LapeeetMap.launchOrganicMaps('route', {}));
            $('#btnRequestRide').off('click').on('click', () => {
                if (!LapeeetMap.pickupLatLng || !LapeeetMap.dropoffLatLng) {
                    LapeeetUI.showToast('Set pickup and dropoff on the map first', 'warning');
                    return;
                }
                const km = (self._lastRoute && self._lastRoute.distanceKm) ||
                    LapeeetMap.haversineKm(LapeeetMap.pickupLatLng.lat, LapeeetMap.pickupLatLng.lng,
                        LapeeetMap.dropoffLatLng.lat, LapeeetMap.dropoffLatLng.lng);
                if (!LapeeetMap.isDistanceAllowed(km)) {
                    LapeeetUI.showToast('Trip exceeds 60 km — choose a closer destination', 'danger');
                    return;
                }
                const min = (self._lastRoute && self._lastRoute.durationMin) || Math.max(1, Math.round(km * 2.8));
                const cap = self.getCapacity ? self.getCapacity() : 1;
                const rideId = 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
                const ride = {
                    ride_id: rideId,
                    pickup_lat: LapeeetMap.pickupLatLng.lat, pickup_lng: LapeeetMap.pickupLatLng.lng,
                    drop_lat: LapeeetMap.dropoffLatLng.lat, drop_lng: LapeeetMap.dropoffLatLng.lng,
                    distance_km: Math.round(km * 10) / 10,
                    fare_php: Math.round((30 + km * 12 + min * 2) * 100) / 100,
                    capacity: cap, ts: Date.now()
                };
                try {
                    LapeeetDB.upsertRide('RIDER', Object.assign({}, ride, {
                        id: rideId, status: 'requested', peer_id: '', created_at: Date.now()
                    }));
                    LapeeetDB.appendEvent({ ride_id: rideId, type: 'RIDE_REQUEST', from_id: LapeeetP2P.connectId || 'me', body: ride }, '');
                } catch (e) { LapeeetUI.showToast('Could not save ride: ' + (e.message || e), 'danger'); return; }
                const env = LapeeetP2P.sendRideRequest(ride);
                if (env) {
                    LapeeetUI.showToast(`Ride broadcast to ${LapeeetP2P.peerCount()} peer${LapeeetP2P.peerCount() === 1 ? '' : 's'} — waiting for drivers`, 'success');
                } else {
                    LapeeetUI.showToast('Mesh offline — ride saved, retry when connected', 'warning');
                }
            });
            $('#btnLocate').off('click').on('click', async () => {
                const p = await LapeeetMap.flyToCurrentLocation();
                if (p && !LapeeetMap.pickupLatLng) LapeeetMap.setPickup(p.lat, p.lng, true);
            });
            $('#btnClearPins').off('click').on('click', () => {
                LapeeetMap.clearPins();
                $('#pickupInput, #dropoffInput').val('');
                $('#distKm, #etaMin, #fareEst').text('—');
                $('#distBadge')
                    .attr('class', 'badge ml-1 radius-indicator radius-ok')
                    .text('Within range');
                $('#btnRequestRide').prop('disabled', true)
                    .removeClass('btn-secondary disabled').addClass('btn-primary shadowed');
                $('#pickupSuggest, #dropoffSuggest').empty();
            });

            this._bindAutocomplete('pickup', 'pickupInput', 'pickupSuggest');
            this._bindAutocomplete('dropoff', 'dropoffInput', 'dropoffSuggest');

            this._bindCapacityDropdown();
            this._renderDriverRequests();
            this._renderActiveRide();
        },

        _shortId(id) {
            id = String(id || '');
            return id.length > 12 ? id.slice(0, 8) + '…' + id.slice(-4) : id;
        },

        _renderDriverRequests() {
            const sec = $('#driverRequestsSection');
            if (!sec.length) return;
            const isDriver = this.role === 'DRIVER';
            sec.toggle(isDriver);
            if (!isDriver) return;
            const list = $('#driverRequestsList');
            const reqs = Array.from(LapeeetP2P.rideRequests.entries())
                .sort((a, b) => b[1].ts - a[1].ts).slice(0, 10);
            if (!reqs.length) {
                list.html('<li class="small text-muted">Listening for RIDE_REQUEST broadcasts…</li>');
                return;
            }
            list.html(reqs.map(([rideId, r]) => {
                const b = r.body;
                return `<li><div class="d-flex justify-content-between align-items-center w-100">
                    <div><strong>${Number(b.distance_km).toFixed(1)} km · ${LapeeetUI.formatCurrency(b.fare_php || 0)}</strong>
                    <div class="small text-muted">${b.capacity} seat${b.capacity > 1 ? 's' : ''} · rider ${this._shortId(r.from)}</div></div>
                    <div><button class="btn btn-sm btn-success mr-1" data-req-accept="${rideId}">Accept</button>` +
                    `<button class="btn btn-sm btn-outline-secondary" data-req-reject="${rideId}">Reject</button></div>
                </div></li>`;
            }).join(''));
            list.off('click.reqRow').on('click.reqRow', 'button[data-req-accept], button[data-req-reject]', (e) => {
                const btn = $(e.currentTarget);
                if (btn.is('[data-req-accept]')) this._driverAccept(btn.attr('data-req-accept'));
                else this._driverReject(btn.attr('data-req-reject'));
            });
        },

        _driverAccept(rideId) {
            const rec = LapeeetP2P.rideRequests.get(rideId);
            if (!rec) { LapeeetUI.showToast('Request expired', 'warning'); return; }
            const b = rec.body;
            let bike = null;
            try {
                bike = LapeeetDB.getPrimaryEbike() || (LapeeetDB.listEbikes()[0] || null);
                LapeeetDB.upsertRide('DRIVER', {
                    id: rideId, pickup_lat: b.pickup_lat, pickup_lng: b.pickup_lng,
                    drop_lat: b.drop_lat, drop_lng: b.drop_lng, distance_km: b.distance_km,
                    fare_php: b.fare_php || 0, status: 'accepted', peer_id: rec.from, created_at: Date.now()
                });
                LapeeetDB.appendEvent({ ride_id: rideId, type: 'RIDE_ACCEPT', from_id: LapeeetP2P.connectId, body: b }, '');
            } catch (e) { LapeeetUI.showToast('Accept failed: ' + (e.message || e), 'danger'); return; }
            const ebike = bike ? { brand: bike.brand, model: bike.model, color: bike.color, capacity: bike.capacity } : {};
            LapeeetP2P.sendRideAccept(rec.from, Object.assign({ ride_id: rideId, eta_min: 10 }, { ebike }));
            try {
                LapeeetP2P.sendEbikeInfo(rec.from, Object.assign({ ride_id: rideId }, ebike, { photo1: bike && bike.photo1 ? bike.photo1 : '' }));
            } catch (e) {}
            LapeeetP2P.activeRide = { ride_id: rideId, peer_identity: rec.from, role: 'DRIVER' };
            LapeeetP2P.rideRequests.delete(rideId);
            LapeeetUI.showToast('Ride accepted — rider notified', 'success');
            this._chatSelected = rec.from;
            this._renderDriverRequests();
            this._renderActiveRide();
        },

        _driverReject(rideId) {
            const rec = LapeeetP2P.rideRequests.get(rideId);
            if (rec) {
                LapeeetP2P.sendRideReject(rec.from, { ride_id: rideId });
                LapeeetP2P.rideRequests.delete(rideId);
            }
            this._renderDriverRequests();
        },

        _renderActiveRide() {
            const sec = $('#activeRideSection');
            if (!sec.length) return;
            const ar = LapeeetP2P.activeRide;
            if (!ar) { sec.hide(); return; }
            sec.show();
            const body = $('#activeRideBody');
            const isDriver = ar.role === 'DRIVER';
            body.html(
                `<p class="small mb-1">Ride <strong>${this._shortId(ar.ride_id)}</strong> · peer <strong>${this._shortId(ar.peer_identity)}</strong></p>` +
                `<div class="d-flex" style="gap:8px;flex-wrap:wrap">` +
                (isDriver
                    ? `<button class="btn btn-sm btn-primary" data-ride-status="enroute">Enroute</button>` +
                      `<button class="btn btn-sm btn-primary" data-ride-status="arrived">Arrived</button>` +
                      `<button class="btn btn-sm btn-success" data-ride-status="completed">Completed</button>`
                    : `<button class="btn btn-sm btn-outline-primary" data-ride-chat="1">Chat</button>` +
                      `<button class="btn btn-sm btn-outline-primary" data-ride-call="1">Call</button>` +
                      `<button class="btn btn-sm btn-outline-secondary" data-ride-nav="1">Navigate</button>`) +
                `<button class="btn btn-sm btn-danger" data-ride-cancel="1">Cancel</button></div>`);
            body.off('click.rideRow').on('click.rideRow', 'button', (e) => {
                const btn = $(e.currentTarget);
                if (btn.is('[data-ride-status]')) this._driverSetStatus(btn.attr('data-ride-status'));
                else if (btn.is('[data-ride-cancel]')) this._cancelActiveRide();
                else if (btn.is('[data-ride-chat]')) { this._chatSelected = ar.peer_identity; LapeeetUI.navigate('messages'); }
                else if (btn.is('[data-ride-call]')) { try { LapeeetCall.startCall(ar.peer_identity, ar.ride_id, true, true); } catch (err) {} }
                else if (btn.is('[data-ride-nav]')) { LapeeetMap.launchOrganicMaps('route', {}); }
            });
        },

        _driverSetStatus(status) {
            const ar = LapeeetP2P.activeRide;
            if (!ar) return;
            try {
                LapeeetDB.upsertRide('DRIVER', {
                    id: ar.ride_id, status, peer_id: ar.peer_identity, created_at: Date.now()
                });
                LapeeetDB.appendEvent({ ride_id: ar.ride_id, type: 'RIDE_STATUS', from_id: LapeeetP2P.connectId, body: { status } }, '');
            } catch (e) {}
            LapeeetP2P.sendRideStatus(ar.peer_identity, { ride_id: ar.ride_id, status });
            LapeeetUI.showToast('Status → ' + status, 'info');
            if (status === 'completed') {
                LapeeetP2P.activeRide = null;
                this._renderActiveRide();
            }
        },

        _cancelActiveRide() {
            const ar = LapeeetP2P.activeRide;
            if (!ar) return;
            try {
                LapeeetDB.appendEvent({ ride_id: ar.ride_id, type: 'RIDE_CANCEL', from_id: LapeeetP2P.connectId, body: {} }, '');
            } catch (e) {}
            LapeeetP2P.sendRideCancel(ar.peer_identity, { ride_id: ar.ride_id });
            LapeeetP2P.activeRide = null;
            this._renderActiveRide();
            LapeeetUI.showToast('Ride cancelled', 'warning');
        },

        /* ---------- CHAT STORE (localStorage, per peer identity) ---------- */
        _chatSelected: null,
        _CHAT_KEY: 'lapeeet::chat_v1',
        _chatLoad() {
            try { return JSON.parse(localStorage.getItem(this._CHAT_KEY) || '{}'); }
            catch (e) { return {}; }
        },
        _chatSave(all) {
            try {
                const ids = Object.keys(all).slice(-20);
                const slim = {};
                ids.forEach(id => { slim[id] = (all[id] || []).slice(-100); });
                localStorage.setItem(this._CHAT_KEY, JSON.stringify(slim));
            } catch (e) {}
        },
        _chatPeers() {
            const all = this._chatLoad();
            const ids = Object.keys(all);
            LapeeetP2P.peers.forEach((p, id) => { if (ids.indexOf(id) === -1) ids.push(id); });
            if (this._chatSelected && ids.indexOf(this._chatSelected) === -1) ids.push(this._chatSelected);
            return ids.map(id => {
                const thread = all[id] || [];
                const peer = LapeeetP2P.peers.get(id) || {};
                return {
                    id,
                    label: peer.name || (peer.brand ? peer.brand + ' ' + (peer.model || '') : null) || id.slice(0, 8),
                    unread: thread.filter(m => !m.mine && !m.read).length
                };
            });
        },
        _chatThread(id) {
            if (!id) return [];
            return this._chatLoad()[id] || [];
        },
        _chatPush(id, text, mine) {
            if (!id) return;
            const all = this._chatLoad();
            (all[id] = all[id] || []).push({ text: String(text).slice(0, 500), mine: !!mine, ts: Date.now(), read: !!mine });
            this._chatSave(all);
        },
        _chatMarkRead(id) {
            if (!id) return;
            const all = this._chatLoad();
            (all[id] || []).forEach(m => { m.read = true; });
            this._chatSave(all);
        },

        _findRide(id) {
            try {
                const tables = ['my_rides_as_rider', 'my_rides_as_driver'];
                for (const t of tables) {
                    const rows = LapeeetDB._all(`SELECT * FROM ${t} WHERE id = ?`, [id]);
                    if (rows.length) return rows[0];
                }
            } catch (e) {}
            return null;
        },

        _bindTripsScreen() {
            $('#screen-root').off('click.receipt').on('click.receipt', 'a[data-receipt]', (e) => {
                e.preventDefault();
                const ride = this._findRide($(e.currentTarget).attr('data-receipt'));
                if (!ride) { LapeeetUI.showToast('Receipt not found', 'warning'); return; }
                const when = new Date(ride.created_at || Date.now()).toLocaleString();
                LapeeetUI.openModal({
                    title: 'Ride receipt',
                    bodyHtml: `<div id="receiptBody">` +
                        `<p><strong>Lapeeet</strong> · peer-to-peer e-bike receipt</p>` +
                        `<ul class="listview flush transparent simple-listview">` +
                        `<li>Ride <strong>${this._escapeAttr(ride.id)}</strong></li>` +
                        `<li>Date <strong>${when}</strong></li>` +
                        `<li>Distance <strong>${(Number(ride.distance_km) || 0).toFixed(1)} km</strong></li>` +
                        `<li>Status <strong>${this._escapeAttr(ride.status || '')}</strong></li>` +
                        `<li>Total <strong>${LapeeetUI.formatCurrency(ride.fare_php || 0)}</strong></li>` +
                        `</ul></div>`,
                    footerHtml: `<button class="btn btn-primary" id="btnPrintReceipt">Print / PDF</button>`
                });
                $('#btnPrintReceipt').off('click').on('click', () => window.print());
            });
        },

        _bindMessagesScreen() {
            if (this._chatSelected) this._chatMarkRead(this._chatSelected);
            $('#screen-root').off('click.chatPeer').on('click.chatPeer', 'a[data-chat-peer]', (e) => {
                e.preventDefault();
                this._chatSelected = $(e.currentTarget).attr('data-chat-peer');
                LapeeetUI.navigate('messages');
            });
            $('#btnChatSend').off('click').on('click', () => {
                const text = ($('#chatInput').val() || '').trim();
                if (!text || !this._chatSelected) return;
                const env = LapeeetP2P.sendChat(this._chatSelected, { text });
                if (env) {
                    this._chatPush(this._chatSelected, text, true);
                    LapeeetUI.navigate('messages');
                } else {
                    LapeeetUI.showToast('Peer offline — message not sent', 'warning');
                }
            });
        },

        /* ---------- P2P EVENT ROUTER ---------- */

        _onP2PEvent(evt) {
            console.debug('[APP] P2P event:', evt.type);
            const T = LapeeetP2P.MSG_TYPES;
            switch (evt.type) {
                case '__status':
                case '__peer-join':
                case '__peer-leave':
                    this._populateHomeStatus();
                    if (LapeeetUI.currentScreen === 'map') this._renderDriverRequests();
                    break;
                case T.RIDE_REQUEST:
                    if (this.role === 'DRIVER' && !evt.isSelf) {
                        LapeeetUI.showToast('New ride request nearby', 'info');
                        if (LapeeetUI.currentScreen === 'map') this._renderDriverRequests();
                    }
                    break;
                case T.RIDE_ACCEPT:
                    if (!evt.isSelf) this._onRideAccepted(evt);
                    break;
                case T.RIDE_REJECT:
                    if (!evt.isSelf) {
                        LapeeetUI.showToast('Driver declined — try another request', 'warning');
                        try { LapeeetDB.appendEvent({ ride_id: evt.body.ride_id, type: 'RIDE_REJECT', from_id: evt.from, body: evt.body }, ''); } catch (e) {}
                    }
                    break;
                case T.RIDE_CANCEL:
                    if (!evt.isSelf) {
                        LapeeetUI.showToast('Ride cancelled by peer', 'warning');
                        try { LapeeetDB.appendEvent({ ride_id: evt.body.ride_id, type: 'RIDE_CANCEL', from_id: evt.from, body: evt.body }, ''); } catch (e) {}
                        if (LapeeetP2P.activeRide && LapeeetP2P.activeRide.ride_id === evt.body.ride_id) {
                            LapeeetP2P.activeRide = null;
                            this._renderActiveRide();
                        }
                    }
                    break;
                case T.RIDE_STATUS:
                    if (!evt.isSelf) this._onRideStatus(evt);
                    break;
                case T.LOCATION_UPDATE:
                    if (!evt.isSelf && evt.body.lat !== undefined) {
                        try { LapeeetMap.upsertDriverPin(evt.from, evt.body.lat, evt.body.lng, { name: 'Driver' }); } catch (e) {}
                    }
                    break;
                case T.EBIKE_INFO:
                    if (!evt.isSelf) {
                        LapeeetUI.showToast(`Driver e-bike: ${evt.body.brand || ''} ${evt.body.model || ''}`.trim(), 'info');
                        try { LapeeetDB.appendEvent({ ride_id: evt.body.ride_id, type: 'EBIKE_INFO', from_id: evt.from, body: evt.body }, ''); } catch (e) {}
                    }
                    break;
                case T.RIDER_INFO:
                    if (!evt.isSelf) {
                        LapeeetUI.showToast(`Rider: ${evt.body.name || 'guest'}`.trim(), 'info');
                        try { LapeeetDB.appendEvent({ ride_id: evt.body.ride_id, type: 'RIDER_INFO', from_id: evt.from, body: { name: evt.body.name || '' } }, ''); } catch (e) {}
                    }
                    break;
                case T.RATING:
                    if (!evt.isSelf) {
                        LapeeetUI.showToast(`You got ${evt.body.stars || '?'}★ from peer`, 'success');
                        try { LapeeetDB.appendEvent({ ride_id: evt.body.ride_id, type: 'RATING', from_id: evt.from, body: evt.body }, ''); } catch (e) {}
                    }
                    break;
                case T.CHAT:
                    if (!evt.isSelf && evt.body.text) {
                        this._chatPush(evt.from, evt.body.text, false);
                        if (LapeeetUI.currentScreen === 'messages') LapeeetUI.navigate('messages');
                        else LapeeetUI.showToast('New P2P message', 'info');
                    }
                    break;
                case T.DB_SYNC_REQ:
                    if (!evt.isSelf) {
                        let counts = {};
                        try {
                            counts = {
                                ebikes: LapeeetDB.listEbikes().length,
                                rides_rider: LapeeetDB.listRides('RIDER', 1000).length,
                                rides_driver: LapeeetDB.listRides('DRIVER', 1000).length
                            };
                        } catch (e) {}
                        LapeeetP2P.sendDirect(evt.from, T.DB_SYNC_RES, counts);
                    }
                    break;
                case T.DB_SYNC_RES:
                    if (!evt.isSelf) console.info('[APP] peer DB summary:', evt.body);
                    break;
                case T.CALL_INITIATE:
                    if (!evt.isSelf && window.LapeeetCall) LapeeetCall._handleIncoming(evt.body, evt.from, evt.transportId);
                    break;
                case T.CALL_END:
                    if (!evt.isSelf && window.LapeeetCall) LapeeetCall._handleRemoteEnd();
                    break;
                default:
                    break;
            }
        },

        _onRideAccepted(evt) {
            const b = evt.body || {};
            try {
                LapeeetDB.upsertRide('RIDER', {
                    id: b.ride_id, status: 'accepted', peer_id: evt.from, created_at: Date.now()
                });
                LapeeetDB.appendEvent({ ride_id: b.ride_id, type: 'RIDE_ACCEPT', from_id: evt.from, body: b }, '');
                const prof = LapeeetDB.getProfile();
                LapeeetP2P.sendDirect(evt.from, LapeeetP2P.MSG_TYPES.RIDER_INFO,
                    { ride_id: b.ride_id, name: LapeeetDB.displayName(), phone: prof.phone || '' });
            } catch (e) {}
            LapeeetP2P.activeRide = { ride_id: b.ride_id, peer_identity: evt.from, role: 'RIDER' };
            this._chatSelected = evt.from;
            this._renderActiveRide();
            const eb = b.ebike || {};
            LapeeetUI.openModal({
                title: 'Driver found',
                bodyHtml: `<p>ETA ~${b.eta_min || '?'} min</p>` +
                    `<p class="small text-muted">E-bike: ${this._escapeAttr(eb.brand || '')} ${this._escapeAttr(eb.model || '')} · ${eb.capacity || '?'} seats</p>` +
                    `<p class="small text-muted">Phone + photo arrive via direct messages after match.</p>`,
                footerHtml: `<button class="btn btn-outline-primary" data-match="chat">Chat</button> ` +
                    `<button class="btn btn-outline-primary" data-match="call">Call</button> ` +
                    `<button class="btn btn-primary" data-match="nav">Navigate</button>`
            });
            $('#globalModalFooter').off('click.match').on('click.match', 'button[data-match]', (e) => {
                const what = $(e.currentTarget).attr('data-match');
                LapeeetUI.closeModal();
                if (what === 'chat') { this._chatSelected = evt.from; LapeeetUI.navigate('messages'); }
                else if (what === 'call') { try { LapeeetCall.startCall(evt.from, b.ride_id, true, true); } catch (err) {} }
                else if (what === 'nav') { LapeeetMap.launchOrganicMaps('route', {}); }
            });
        },

        _onRideStatus(evt) {
            const b = evt.body || {};
            try {
                LapeeetDB.appendEvent({ ride_id: b.ride_id, type: 'RIDE_STATUS', from_id: evt.from, body: b }, '');
            } catch (e) {}
            LapeeetUI.showToast('Ride status → ' + (b.status || '?'), 'info');
            if (b.status === 'completed') {
                LapeeetP2P.activeRide = null;
                this._renderActiveRide();
                this._showRatingModal(b.ride_id, evt.from);
            }
        },

        _showRatingModal(rideId, peerIdentity) {
            LapeeetUI.openModal({
                title: 'Rate your ride',
                bodyHtml: '<div class="d-flex" style="gap:8px">' +
                    [1, 2, 3, 4, 5].map(s => `<button class="btn btn-outline-primary" data-stars="${s}">${s}★</button>`).join('') +
                    '</div>',
                footerHtml: '<button class="btn btn-secondary" data-stars="0">Skip</button>'
            });
            $('#globalModalBody, #globalModalFooter').off('click.rate').on('click.rate', 'button[data-stars]', (e) => {
                const stars = Number($(e.currentTarget).attr('data-stars'));
                LapeeetUI.closeModal();
                if (stars > 0) {
                    LapeeetP2P.sendRating(peerIdentity, { ride_id: rideId, stars });
                    try { LapeeetDB.appendEvent({ ride_id: rideId, type: 'RATING', from_id: LapeeetP2P.connectId, body: { stars } }, ''); } catch (err) {}
                    LapeeetUI.showToast(`Rated ${stars}★`, 'success');
                }
            });
        },

        _bindCapacityDropdown() {
            const self = this;
            const $group = $('#capacityGroup');
            if (!$group.length || $group.data('cap-bound')) return;
            $group.data('cap-bound', true);
            const $btn   = $group.find('.capacity-dropdown__button');
            const $list  = $group.find('.capacity-dropdown__list');
            const $inp   = $group.find('input[name="capacity"]');
            const $labVal = $group.find('#capacityValueLabel');
            const $labTit = $group.find('#capacityTitleLabel');
            const $labSub = $group.find('.capacity-dropdown__sel-sub').first();
            const $btnPill= $group.find('.capacity-dropdown__button .capacity-pill');
            const whitelist = (LapeeetUI && LapeeetUI.EBIKE_CAPACITIES) || [1,2,3,6,8,10,12,15];
            const $opts = $list.find('li[role="option"]');
            let focusIdx = -1;

            function close() {
                $list.removeClass('is-open').attr('aria-hidden', 'true');
                $btn.attr('aria-expanded', 'false');
                $opts.removeClass('is-focused');
                focusIdx = -1;
            }
            function open() {
                $list.addClass('is-open').attr('aria-hidden', 'false');
                $btn.attr('aria-expanded', 'true');
                // Focus current selection for keyboard users.
                const cur = $opts.filter('.is-selected').first();
                focusIdx = cur.length ? $opts.index(cur) : 0;
                applyFocus();
                const sel = $opts.eq(focusIdx)[0];
                if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: 'nearest' });
            }
            function applyFocus() {
                $opts.removeClass('is-focused');
                if (focusIdx >= 0 && focusIdx < $opts.length) $opts.eq(focusIdx).addClass('is-focused');
            }
            function setValue(raw, silent) {
                let val = parseInt(String(raw || '0'), 10);
                if (!val || isNaN(val) || whitelist.indexOf(val) === -1) {
                    if (!silent) LapeeetUI.showToast('Seat count ' + (val || raw) + ' not supported — using 1', 'warning');
                    val = 1;
                }
                $inp.val(String(val));
                // update option row selection states
                $opts.each(function () {
                    const opt = $(this);
                    const optV  = parseInt(opt.attr('data-value') || '0', 10);
                    const same = optV === val;
                    opt.attr('data-selected', same ? 'true' : 'false')
                       .attr('aria-selected', same ? 'true' : 'false')
                       .toggleClass('is-selected', same);
                    if (same) {
                        // copy pill icon to button pill
                        const pillHtml = opt.find('.capacity-pill').html();
                        $btnPill.empty().html(pillHtml).attr('data-capacity', String(val));
                        const title = opt.attr('data-title') || (val + ' Passenger');
                        const sub   = opt.attr('data-sub')   || '';
                        $labVal.text(String(val));
                        $labTit.text(title);
                        $labSub.text(sub);
                    }
                });
                if (!silent) {
                    // emit synthetic capacity change for external listeners
                    $inp.trigger('capacitychanged', [val]);
                }
            }

            // Initial: sync UI to hidden input default (1) + enforce whitelist
            setValue($inp.val() || '1', true);

            // Toggle dropdown open/close
            $btn.on('click', function (e) {
                e.stopPropagation();
                e.preventDefault();
                if ($list.hasClass('is-open')) close();
                else open();
            });

            // Option click: set + close
            $opts.on('click', function (e) {
                e.stopPropagation();
                e.preventDefault();
                const v = $(this).attr('data-value');
                setValue(v, false);
                close();
                $btn.focus();
            });

            // Keyboard: arrows move, Enter/Space select, Escape closes.
            $btn.add($list).on('keydown', function (e) {
                const k = e.key;
                if (k === 'ArrowDown' || k === 'ArrowUp') {
                    e.preventDefault();
                    if (!$list.hasClass('is-open')) { open(); return; }
                    focusIdx = (focusIdx + (k === 'ArrowDown' ? 1 : -1) + $opts.length) % $opts.length;
                    applyFocus();
                    const el = $opts.eq(focusIdx)[0];
                    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
                } else if (k === 'Enter' || k === ' ') {
                    if ($list.hasClass('is-open') && focusIdx >= 0) {
                        e.preventDefault();
                        setValue($opts.eq(focusIdx).attr('data-value'), false);
                        close();
                        $btn.focus();
                    }
                } else if (k === 'Escape') {
                    if ($list.hasClass('is-open')) { e.preventDefault(); close(); $btn.focus(); }
                } else if (k === 'Tab') {
                    close();
                }
            });

            // Close on outside click + escape (namespaced so re-navigation never stacks handlers)
            $(document).off('click.capacityDD').on('click.capacityDD', function (e) {
                if (!$group.has(e.target).length) close();
            });
            $(document).off('keydown.capacityDD').on('keydown.capacityDD', function (e) {
                if (e.key === 'Escape') close();
            });

            // Whitelist guard on hidden-input tamper
            $inp.off('change input').on('change input', function () {
                setValue($(this).val(), false);
            });

            // Public helpers on LapeeetApp
            self.getCapacity = function () { return parseInt($inp.val() || '1', 10); };
            self.setCapacity = function (v, sil) { setValue(v, !!sil); };
        },

        _downloadBlob(blob, filename) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 800);
        },

        _bindDataScreen() {
            const $status = $('#dataDbStatus');
            if ($status.length) {
                if (LapeeetDB.initialized) {
                    const n = LapeeetDB.listEbikes().length;
                    $status.text(`DB: ready · ${n} e-bike${n === 1 ? '' : 's'} stored locally`);
                } else {
                    $status.text('DB: unavailable — reload the app');
                }
            }
            $('#btnExportDb').off('click').on('click', () => {
                try {
                    const bin = LapeeetDB.exportBinary();
                    this._downloadBlob(new Blob([bin], { type: 'application/x-sqlite3' }),
                        'lapeeet-tenant-' + new Date().toISOString().slice(0, 10) + '.db');
                    try { localStorage.setItem('lapeeet::last_backup', String(Date.now())); } catch (e) {}
                    LapeeetUI.showToast('Tenant .db exported', 'success');
                } catch (e) { LapeeetUI.showToast('Export failed: ' + (e.message || e), 'danger'); }
            });
            $('#btnExportJson').off('click').on('click', () => {
                try {
                    const dump = LapeeetDB.exportJSON();
                    this._downloadBlob(new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' }),
                        'lapeeet-tenant-' + new Date().toISOString().slice(0, 10) + '.json');
                    try { localStorage.setItem('lapeeet::last_backup', String(Date.now())); } catch (e) {}
                    LapeeetUI.showToast('Tenant JSON exported', 'success');
                } catch (e) { LapeeetUI.showToast('Export failed: ' + (e.message || e), 'danger'); }
            });
            $('#btnImportDb').off('click').on('click', () => $('#fileImportDb').click());
            $('#fileImportDb').off('change').on('change', (e) => {
                const f = e.target.files && e.target.files[0];
                if (!f) return;
                const rd = new FileReader();
                rd.onload = async () => {
                    try {
                        await LapeeetDB.importBinary(new Uint8Array(rd.result));
                        LapeeetUI.showToast('Database imported — reloading view', 'success');
                        LapeeetUI.navigate('home');
                    } catch (err) { LapeeetUI.showToast('Import failed: ' + (err.message || err), 'danger'); }
                    e.target.value = '';
                };
                rd.onerror = () => LapeeetUI.showToast('Could not read file', 'danger');
                rd.readAsArrayBuffer(f);
            });
            const $wipe = $('#btnWipeDb');
            $wipe.off('click').on('click', () => {
                if (!$wipe.data('armed')) {
                    $wipe.data('armed', true);
                    $wipe.html('<ion-icon name="warning-outline"></ion-icon> Tap again to confirm WIPE');
                    setTimeout(() => {
                        $wipe.data('armed', false);
                        $wipe.html('<ion-icon name="trash-outline"></ion-icon> Wipe All My Local Data');
                    }, 5000);
                    return;
                }
                LapeeetDB.wipe().then(() => LapeeetDB.init(this.role)).then(() => {
                    LapeeetUI.showToast('All local data wiped', 'info');
                    LapeeetUI.navigate('home');
                }).catch(err => LapeeetUI.showToast('Wipe failed: ' + (err.message || err), 'danger'));
            });
        },

        _bindProfileScreen() {
            $('#btnProfileLogout').off('click').on('click', () => this._doLogout());
            $('#avatarPick').off('click').on('click', (e) => { e.preventDefault(); $('#profileAvatarFile').click(); });
            $('#profileAvatarFile').off('change').on('change', async (e) => {
                const f = e.target.files && e.target.files[0];
                if (!f) return;
                try {
                    const dataUrl = await LapeeetDB.processAvatar(f);
                    LapeeetDB.saveProfile({ avatar_url: dataUrl });
                    $('#profileAvatarImg').attr('src', dataUrl);
                    LapeeetUI.showToast('Profile photo updated', 'success');
                } catch (err) { LapeeetUI.showToast('Photo failed: ' + (err.message || err), 'danger'); }
                e.target.value = '';
            });
            $('#btnSaveProfile').off('click').on('click', () => {
                try {
                    const phoneRaw = ($('#profilePhone').val() || '').trim();
                    const phone = window.LapeeetAuth ? LapeeetAuth.normalizePHMobile(phoneRaw) : phoneRaw;
                    if (phoneRaw && !phone) {
                        LapeeetUI.showToast('Enter a valid PH mobile (09xxxxxxxxx)', 'warning');
                        return;
                    }
                    const email = ($('#profileEmail').val() || '').trim().slice(0, 80);
                    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                        LapeeetUI.showToast('Enter a valid email address', 'warning');
                        return;
                    }
                    LapeeetDB.saveProfile({
                        first_name: ($('#profileFirst').val() || '').trim().slice(0, 40),
                        last_name: ($('#profileLast').val() || '').trim().slice(0, 40),
                        email,
                        phone: phone || ''
                    });
                    const display = LapeeetDB.displayName() || 'Guest User';
                    LapeeetUI.updateSidebar({ name: display });
                    LapeeetUI.showToast('Profile saved', 'success');
                    LapeeetUI.navigate('profile');
                } catch (e) { LapeeetUI.showToast('Save failed: ' + (e.message || e), 'danger'); }
            });
        },

        _brandSelectWire(brandSel, otherWrap, otherInput) {
            const sync = () => {
                const v = $(brandSel).val();
                $(otherWrap).toggle(v === '__other');
            };
            $(brandSel).off('change.brandOther').on('change.brandOther', sync);
            sync();
            const resolve = () => {
                const v = $(brandSel).val();
                if (v === '__other') {
                    const custom = ($(otherInput).val() || '').trim().slice(0, 40);
                    return custom || 'Other';
                }
                return v;
            };
            return resolve;
        },

        _bindEbikeScreen() {
            const resolveBrand = this._brandSelectWire('#ebBrand', '#ebBrandOtherWrap', '#ebBrandOther');
            const photoQueue = [];
            const renderPreview = () => {
                const box = $('#ebPhotoPreview');
                if (!box.length) return;
                box.html(photoQueue.map((d, i) =>
                    `<div style="position:relative;width:72px;height:72px">
                        <img src="${d}" style="width:72px;height:72px;object-fit:cover;border-radius:10px;border:1px solid var(--lapeeet-border)">
                        <a href="javascript:;" data-photo-rm="${i}" style="position:absolute;top:-8px;right:-8px;background:#dc3545;color:#fff;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:13px;line-height:1">×</a>
                    </div>`).join(''));
            };
            $('#ebPhotos').off('change').on('change', async (e) => {
                const files = Array.from(e.target.files || []).slice(0, 3 - photoQueue.length);
                for (const f of files) {
                    try {
                        photoQueue.push(await LapeeetDB.processPhoto(f));
                    } catch (err) { LapeeetUI.showToast('Photo skipped: ' + (err.message || err), 'warning'); }
                }
                if ((e.target.files || []).length > files.length) {
                    LapeeetUI.showToast('Max 3 photos per e-bike', 'warning');
                }
                e.target.value = '';
                renderPreview();
            });
            $('#ebPhotoPreview').off('click').on('click', 'a[data-photo-rm]', function (e) {
                e.preventDefault();
                photoQueue.splice(Number($(this).attr('data-photo-rm')), 1);
                renderPreview();
            });
            $('#btnAddEbike').off('click').on('click', () => {
                try {
                    const bike = LapeeetDB.createEbike({
                        brand: resolveBrand(),
                        model: ($('#ebModel').val() || '').trim().slice(0, 40),
                        color: ($('#ebColor').val() || '').trim().slice(0, 24),
                        capacity: $('#ebCapacity').val(),
                        photos: photoQueue.slice(0, 3),
                        is_primary: LapeeetDB.listEbikes().length === 0
                    });
                    LapeeetUI.showToast(`Registered ${bike.brand} ${bike.model}`, 'success');
                    LapeeetUI.navigate('ebike');
                } catch (e2) { LapeeetUI.showToast('Register failed: ' + (e2.message || e2), 'danger'); }
            });
            $('#screen-root').off('click.ebikeRow').on('click.ebikeRow', 'a[data-ebike-primary], a[data-ebike-del]', (e) => {
                e.preventDefault();
                const $a = $(e.target).closest('a');
                try {
                    if ($a.is('[data-ebike-primary]')) {
                        LapeeetDB.setPrimaryEbike(Number($a.attr('data-ebike-primary')));
                        LapeeetUI.showToast('Primary e-bike updated', 'success');
                    } else {
                        LapeeetDB.deleteEbike(Number($a.attr('data-ebike-del')));
                        LapeeetUI.showToast('E-bike removed', 'info');
                    }
                    LapeeetUI.navigate('ebike');
                } catch (err) { LapeeetUI.showToast('Update failed: ' + (err.message || err), 'danger'); }
            });
        },

        _bindOnboardingScreen() {
            let step = 1;
            // Passengers skip the e-bike step: RIDER [1,2,4,5], DRIVER [1,2,3,4,5].
            const flowSteps = () => ($('#obRole').val() === 'DRIVER') ? [1, 2, 3, 4, 5] : [1, 2, 4, 5];
            const goStep = (s) => { step = s; show(); };
            const resolveBrand = this._brandSelectWire('#obBrand', '#obBrandOtherWrap', '#obBrandOther');
            // Role cards (step 1): sync hidden #obRole + visual states; pre-fill from boot role.
            const syncRoleCards = (role) => {
                const r = (role === 'DRIVER') ? 'DRIVER' : 'RIDER';
                $('#obRole').val(r);
                $('#rolePickGroup .role-card').each(function () {
                    const same = $(this).attr('data-role') === r;
                    $(this).toggleClass('is-selected', same).attr('aria-checked', same ? 'true' : 'false');
                });
            };
            const pickRole = (role) => {
                syncRoleCards(role);
                // Role change reshapes the flow: leaving step 3 as a rider
                // moves forward to step 4; everything else just re-renders.
                if (step === 3 && role !== 'DRIVER') step = 4;
                show();
            };
            syncRoleCards(this.role);
            $('#rolePickGroup').off('click.rolePick').on('click.rolePick', '.role-card', function () {
                pickRole($(this).attr('data-role'));
            });
            $('#rolePickGroup').off('keydown.rolePick').on('keydown.rolePick', '.role-card', function (e) {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickRole($(this).attr('data-role')); }
            });
            // Restore in-progress passkey state label.
            const refreshPasskeyLabel = () => {
                try {
                    const pk = LapeeetDB.getPasskey();
                    if (pk && pk !== 'SKIP') {
                        $('#obPasskeyState').text('Passkey ready on this device.');
                        $('#obPasskeyBtn').prop('disabled', true);
                    } else if (pk === 'SKIP') {
                        $('#obPasskeyState').text('Skipped — you can add one later from Settings.');
                    } else if (!window.LapeeetAuth || LapeeetAuth.supportReason() !== 'ok') {
                        $('#obPasskeyState').text(LapeeetAuth ? LapeeetAuth.supportReason() : 'Passkeys unavailable here.');
                    }
                } catch (e) {}
            };
            const show = () => {
                const flow = flowSteps();
                if (flow.indexOf(step) === -1) step = flow[0];
                const pos = flow.indexOf(step);
                $('.ob-step').each(function () {
                    $(this).toggle(Number($(this).attr('data-step')) === step);
                });
                $('#obProgress').text(`Step ${pos + 1} of ${flow.length}`);
                $('#obDots').html(flow.map((s, i) =>
                    `<span class="${i < pos ? 'done' : (i === pos ? 'now' : '')}"></span>`).join(''));
                $('#obBack').prop('disabled', pos === 0);
                $('#obNext').text(pos === flow.length - 1 ? 'Finish Setup' : 'Next');
                if (pos === flow.length - 1) {
                    const role = $('#obRole').val();
                    const obFullName = () => {
                        const fn = ($('#obFirst').val() || '').trim();
                        const ln = ($('#obLast').val() || '').trim();
                        return (fn + ' ' + ln).trim() || 'Guest User';
                    };
                    const name = obFullName();
                    const brand = role === 'DRIVER' ? resolveBrand() : '—';
                    const model = role === 'DRIVER' ? (($('#obModel').val() || '').trim() || '—') : '—';
                    $('#obReview').html(
                        `Role: <strong>${role}</strong><br>Name: <strong>${$('<div>').text(name).html()}</strong>` +
                        (role === 'DRIVER' ? `<br>E-bike: <strong>${$('<div>').text(brand + ' ' + model).html()}</strong>` : ''));
                }
            };
            $('#obBack').off('click').on('click', () => {
                const flow = flowSteps();
                const pos = flow.indexOf(step);
                if (pos > 0) goStep(flow[pos - 1]);
            });
            const validPhoneOrWarn = () => {
                const norm = window.LapeeetAuth ? LapeeetAuth.normalizePHMobile($('#obPhone').val()) : null;
                if (!norm) {
                    LapeeetUI.showToast('Enter a valid PH mobile (09xxxxxxxxx)', 'warning');
                    return null;
                }
                return norm;
            };
            $('#obNext').off('click').on('click', () => {
                // Leaving step 2 requires a valid mobile number (registration gate).
                if (step === 2 && !validPhoneOrWarn()) return;
                const flow = flowSteps();
                const pos = flow.indexOf(step);
                if (pos < flow.length - 1) {
                    const next = flow[pos + 1];
                    if (next === 4) refreshPasskeyLabel();
                    goStep(next);
                    return;
                }
                // Finish: persist role + profile (+ first e-bike for drivers).
                try {
                    const phone = validPhoneOrWarn();
                    if (!phone) { step = 2; show(); return; }
                    const first = ($('#obFirst').val() || '').trim().slice(0, 40);
                    const last = ($('#obLast').val() || '').trim().slice(0, 40);
                    if (!first) {
                        LapeeetUI.showToast('Enter your first name', 'warning');
                        step = 2; show(); return;
                    }
                    const role = $('#obRole').val() === 'DRIVER' ? 'DRIVER' : 'RIDER';
                    if (role !== this.role) LapeeetUI.toggleRole();
                    try { localStorage.setItem('lapeeet::role', this.role); } catch (e) {}
                    this._syncModeUrl();
                    const saved = LapeeetDB.saveProfile({
                        first_name: first,
                        last_name: last,
                        phone
                    });
                    if (role === 'DRIVER') {
                        const model = ($('#obModel').val() || '').trim();
                        if (model && !LapeeetDB.listEbikes().length) {
                            LapeeetDB.createEbike({
                                brand: resolveBrand(), model,
                                capacity: $('#obCapacity').val(), photos: [], is_primary: true
                            });
                        }
                    }
                    LapeeetUI.updateSidebar({ name: LapeeetDB.displayName() || 'Guest User', role: this.role });
                    LapeeetUI.showToast('Setup complete — welcome!', 'success');
                    LapeeetUI.navigate('home');
                } catch (e) { LapeeetUI.showToast('Setup failed: ' + (e.message || e), 'danger'); }
            });
            $('#obPasskeyBtn').off('click').on('click', async () => {
                const btn = $('#obPasskeyBtn');
                btn.prop('disabled', true);
                try {
                    const fn = ($('#obFirst').val() || '').trim().slice(0, 40);
                    const ln = ($('#obLast').val() || '').trim().slice(0, 40);
                    const name = ((fn + ' ' + ln).trim() || 'Lapeeet User').slice(0, 60);
                    const phone = LapeeetAuth.normalizePHMobile($('#obPhone').val()) || '';
                    const rec = await LapeeetAuth.registerPasskey({ name, phone });
                    LapeeetDB.setPasskey(rec);
                    $('#obPasskeyState').text('Passkey created on this device.');
                    LapeeetUI.showToast('Passkey created', 'success');
                } catch (e) {
                    $('#obPasskeyState').text('Could not create passkey: ' + LapeeetAuth.friendlyError(e, 'create'));
                    btn.prop('disabled', false);
                }
            });
            $('#obPasskeySkip').off('click').on('click', () => {
                try { LapeeetDB.setPasskey('SKIP'); } catch (e) {}
                $('#obPasskeyState').text('Skipped — you can add one later from Settings.');
                step++; show();
            });
            $('#obPinUse').off('click').on('click', () => {
                $('#obPinSetup').toggle();
            });
            $('#obPinSave').off('click').on('click', async () => {
                const p1 = ($('#obPin').val() || '').trim();
                const p2 = ($('#obPin2').val() || '').trim();
                if (!LapeeetAuth.isValidPinFormat(p1)) {
                    $('#obPinState').text('PIN must be 4–12 digits.');
                    return;
                }
                if (p1 !== p2) {
                    $('#obPinState').text('PINs do not match — try again.');
                    return;
                }
                try {
                    LapeeetDB.setPin(await LapeeetAuth.hashPin(p1));
                    $('#obPinState').text('Device PIN saved on this device.');
                    LapeeetUI.showToast('Device PIN saved', 'success');
                } catch (e) {
                    $('#obPinState').text('Could not save PIN: ' + (e.message || e));
                }
            });
            show();
        },

        _bindAutocomplete(kind, inputId, suggestId) {
            const self = this;
            let debounce = null;
            const $input = $('#' + inputId);
            const $box = $('#' + suggestId);
            $input.off('input keyup focus').on('input keyup focus', function () {
                const q = $(this).val();
                if (debounce) clearTimeout(debounce);
                if (!q || q.length < 3) { $box.empty(); return; }
                debounce = setTimeout(async () => {
                    const rows = await LapeeetMap.searchAddress(q);
                    if (!rows || !rows.length) {
                        $box.html('<div class="small text-muted p-1">No results — tap map to set ' + kind + '</div>');
                        return;
                    }
                    const html = rows.slice(0, 5).map(r => `
                        <a href="javascript:;" class="list-group-item list-group-item-action p-2 small d-block"
                           data-lat="${r.lat}" data-lng="${r.lng}" data-addr="${self._escapeAttr(r.address)}">
                            ${self._truncate(r.address, 120)}
                        </a>`).join('');
                    $box.html('<div class="list-group">' + html + '</div>');
                    $box.find('a[data-lat]').off('click').on('click', function () {
                        const lat = parseFloat($(this).attr('data-lat'));
                        const lng = parseFloat($(this).attr('data-lng'));
                        const addr = $(this).attr('data-addr') || '';
                        if (kind === 'pickup') {
                            LapeeetMap.setPickup(lat, lng, true);
                            $('#pickupInput').val(self._truncate(addr, 120));
                        } else {
                            LapeeetMap.setDropoff(lat, lng, true);
                            $('#dropoffInput').val(self._truncate(addr, 120));
                        }
                        $box.empty();
                    });
                }, 380);
            });
        },

        _truncate(s, n) {
            if (!s) return '';
            s = String(s);
            return s.length <= n ? s : s.slice(0, n - 1) + '…';
        },

        _escapeAttr(s) {
            return String(s == null ? '' : s)
                .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        },

        _calcFare(km, min) {
            // Philippine Peso (PHP / ₱) official fare constants (Phase 1 mock)
            const base = 30.00;     // ₱30  base flag-down
            const perKm = 12.00;    // ₱12  per kilometer
            const perMin = 2.00;    // ₱2   per minute (traffic / wait surcharge)
            const amount = base + (km * perKm) + (min * perMin);
            return (window.LapeeetUI && LapeeetUI.formatCurrency)
                ? LapeeetUI.formatCurrency(amount)
                : '₱' + amount.toFixed(2);
        }
    };

    global.LapeeetApp = LapeeetApp;

    if (global.jQuery) {
        global.jQuery(() => LapeeetApp.start());
    } else {
        global.addEventListener('DOMContentLoaded', () => LapeeetApp.start());
    }
})(window);
