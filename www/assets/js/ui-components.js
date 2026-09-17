/* =============================================================
   Lapeeet — UI Components Layer (SPA screen rendering)
   All screen templates use the EXACT mobilekit-25 class names from the UI kit.
   - Sections: <div class="section mt-2"> (or .full for no-padding)
   - Sections titles: <div class="section-title"> (when inside section.full)
   - Cards: Standard <div class="card"> <div class="card-body">
   - Buttons: btn-primary btn-block btn-lg shadowed / rounded / square
   - Forms: form-group boxed → input-wrapper → label.label → form-control
   - Listviews: listview image-listview / flush / transparent / no-line
   ============================================================= */

(function (global) {
    'use strict';

    const UI_VERSION = '0.0.1-uikit';

    const EBIKE_BRANDS = {
        "22Kymco": ["Flow", "iFlow"],
        "NWOW": [], "YADEA": [], "HATASU": [], "TailG": [],
        "VinFast": [], "NIU": [], "Segway": [], "Xiaomi": [],
        "AIMA": [], "Yamaha": [], "Honda": []
    };
    const SCREENS = Object.freeze({
        HOME:       'home',
        MAP:        'map',
        TRIPS:      'trips',
        MESSAGES:   'messages',
        PROFILE:    'profile',
        ONBOARDING: 'onboarding',
        EBIKE:      'ebike',
        DATA:       'data',
        SETTINGS:   'settings'
    });

    const LapeeetUI = {
        version: UI_VERSION,
        SCREENS,
        currentScreen: null,
        currentRole: 'RIDER',
        EBIKE_BRANDS,
        EBIKE_CAPACITIES: [1, 2, 3, 6, 8, 10, 12, 15],

        onRoleChange: null,
        onScreenChange: null,

        init(opts = {}) {
            console.debug('[UI-COMPONENTS] init()');
            this.currentRole = opts.initialRole || 'RIDER';
            this.onRoleChange = opts.onRoleChange || null;
            this.onScreenChange = opts.onScreenChange || null;

            $('#appBottomMenu').on('click', 'a.item', (e) => {
                const s = $(e.currentTarget).data('screen');
                if (s) this.navigate(s);
            });

            $('#sidebarPanel').on('click', 'a.item', (e) => {
                const s = $(e.currentTarget).data('screen');
                if (s) { $('#sidebarPanel').modal('hide'); this.navigate(s); }
            });

            $('#btnRoleToggle').on('click', () => this.toggleRole());

            this.navigate(SCREENS.HOME);
        },

        navigate(screenId) {
            console.debug('[UI-COMPONENTS] navigate →', screenId);
            $('#appBottomMenu a.item').removeClass('active');
            $(`#appBottomMenu a.item[data-screen="${screenId}"]`).addClass('active');
            this.currentScreen = screenId;
            $('#screen-root').html(this._renderScreen(screenId));
            this._updateScreenTitle(screenId);
            this._bindScreenEvents(screenId);
            if (this.onScreenChange) this.onScreenChange(screenId);
        },

        _updateScreenTitle(/*id*/) {
            // Header always shows static lapeeet_logotext.png image (see index.html #screenTitle)
            // Do NOT overwrite with text — brand logo is permanently placed.
        },

        _renderScreen(id) {
            switch (id) {
                case SCREENS.HOME:       return this._screenHome();
                case SCREENS.MAP:        return this._screenMap();
                case SCREENS.TRIPS:      return this._screenTrips();
                case SCREENS.MESSAGES:   return this._screenMessages();
                case SCREENS.PROFILE:    return this._screenProfile();
                case SCREENS.ONBOARDING: return this._screenOnboarding();
                case SCREENS.EBIKE:      return this._screenEbike();
                case SCREENS.DATA:       return this._screenData();
                case SCREENS.SETTINGS:   return this._screenSettings();
                default:                 return this._screenHome();
            }
        },

        _screenHome() {
            const isRider = this.currentRole === 'RIDER';
            const actions = isRider
                ? [
                    { icon: 'map-outline', color: 'primary', title: 'Book a Ride', sub: 'Pickup, dropoff, go.', screen: 'map' },
                    { icon: 'reorder-four-outline', color: 'warning', title: 'My Trips', sub: 'Ride history & receipts', screen: 'trips' },
                    { icon: 'chatbubble-ellipses-outline', color: 'info', title: 'Messages', sub: 'Driver & rider chats', screen: 'messages' },
                    { icon: 'person-outline', color: 'success', title: 'My Profile', sub: 'Settings & saved places', screen: 'profile' }
                  ]
                : [
                    { icon: 'map-outline', color: 'primary', title: 'Ride Requests', sub: 'Nearby riders seeking pickup', screen: 'map' },
                    { icon: 'bicycle-outline', color: 'success', title: 'My E-Bikes', sub: 'Fleet, capacity, battery', screen: 'ebike' },
                    { icon: 'reorder-four-outline', color: 'warning', title: 'Drives', sub: 'Trip history & earnings', screen: 'trips' },
                    { icon: 'chatbubble-ellipses-outline', color: 'info', title: 'Messages', sub: 'Rider support chat', screen: 'messages' }
                  ];
            const statusRows = [
                { id: 'p2pStatus',  icon: 'globe-outline',       label: 'P2P Mesh',         initial: 'Initialising...' },
                { id: 'dbStatus',   icon: 'server-outline',      label: 'Tenant DB (sql.js)', initial: 'Initialising...' },
                { id: 'mapStatus',  icon: 'map-outline',         label: 'Map Ready',         initial: 'Initialising...' },
                { id: 'peerId',     icon: 'fingerprint-outline', label: 'Peer ID',           initial: 'connecting…', plain: true },
                { id: 'keyStatus',  icon: 'key-outline',         label: 'Signing Key',       initial: '—' },
                { id: 'gitStatus',  icon: 'git-branch-outline',  label: 'Git (v1.25.0)',     initial: 'Booting…' }
            ];
            return `
            <!-- ====== HOME SCREEN ====== -->
            <div class="home-screen pb-3">

                <!-- Hero greeting card (white) -->
                <div class="card card-white card-hero mb-3">
                    <div class="card-body">
                        <div class="d-flex align-items-start justify-content-between">
                            <div>
                                <span class="badge badge-${isRider ? 'primary' : 'success'} role-badge role-${isRider ? 'rider' : 'driver'}">
                                    <ion-icon name="${isRider ? 'person-outline' : 'bicycle-outline'}"></ion-icon>
                                    ${isRider ? 'Rider Mode' : 'Driver Mode'}
                                </span>
                                <h2 class="home-title mt-2 mb-1 font-weight-bold">
                                    ${isRider ? 'Where to today?' : 'Ready to drive?'}
                                </h2>
                                <p class="home-subtitle text-muted mb-0">
                                    60 km short-trip range · Peer to peer · Your data stays with you
                                </p>
                            </div>
                            <div class="pl-2">
                                <span class="home-greet-icon d-inline-flex align-items-center justify-content-center rounded">
                                    <ion-icon name="${isRider ? 'navigate-outline' : 'car-sport-outline'}"></ion-icon>
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Quick Actions (white card wrapper) -->
                <div class="card card-white mb-3">
                    <div class="card-body">
                        <div class="home-section-head mb-3">
                            <h6 class="home-section-title">Quick Actions</h6>
                            <a href="javascript:;" class="home-section-link text-primary" onclick="LapeeetUI.navigate('${isRider ? 'settings' : 'data'}')">
                                More <ion-icon name="chevron-forward-outline"></ion-icon>
                            </a>
                        </div>
                        <div class="row home-actions-grid">
                            ${actions.map(a => `
                                <div class="col-6">
                                    <div class="card card-action" onclick="LapeeetUI.navigate('${a.screen}')">
                                        <div class="card-body text-center">
                                            <span class="action-icon bg-${a.color} text-white d-inline-flex align-items-center justify-content-center rounded mb-2">
                                                <ion-icon name="${a.icon}"></ion-icon>
                                            </span>
                                            <h5 class="action-title font-weight-bold mb-0">${a.title}</h5>
                                            <p class="action-sub text-muted mt-1 mb-0">${a.sub}</p>
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>

                <!-- Status / System Indicators (white card) -->
                <div class="card card-white mb-3">
                    <div class="card-body">
                        <div class="home-section-head mb-3">
                            <h6 class="home-section-title">System Status</h6>
                            <span class="text-muted small-12">Phase 1 live · <span class="text-success">OK</span></span>
                        </div>
                        <ul class="listview flush transparent simple-listview home-status-list">
                            ${statusRows.map(r => `
                                <li class="home-status-row">
                                    <div class="d-flex align-items-center w-100">
                                        <span class="status-icon text-muted mr-2">
                                            <ion-icon name="${r.icon}"></ion-icon>
                                        </span>
                                        <span class="status-label flex-1">${r.label}</span>
                                        <span id="${r.id}" class="status-value font-weight-normal ${r.plain ? 'nowrap' : ''}">${r.initial}</span>
                                    </div>
                                </li>
                            `).join('')}
                        </ul>
                    </div>
                </div>

                <!-- Fare info banner (white card) -->
                <div class="card card-white mb-2">
                    <div class="card-body">
                        <div class="d-flex align-items-center">
                            <span class="fare-icon d-inline-flex align-items-center justify-content-center rounded mr-3">
                                <ion-icon name="cash-outline"></ion-icon>
                            </span>
                            <div class="flex-1">
                                <h6 class="font-weight-bold mb-1">Official Fare (PHP ₱)</h6>
                                <p class="text-muted small mb-0">
                                    <strong>₱30.00</strong> flag-down ·
                                    <strong>₱12.00</strong>/km ·
                                    <strong>₱2.00</strong>/min
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

            </div>`;
        },

        _screenMap() {
            return `
            <!-- Map visual block -->
            <div class="section full mt-2">
                <div class="card card-map">
                    <div class="map-container card-img-top">
                        <div id="map"></div>
                    </div>
                    <div class="card-footer pt-2 pb-2 px-3 d-flex justify-content-between align-items-center">
                        <button id="btnLocate" class="btn btn-sm btn-outline-primary mr-1">
                            <ion-icon name="locate-outline"></ion-icon> My Location
                        </button>
                        <button id="btnClearPins" class="btn btn-sm btn-outline-secondary ml-1">
                            <ion-icon name="refresh-outline"></ion-icon> Reset Pins
                        </button>
                    </div>
                </div>
            </div>

            <!-- Booking form (boxed inputs like component-inputs.html) -->
            <div class="section full mt-2 mb-2">
                <div class="section-title">Ride Booking (Phase 1)</div>
                <div class="wide-block pt-3 pb-3 pl-3 pr-3 booking-form-block">
                    <form onsubmit="event.preventDefault();">
                        <div class="form-group boxed">
                            <div class="input-wrapper">
                                <label class="label" for="pickupInput">
                                    <ion-icon name="navigate-outline" style="color:#7fe3b0"></ion-icon>
                                    Pickup Location
                                </label>
                                <input type="text" class="form-control" id="pickupInput"
                                       placeholder="Tap on map or search...">
                                <i class="clear-input"><ion-icon name="close-circle"></ion-icon></i>
                            </div>
                            <div id="pickupSuggest" class="mt-1" style="max-height: 160px; overflow: auto;"></div>
                        </div>

                        <div class="form-group boxed">
                            <div class="input-wrapper">
                                <label class="label" for="dropoffInput">
                                    <ion-icon name="locate" style="color:#ff9aa2"></ion-icon>
                                    Dropoff Location
                                </label>
                                <input type="text" class="form-control" id="dropoffInput"
                                       placeholder="Tap on map or search...">
                                <i class="clear-input"><ion-icon name="close-circle"></ion-icon></i>
                            </div>
                            <div id="dropoffSuggest" class="mt-1" style="max-height: 160px; overflow: auto;"></div>
                        </div>

                        <div class="form-group mt-2">
                            <label class="label">
                                <ion-icon name="people-outline"></ion-icon>
                                Seats (Passenger Capacity)
                            </label>
                            <div class="capacity-dropdown" id="capacityGroup" data-whitelist="1,2,3,6,8,10,12,15">
                                <button type="button" class="capacity-dropdown__button" aria-haspopup="listbox" aria-expanded="false">
                                    <span class="capacity-dropdown__button-left">
                                        <span class="capacity-pill" data-capacity="1">
                                            <ion-icon name="person"></ion-icon>
                                            <strong id="capacityValueLabel">1</strong>
                                        </span>
                                        <span class="capacity-dropdown__meta">
                                            <span class="capacity-dropdown__sel-title" id="capacityTitleLabel">1 Passenger</span>
                                            <span class="capacity-dropdown__sel-sub">Solo e-bike / scooter</span>
                                        </span>
                                    </span>
                                    <span class="capacity-dropdown__chevron">
                                        <ion-icon name="chevron-down-outline"></ion-icon>
                                    </span>
                                </button>
                                <input type="hidden" name="capacity" id="capacityValue" value="1">
                                <ul class="capacity-dropdown__list" role="listbox" aria-hidden="true">
                                    <li role="option" data-value="1" data-title="1 Passenger" data-sub="Solo e-bike / scooter" data-selected="true">
                                        <span class="capacity-pill"><ion-icon name="person"></ion-icon><strong>1</strong></span>
                                        <span class="capacity-dropdown__meta">
                                            <span class="capacity-dropdown__sel-title">1 Passenger</span>
                                            <span class="capacity-dropdown__sel-sub">Solo e-bike / scooter</span>
                                        </span>
                                        <ion-icon name="checkmark" class="capacity-dropdown__check"></ion-icon>
                                    </li>
                                    <li role="option" data-value="2" data-title="2 Passengers" data-sub="Couple / two-up e-bike">
                                        <span class="capacity-pill"><ion-icon name="people"></ion-icon><strong>2</strong></span>
                                        <span class="capacity-dropdown__meta">
                                            <span class="capacity-dropdown__sel-title">2 Passengers</span>
                                            <span class="capacity-dropdown__sel-sub">Couple / two-up e-bike</span>
                                        </span>
                                        <ion-icon name="checkmark" class="capacity-dropdown__check"></ion-icon>
                                    </li>
                                    <li role="option" data-value="3" data-title="3 Passengers" data-sub="Small family + luggage">
                                        <span class="capacity-pill"><ion-icon name="people"></ion-icon><strong>3</strong></span>
                                        <span class="capacity-dropdown__meta">
                                            <span class="capacity-dropdown__sel-title">3 Passengers</span>
                                            <span class="capacity-dropdown__sel-sub">Small family + luggage</span>
                                        </span>
                                        <ion-icon name="checkmark" class="capacity-dropdown__check"></ion-icon>
                                    </li>
                                    <li role="option" data-value="6" data-title="6 Passengers" data-sub="E-trike · small group">
                                        <span class="capacity-pill"><ion-icon name="people-circle"></ion-icon><strong>6</strong></span>
                                        <span class="capacity-dropdown__meta">
                                            <span class="capacity-dropdown__sel-title">6 Passengers</span>
                                            <span class="capacity-dropdown__sel-sub">E-trike · small group</span>
                                        </span>
                                        <ion-icon name="checkmark" class="capacity-dropdown__check"></ion-icon>
                                    </li>
                                    <li role="option" data-value="8" data-title="8 Passengers" data-sub="Standard e-jeepney">
                                        <span class="capacity-pill"><ion-icon name="people-circle"></ion-icon><strong>8</strong></span>
                                        <span class="capacity-dropdown__meta">
                                            <span class="capacity-dropdown__sel-title">8 Passengers</span>
                                            <span class="capacity-dropdown__sel-sub">Standard e-jeepney</span>
                                        </span>
                                        <ion-icon name="checkmark" class="capacity-dropdown__check"></ion-icon>
                                    </li>
                                    <li role="option" data-value="10" data-title="10 Passengers" data-sub="Large e-jeepney / van">
                                        <span class="capacity-pill"><ion-icon name="bus-outline"></ion-icon><strong>10</strong></span>
                                        <span class="capacity-dropdown__meta">
                                            <span class="capacity-dropdown__sel-title">10 Passengers</span>
                                            <span class="capacity-dropdown__sel-sub">Large e-jeepney / van</span>
                                        </span>
                                        <ion-icon name="checkmark" class="capacity-dropdown__check"></ion-icon>
                                    </li>
                                    <li role="option" data-value="12" data-title="12 Passengers" data-sub="Premium e-shuttle">
                                        <span class="capacity-pill"><ion-icon name="bus-outline"></ion-icon><strong>12</strong></span>
                                        <span class="capacity-dropdown__meta">
                                            <span class="capacity-dropdown__sel-title">12 Passengers</span>
                                            <span class="capacity-dropdown__sel-sub">Premium e-shuttle</span>
                                        </span>
                                        <ion-icon name="checkmark" class="capacity-dropdown__check"></ion-icon>
                                    </li>
                                    <li role="option" data-value="15" data-title="15 Passengers" data-sub="Max e-coach / group tour">
                                        <span class="capacity-pill"><ion-icon name="bus"></ion-icon><strong>15</strong></span>
                                        <span class="capacity-dropdown__meta">
                                            <span class="capacity-dropdown__sel-title">15 Passengers</span>
                                            <span class="capacity-dropdown__sel-sub">Max e-coach / group tour</span>
                                        </span>
                                        <ion-icon name="checkmark" class="capacity-dropdown__check"></ion-icon>
                                    </li>
                                </ul>
                            </div>
                            <small class="form-text text-muted mt-2">Only whitelisted capacities supported: 1, 2, 3, 6, 8, 10, 12, 15</small>
                        </div>
                    </form>

                    <ul class="listview flush transparent simple-listview mt-3 mb-3 ride-summary">
                        <li><ion-icon name="resize-outline" style="color:#8fa1be;margin-right:6px"></ion-icon>Distance: <strong id="distKm">—</strong>
                            <span class="badge badge-success ml-1 radius-indicator radius-ok" id="distBadge">Within range</span>
                        </li>
                        <li><ion-icon name="cash-outline" style="color:#7fe3b0;margin-right:6px"></ion-icon>Estimated Fare: <strong id="fareEst">—</strong></li>
                        <li><ion-icon name="time-outline" style="color:#ffc96a;margin-right:6px"></ion-icon>ETA: <strong id="etaMin">—</strong></li>
                    </ul>

                    <div class="form-button-group">
                        <button id="btnRequestRide" type="button"
                                class="btn btn-primary btn-block btn-lg shadowed" disabled>
                            <ion-icon name="car-sport-outline"></ion-icon>
                            Request Ride
                        </button>
                    </div>

                    <div class="text-center mt-3">
                        <a href="javascript:;" id="btnOpenOm" class="text-primary small">
                            <ion-icon name="navigate-outline"></ion-icon>
                            Open navigation in Organic Maps
                        </a>
                    </div>
                </div>
            </div>

            <!-- Active ride panel (populated when a ride is matched) -->
            <div class="section full mt-2 mb-2" id="activeRideSection" style="display:none">
                <div class="section-title">Active Ride (P2P)</div>
                <div class="wide-block pt-3 pb-3 pl-3 pr-3" id="activeRideBody"></div>
            </div>

            <!-- Driver-only: incoming ride requests from the mesh -->
            <div class="section full mt-2 mb-2" id="driverRequestsSection" style="display:none">
                <div class="section-title">Nearby Requests (Drivers)</div>
                <div class="wide-block pt-2 pb-2 pl-3 pr-3">
                    <ul class="listview flush transparent simple-listview" id="driverRequestsList">
                        <li class="small text-muted">Listening for RIDE_REQUEST broadcasts…</li>
                    </ul>
                </div>
            </div>`;
        },

        /* ---------- Placeholder screens (official dark card pattern w/ gradient header strip) ---------- */

        _placeholderCard(title, body, wrapSection = true) {
            const html = `
            <div class="card">
                <div class="card-body" style="padding:0;">
                    ${title ? `<div style="padding:18px 18px 8px">
                        <h5 class="card-title font-weight-bold mb-1" style="font-size:17px;">${title}</h5>
                        <div style="height:3px;border-radius:2px;width:56px;background:linear-gradient(90deg,var(--lapeeet-primary),#5aa1ff);margin-bottom:10px"></div>
                        <p class="card-text" style="color:var(--lapeeet-text-lo);margin:0;">${body}</p>
                    </div>` : `<div style="padding:20px 18px">
                        <div style="height:3px;border-radius:2px;width:56px;background:linear-gradient(90deg,var(--lapeeet-primary),#5aa1ff);margin-bottom:10px"></div>
                        <p class="card-text" style="color:var(--lapeeet-text-lo);margin:0;">${body}</p>
                    </div>`}
                </div>
            </div>`;
            return wrapSection
                ? `<div class="section mt-2">${html}</div>`
                : `<div class="section mt-2">${html}</div>`;
        },

        _screenTrips() {
            let body;
            try {
                if (window.LapeeetDB && LapeeetDB.initialized) {
                    const rides = LapeeetDB.listRides(this.currentRole, 50);
                    if (!rides.length) {
                        body = '<li><div class="item"><div class="in"><div>No trips yet — book your first ride from the Map tab.</div></div></div></li>';
                    } else {
                        body = rides.map(r => `
                            <li><div class="item"><div class="in"><div>
                                <div style="color:var(--lapeeet-text-hi);font-weight:600;">${(Number(r.distance_km) || 0).toFixed(1)} km · ${this.formatCurrency(r.fare_php || 0)}</div>
                                <span class="text-muted">${this._escapeHtml(r.status || '')} · ${new Date(r.created_at || Date.now()).toLocaleString()}</span>
                            </div></div></div></li>`).join('');
                    }
                } else {
                    body = '<li><div class="item"><div class="in"><div>Tenant DB still loading…</div></div></div></li>';
                }
            } catch (e) {
                body = '<li><div class="item"><div class="in"><div>Could not load trips.</div></div></div></li>';
            }
            return `
            <div class="section mt-2">
                <div class="card">
                    <div class="card-body">
                        <h6 class="card-subtitle">${this.currentRole === 'RIDER' ? 'Rider' : 'Driver'} Tenant</h6>
                        <h5 class="card-title">My Trips</h5>
                    </div>
                </div>
            </div>
            <div class="section mt-2">
                <div class="card">
                    <ul class="listview image-listview flush">${body}</ul>
                </div>
            </div>`;
        },
        _screenMessages() {
            const app = global.LapeeetApp || {};
            const peers = (typeof app._chatPeers === 'function' && app._chatPeers()) || [];
            const sel = app._chatSelected || null;
            const thread = (typeof app._chatThread === 'function' && app._chatThread(sel)) || [];
            const peerPills = peers.length ? peers.map(p => `
                <a href="javascript:;" data-chat-peer="${this._escapeAttr(p.id)}"
                   class="badge ${p.id === sel ? 'badge-primary' : 'badge-secondary'} mr-1 mb-1" style="font-size:12px">
                    ${this._escapeHtml(p.label || (p.id || '').slice(0, 8))}${p.unread ? ' · ' + p.unread : ''}
                </a>`).join('')
                : '<span class="small text-muted">No peers yet — match a ride first, or wait for mesh peers.</span>';
            const msgs = thread.length ? thread.map(m => `
                <div class="mb-2 ${m.mine ? 'text-right' : 'text-left'}">
                    <span class="badge ${m.mine ? 'badge-primary' : 'badge-secondary'}" style="font-size:13px;font-weight:400;white-space:normal;text-align:left;max-width:100%;display:inline-block">${this._escapeHtml(m.text)}</span>
                    <div class="small text-muted" style="font-size:10px">${new Date(m.ts).toLocaleTimeString()}</div>
                </div>`).join('')
                : '<p class="small text-muted">No messages yet.</p>';
            return `
            <div class="section mt-2">
                <div class="card">
                    <div class="card-body">
                        <h6 class="card-subtitle">End-to-end via mesh</h6>
                        <h5 class="card-title">Messages</h5>
                        <div>${peerPills}</div>
                    </div>
                </div>
            </div>
            <div class="section full mt-2 mb-2">
                <div class="wide-block pt-3 pb-3 pl-3 pr-3">
                    <div id="chatThread" style="max-height:300px;overflow-y:auto" class="mb-2">${msgs}</div>
                    <form onsubmit="event.preventDefault();">
                        <div class="form-group boxed"><div class="input-wrapper">
                            <input type="text" class="form-control" id="chatInput"
                                placeholder="${sel ? 'Message peer…' : 'Select a peer first…'}" ${sel ? '' : 'disabled'} maxlength="500">
                        </div></div>
                        <div class="form-button-group">
                            <button id="btnChatSend" type="button" class="btn btn-primary btn-block shadowed" ${sel ? '' : 'disabled'}>
                                Send via P2P
                            </button>
                        </div>
                    </form>
                </div>
            </div>`;
        },
        _screenProfile() {
            let stats = { rides: 0, km: 0, money: 0 };
            let prof = { name: 'Guest User', phone: '' };
            try {
                if (window.LapeeetDB && LapeeetDB.initialized) {
                    prof = Object.assign(prof, LapeeetDB.getProfile());
                    const rides = LapeeetDB.listRides(this.currentRole, 500);
                    stats.rides = rides.length;
                    rides.forEach(r => {
                        stats.km += Number(r.distance_km) || 0;
                        stats.money += Number(r.fare_php) || 0;
                    });
                }
            } catch (e) { /* show zeros */ }
            return `
            <div class="section mt-2">
                <div class="profile-head">
                    <div class="avatar">
                        <img src="assets/img/icon.svg" alt="avatar" class="imaged w64 rounded">
                    </div>
                    <div class="in">
                        <h3 class="name">${this._escapeHtml(prof.name || 'Guest User')}</h3>
                        <h5 class="subtext">${this.currentRole === 'RIDER' ? 'Rider' : 'E-Bike Driver'} Mode</h5>
                        <span class="role-badge ${this.currentRole === 'RIDER' ? 'role-rider' : 'role-driver'}" style="margin-top:8px;">
                            <ion-icon name="${this.currentRole === 'RIDER' ? 'person-outline' : 'bicycle-outline'}"></ion-icon>
                            ${this.currentRole === 'RIDER' ? 'Rider Account' : 'Driver Tenant'}
                        </span>
                    </div>
                </div>
            </div>
            <div class="section full mt-2">
                <div class="profile-stats pl-2 pr-2 mt-3 mb-3">
                    <a href="#" class="item"><strong>${stats.rides}</strong>rides</a>
                    <a href="#" class="item"><strong>5.0</strong>rating</a>
                    <a href="#" class="item"><strong>${Math.round(stats.km)}</strong>km</a>
                    <a href="#" class="item"><strong>${this.formatCurrency(stats.money)}</strong>${this.currentRole === 'RIDER' ? 'spent' : 'earned'}</a>
                </div>
            </div>
            <div class="section full mt-2 mb-2">
                <div class="section-title">Edit Profile</div>
                <div class="wide-block pt-3 pb-3 pl-3 pr-3">
                    <form onsubmit="event.preventDefault();">
                        <div class="form-group boxed">
                            <div class="input-wrapper">
                                <label class="label" for="profileName">Display name</label>
                                <input type="text" class="form-control" id="profileName"
                                    value="${this._escapeAttr(prof.name || '')}" placeholder="Your name" maxlength="60">
                            </div>
                        </div>
                        <div class="form-group boxed">
                            <div class="input-wrapper">
                                <label class="label" for="profilePhone">Phone (shared only after accept)</label>
                                <input type="tel" class="form-control" id="profilePhone"
                                    value="${this._escapeAttr(prof.phone || '')}" placeholder="+63 ..." maxlength="20">
                            </div>
                        </div>
                        <div class="form-button-group">
                            <button id="btnSaveProfile" type="button" class="btn btn-primary btn-block shadowed">
                                Save Profile
                            </button>
                        </div>
                    </form>
                </div>
            </div>`;
        },
        _escapeHtml(s) {
            return String(s == null ? '' : s)
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        },
        _escapeAttr(s) {
            return String(s == null ? '' : s)
                .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        },
        _screenOnboarding() {
            const brands = Object.keys(this.EBIKE_BRANDS || {});
            const brandOpts = brands.map(b => `<option value="${this._escapeAttr(b)}">${this._escapeHtml(b)}</option>`).join('') +
                '<option value="__other">Other / custom brand…</option>';
            const capOpts = (this.EBIKE_CAPACITIES || [1, 2, 3, 6, 8, 10, 12, 15])
                .map(c => `<option value="${c}">${c} passenger${c > 1 ? 's' : ''}</option>`).join('');
            return `
            <div class="section mt-2">
                <div class="card">
                    <div class="card-body">
                        <h6 class="card-subtitle">First-time setup</h6>
                        <h5 class="card-title">Onboarding Wizard</h5>
                        <p class="card-text small" id="obProgress" style="color:var(--lapeeet-text-lo);">Step 1 of 4</p>
                    </div>
                </div>
            </div>
            <div class="section full mt-2 mb-2">
                <div class="wide-block pt-3 pb-3 pl-3 pr-3">
                    <form onsubmit="event.preventDefault();">
                        <div class="ob-step" data-step="1">
                            <div class="section-title">1 · Choose your role</div>
                            <div class="form-group boxed"><div class="input-wrapper">
                                <label class="label" for="obRole">I will use Lapeeet as a…</label>
                                <select class="form-control" id="obRole">
                                    <option value="RIDER">Rider (book e-bike rides)</option>
                                    <option value="DRIVER">Driver (offer rides with my e-bike)</option>
                                </select>
                            </div></div>
                        </div>
                        <div class="ob-step" data-step="2" style="display:none">
                            <div class="section-title">2 · Your profile</div>
                            <div class="form-group boxed"><div class="input-wrapper">
                                <label class="label" for="obName">Display name</label>
                                <input type="text" class="form-control" id="obName" placeholder="Your name" maxlength="60">
                            </div></div>
                            <div class="form-group boxed"><div class="input-wrapper">
                                <label class="label" for="obPhone">Phone</label>
                                <input type="tel" class="form-control" id="obPhone" placeholder="+63 ..." maxlength="20">
                            </div></div>
                        </div>
                        <div class="ob-step" data-step="3" style="display:none">
                            <div class="section-title">3 · Your e-bike (drivers)</div>
                            <p class="small text-muted">Riders can skip this step.</p>
                            <div class="form-group boxed"><div class="input-wrapper">
                                <label class="label" for="obBrand">Brand</label>
                                <select class="form-control" id="obBrand">${brandOpts}</select>
                            </div></div>
                            <div class="form-group boxed" id="obBrandOtherWrap" style="display:none"><div class="input-wrapper">
                                <label class="label" for="obBrandOther">Custom brand</label>
                                <input type="text" class="form-control" id="obBrandOther" placeholder="Brand name" maxlength="40">
                            </div></div>
                            <div class="form-group boxed"><div class="input-wrapper">
                                <label class="label" for="obModel">Model</label>
                                <input type="text" class="form-control" id="obModel" placeholder="Model" maxlength="40">
                            </div></div>
                            <div class="form-group boxed"><div class="input-wrapper">
                                <label class="label" for="obCapacity">Passenger capacity</label>
                                <select class="form-control" id="obCapacity">${capOpts}</select>
                            </div></div>
                        </div>
                        <div class="ob-step" data-step="4" style="display:none">
                            <div class="section-title">4 · Confirm</div>
                            <p class="small" id="obReview" style="color:var(--lapeeet-text-lo);"></p>
                        </div>
                        <div class="d-flex justify-content-between mt-3">
                            <button id="obBack" type="button" class="btn btn-outline-secondary" style="min-width:110px">Back</button>
                            <button id="obNext" type="button" class="btn btn-primary shadowed" style="min-width:140px">Next</button>
                        </div>
                    </form>
                </div>
            </div>`;
        },
        _screenEbike() {
            let listHtml;
            try {
                if (window.LapeeetDB && LapeeetDB.initialized) {
                    const bikes = LapeeetDB.listEbikes();
                    listHtml = bikes.length ? bikes.map(b => `
                        <li><div class="item">
                            ${b.photo1 ? `<img src="${b.photo1}" alt="ebike" class="image imaged w-40" style="object-fit:cover">`
                                       : `<img src="assets/img/icon.svg" alt="ebike" class="image imaged w-40">`}
                            <div class="in"><div>
                                <div style="color:var(--lapeeet-text-hi);font-weight:600;">${this._escapeHtml(b.brand)} ${this._escapeHtml(b.model)}${b.is_primary ? ' · Primary' : ''}</div>
                                <span class="text-muted">${this._escapeHtml(b.color || '')} · ${b.capacity} seat${b.capacity > 1 ? 's' : ''}</span>
                                <div class="mt-1">
                                    ${b.is_primary ? '' : `<a href="javascript:;" data-ebike-primary="${b.id}" class="small text-primary">Set primary</a> · `}
                                    <a href="javascript:;" data-ebike-del="${b.id}" class="small" style="color:#ff9aa2">Remove</a>
                                </div>
                            </div></div>
                        </div></li>`).join('')
                        : `<li><div class="item"><img src="assets/img/icon.svg" alt="ebike" class="image imaged w-40">
                            <div class="in"><div><div style="color:var(--lapeeet-text-hi);font-weight:600;">No e-bikes yet</div>
                            <span class="text-muted">Use the form below to register your first e-bike.</span></div></div></div></li>`;
                } else {
                    listHtml = '<li><div class="item"><div class="in"><div>Tenant DB still loading…</div></div></div></li>';
                }
            } catch (e) {
                listHtml = '<li><div class="item"><div class="in"><div>Could not load e-bikes.</div></div></div></li>';
            }
            const brands = Object.keys(this.EBIKE_BRANDS || {});
            const brandOpts = brands.map(b => `<option value="${this._escapeAttr(b)}">${this._escapeHtml(b)}</option>`).join('') +
                '<option value="__other">Other / custom brand…</option>';
            const capOpts = (this.EBIKE_CAPACITIES || [1, 2, 3, 6, 8, 10, 12, 15])
                .map(c => `<option value="${c}">${c} passenger${c > 1 ? 's' : ''}</option>`).join('');
            return `
            <div class="section mt-2">
                <div class="card">
                    <div class="card-body">
                        <h6 class="card-subtitle">Driver Tenant</h6>
                        <h5 class="card-title">My E-Bikes</h5>
                        <p class="card-text small" style="color:var(--lapeeet-text-lo);">
                            Capacity must be in [1, 2, 3, 6, 8, 10, 12, 15]. Max 3 high-quality photos per e-bike.
                        </p>
                    </div>
                </div>
            </div>
            <div class="section mt-2">
                <div class="card">
                    <ul class="listview image-listview flush">${listHtml}</ul>
                </div>
            </div>
            <div class="section full mt-2 mb-2">
                <div class="section-title">Register E-Bike</div>
                <div class="wide-block pt-3 pb-3 pl-3 pr-3">
                    <form onsubmit="event.preventDefault();">
                        <div class="form-group boxed"><div class="input-wrapper">
                            <label class="label" for="ebBrand">Brand</label>
                            <select class="form-control" id="ebBrand">${brandOpts}</select>
                        </div></div>
                        <div class="form-group boxed" id="ebBrandOtherWrap" style="display:none"><div class="input-wrapper">
                            <label class="label" for="ebBrandOther">Custom brand</label>
                            <input type="text" class="form-control" id="ebBrandOther" maxlength="40">
                        </div></div>
                        <div class="form-group boxed"><div class="input-wrapper">
                            <label class="label" for="ebModel">Model</label>
                            <input type="text" class="form-control" id="ebModel" maxlength="40" placeholder="Model">
                        </div></div>
                        <div class="form-group boxed"><div class="input-wrapper">
                            <label class="label" for="ebColor">Colour</label>
                            <input type="text" class="form-control" id="ebColor" maxlength="24" placeholder="e.g. Ocean Blue">
                        </div></div>
                        <div class="form-group boxed"><div class="input-wrapper">
                            <label class="label" for="ebCapacity">Passenger capacity</label>
                            <select class="form-control" id="ebCapacity">${capOpts}</select>
                        </div></div>
                        <div class="form-group boxed"><div class="input-wrapper">
                            <label class="label" for="ebPhotos">Photos (max 3, auto-optimised)</label>
                            <input type="file" class="form-control" id="ebPhotos" accept="image/*" multiple>
                        </div></div>
                        <div id="ebPhotoPreview" class="d-flex mb-2" style="gap:8px;flex-wrap:wrap"></div>
                        <div class="form-button-group">
                            <button id="btnAddEbike" type="button" class="btn btn-primary btn-block shadowed">
                                <ion-icon name="add-outline"></ion-icon> Register E-Bike
                            </button>
                        </div>
                    </form>
                </div>
            </div>`;
        },
        _screenData() {
            return `
            <div class="section mt-2">
                <div class="card">
                    <div class="card-body">
                        <h6 class="card-subtitle">Tenant Ownership</h6>
                        <h5 class="card-title">Data &amp; Privacy</h5>
                        <p class="card-text small" style="color:var(--lapeeet-text-lo);">
                            You 100% own your data. It lives in your browser only
                            (IndexedDB + sql.js tenant DB). Export/import anytime.
                        </p>
                        <p class="card-text small" id="dataDbStatus">DB: checking…</p>
                    </div>
                </div>
            </div>
            <div class="section full mt-2 mb-2">
                <div class="section-title">Data Actions</div>
                <div class="wide-block pt-3 pb-3 pl-3 pr-3">
                    <div class="form-button-group">
                        <button id="btnExportDb" class="btn btn-primary btn-block shadowed">
                            <ion-icon name="download-outline"></ion-icon> Export All (.db)
                        </button>
                    </div>
                    <div class="form-button-group mt-2">
                        <button id="btnExportJson" class="btn btn-outline-primary btn-block">
                            <ion-icon name="document-text-outline"></ion-icon> Export as JSON
                        </button>
                    </div>
                    <div class="form-button-group mt-2">
                        <button id="btnImportDb" class="btn btn-success btn-block">
                            <ion-icon name="cloud-upload-outline"></ion-icon> Import .db File
                        </button>
                        <input type="file" id="fileImportDb" accept=".db,.sqlite,.sqlite3" style="display:none">
                    </div>
                    <div class="form-button-group mt-2">
                        <button id="btnWipeDb" class="btn btn-danger btn-block shadowed">
                            <ion-icon name="trash-outline"></ion-icon> Wipe All My Local Data
                        </button>
                    </div>
                    <p class="small text-muted mt-3 mb-0" style="color:var(--lapeeet-text-mute);">
                        Exports download a standard SQLite file you can open anywhere.
                        Wipe is immediate and unrecoverable — export first.
                    </p>
                </div>
            </div>`;
        },
        _screenSettings() {
            return `
            <div class="section mt-2">
                <div class="card">
                    <div class="card-body d-flex justify-content-between align-items-end">
                        <div>
                            <h6 class="card-subtitle">Display</h6>
                            <h5 class="card-title mb-0 d-flex align-items-center justify-content-between">
                                Dark Mode <span class="text-muted small ml-1">(Always On)</span>
                            </h5>
                        </div>
                        <div class="custom-control custom-switch">
                            <input type="checkbox" class="custom-control-input dark-mode-switch" id="darkmodeswitch" checked disabled>
                            <label class="custom-control-label" for="darkmodeswitch"></label>
                        </div>
                    </div>
                </div>
            </div>
            <div class="section full mt-2 mb-2">
                <div class="section-title">About</div>
                <div class="wide-block pt-2 pb-2 pl-3 pr-3">
                    <ul class="listview flush transparent simple-listview">
                        <li>App Version <strong>${UI_VERSION}</strong></li>
                        <li>Max Trip Distance <strong>60 km</strong></li>
                        <li>Official Currency <strong>Philippine Peso (₱ PHP)</strong></li>
                        <li>Base Fare <strong>₱30.00</strong></li>
                        <li>Per Kilometer <strong>₱12.00</strong></li>
                        <li>Per Minute (wait/traffic) <strong>₱2.00</strong></li>
                        <li>Capacities Supported <strong>[1,2,3,6,8,10,12,15]</strong></li>
                        <li>Network <strong>webconnect.js P2P</strong></li>
                        <li>Navigation <strong>Organic Maps (deep link)</strong></li>
                        <li>Versioned Storage <strong>isomorphic-git@1.25.0</strong></li>
                        <li>Git Transport <strong>CORS-proxy (default: cors.isomorphic-git.org)</strong></li>
                        <li>Git FS Backend <strong>LightningFS → IndexedDB</strong></li>
                    </ul>
                </div>
            </div>

            <div class="section full mt-2 mb-2">
                <div class="section-title">Data &amp; Privacy (Git)</div>
                <div class="wide-block pt-2 pb-2 pl-3 pr-3">
                    <ul class="listview flush transparent simple-listview">
                        <li>Git Runtime <strong id="settingsGitRuntime">checking…</strong></li>
                        <li>Current Repo <strong id="settingsGitRepo">—</strong></li>
                        <li>IndexedDB Used <strong id="settingsGitQuota">—</strong></li>
                        <li>Last Commit <strong id="settingsGitLast">—</strong></li>
                        <li>Working Tree <strong id="settingsGitWorking">—</strong></li>
                    </ul>
                    <p class="text-muted smaller mt-3 mb-0" style="color:var(--lapeeet-text-mute);">
                        Ride history, tenant DB backups, and user settings can be
                        exported as signed git commits. Clone any public repo, or
                        create local-only repos — everything stays on this device
                        until you explicitly push.
                    </p>
                </div>
            </div>`;
        },

        _bindScreenEvents(/*id*/) { /* per-screen event wiring happens in app.js on screen change */ },

        toggleRole() {
            this.currentRole = (this.currentRole === 'RIDER') ? 'DRIVER' : 'RIDER';
            $('#roleIcon').attr('name', this.currentRole === 'RIDER' ? 'person-outline' : 'bicycle-outline');
            $('#sidebarRole').html(
                `<ion-icon name="${this.currentRole === 'RIDER' ? 'person-outline' : 'bicycle-outline'}"></ion-icon> ` +
                (this.currentRole === 'RIDER' ? 'Rider' : 'Driver')
            );
            if (this.onRoleChange) this.onRoleChange(this.currentRole);
            if (this.currentScreen === SCREENS.HOME || this.currentScreen === SCREENS.PROFILE) this.navigate(this.currentScreen);
            this.showToast(`Switched to ${this.currentRole === 'RIDER' ? 'Rider' : 'Driver'} Mode`, 'info');
        },

        updateSidebar({ name, peerId, role, p2pStatus } = {}) {
            if (name)     $('#sidebarName').text(name);
            if (peerId)   $('#sidebarPeerId').text(peerId);
            if (role)     $('#sidebarRole').html(`<ion-icon name="${role === 'RIDER' ? 'person-outline' : 'bicycle-outline'}"></ion-icon> ${role}`);
            if (p2pStatus)$('#sidebarP2pStatus').text(p2pStatus);
        },

        // ---------- OFFICIAL CURRENCY FORMATTER: Philippine Peso (₱ PHP) ----------
        CURRENCY: {
            code: 'PHP',
            symbol: '₱',
            locale: 'en-PH'
        },
        formatCurrency(amount) {
            const num = Number(amount) || 0;
            const rounded = Number.isInteger(num) ? num : Math.round(num * 100) / 100;
            const fixed = rounded.toFixed(2);
            if (this.CURRENCY.locale && typeof Intl !== 'undefined' && Intl.NumberFormat) {
                try {
                    const formatted = new Intl.NumberFormat(this.CURRENCY.locale, {
                        style: 'currency',
                        currency: this.CURRENCY.code,
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    }).format(rounded);
                    // Fallback if Intl returns "PHP" instead of "₱" (some browsers):
                    if (!formatted.includes('₱') && formatted.includes('PHP')) {
                        return formatted.replace('PHP', '').trim().replace(/^(\s+)?/, '₱').replace(/\s+/, ' ');
                    }
                    return formatted;
                } catch (e) { /* ignore Intl failure and fallback */ }
            }
            const parts = fixed.split('.');
            parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
            return '₱' + parts[0] + '.' + parts[1];
        },

        showToast(message, variant = 'info', autohideMs = 3000) {
            const vmap = {
                info:    'bg-primary',
                success: 'bg-success',
                warning: 'bg-warning text-dark',
                danger:  'bg-danger'
            };
            // Reuse a single host (older builds appended a duplicate host per toast).
            let host = $('#lp-toast-host');
            if (!host.length) {
                host = $('<div id="lp-toast-host"></div>').css({
                    position: 'fixed', top: '80px', right: '16px',
                    zIndex: 9999
                });
                $('body').append(host);
            }
            const el = $(`
                <div class="toast show ${vmap[variant] || vmap.info}" role="alert" aria-live="polite"
                     style="min-width:280px;border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,0.12);margin-bottom:8px;">
                    <div class="toast-body text-white font-weight-bold small">${message}</div>
                </div>`);
            host.append(el);
            setTimeout(() => { try { el.toast('hide'); } catch (e) { /* no bootstrap toast plugin */ } el.remove(); }, autohideMs);
        },

        openModal({ title, bodyHtml, footerHtml }) {
            $('#globalModalTitle').text(title || '');
            $('#globalModalBody').html(bodyHtml || '');
            $('#globalModalFooter').html(footerHtml || '');
            $('#globalModal').modal('show');
        },
        closeModal() { $('#globalModal').modal('hide'); }
    };

    global.LapeeetUI = LapeeetUI;
})(window);
