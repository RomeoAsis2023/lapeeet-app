// Phase 3 P2P pure-logic smoke: geohash + validation (no mesh needed).
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync('www/assets/js/p2p-layer.js', 'utf8');

const sandbox = { window: {}, console, setTimeout, clearTimeout };
sandbox.window = sandbox;
sandbox.global = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox);

const P2P = sandbox.LapeeetP2P;
const gh = sandbox.LapeeetGeohash;
let fails = 0;
const ok = (name, cond) => {
  console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name);
  if (!cond) fails++;
};

ok('geohash Manila = wdw5', gh(14.5995, 120.9842, 4) === 'wdw5');
ok('geohash len 4', gh(0, 0, 4).length === 4);
ok('geohash distinct cells', gh(14.6, 121.0, 4) !== gh(15.5, 121.0, 4));
ok('capacity whitelist ok', [1, 2, 3, 6, 8, 10, 12, 15].every(c => P2P.validateCapacity(c)));
ok('capacity rejects 0/4/5/7/16', [0, 4, 5, 7, 16, 'x'].every(c => !P2P.validateCapacity(c)));

const req = (over) => Object.assign({
  ride_id: 'r1', role: 'RIDER', expires_at: Date.now() + 60000,
  pickup_lat: 14.5995, pickup_lng: 120.9842,
  drop_lat: 14.65, drop_lng: 121.05, distance_km: 9.2, capacity: 2
}, over || {});
ok('valid request passes', P2P.validateRideRequest(req()));
ok('65km rejected', !P2P.validateRideRequest(req({ distance_km: 65 })));
ok('far-coords rejected', !P2P.validateRideRequest(req({ drop_lat: 15.5, drop_lng: 122.0 })));
ok('cap-4 rejected', !P2P.validateRideRequest(req({ capacity: 4 })));
ok('spoofed distance rejected', !P2P.validateRideRequest(req({ distance_km: 1 })));
ok('missing ride_id rejected', !P2P.validateRideRequest(req({ ride_id: null })));
ok('non-passenger role rejected', !P2P.validateRideRequest(req({ role: 'DRIVER' })));
ok('missing role rejected', !P2P.validateRideRequest(req({ role: undefined })));
ok('missing expiry rejected', !P2P.validateRideRequest(req({ expires_at: undefined })));
ok('long-expired offer rejected', !P2P.validateRideRequest(req({ expires_at: Date.now() - 120000 })));
ok('fresh offer passes', P2P.validateRideRequest(req({ expires_at: Date.now() + 1000 })));
ok('17 message types incl RIDE_LOCKED', Object.keys(P2P.MSG_TYPES).length === 19 && !!P2P.MSG_TYPES.RIDE_LOCKED && !!P2P.MSG_TYPES.PING && !!P2P.MSG_TYPES.PONG);
ok('offer window 60000', P2P.RIDE_OFFER_MS === 60000);
ok('channel naming', ('lapeeet-' + gh(14.5995, 120.9842, 4)) === 'lapeeet-wdw5');
// LapeeetGeo bundle (home nearby filtering)
const G = sandbox.LapeeetGeo;
ok('geo bundle exported', !!(G && G.haversineKm && G.trunc3 && G.geohash));
const mnl_qc = G.haversineKm(14.5995, 120.9842, 14.65, 121.05);
ok('haversine Manila-QC ~9km', mnl_qc > 8 && mnl_qc < 11);
ok('haversine zero', G.haversineKm(0, 0, 0, 0) === 0);
ok('trunc3 rounds', G.trunc3(14.59955) === 14.6 && G.trunc3(-0.0004) === -0);
ok('geo cap constant 60', G.MAX_TRIP_KM === 60);

// Presence solicit: a DRIVER answers a rider HELLO instantly (no 10s wait).
(async () => {
  const sent = [];
  P2P._role = 'DRIVER';
  P2P.initialized = true;
  P2P.status = 'online';
  P2P.connectId = 'me';
  P2P._currentLoc = () => Promise.resolve({ lat: 14.6, lng: 121.0 });
  P2P.broadcast = (t, b) => { sent.push({ t, b }); return { mocked: true }; };
  P2P.peers = new Map();
  const hello = (from, role) => ({
    id: 'h-' + from, type: 'HELLO', body: { role }, from, pub: from, ts: Date.now(), sig: 'x',
  });
  P2P._dispatch(hello('rider1', 'RIDER'), 't-rider1', false);
  await new Promise((r) => setTimeout(r, 30));
  ok('driver solicits on rider HELLO',
    sent.length === 1 && sent[0].t === 'DRIVER_STATUS' && sent[0].b.online === true);
  sent.length = 0;
  P2P._dispatch(hello('driver2', 'DRIVER'), 't-driver2', false);
  await new Promise((r) => setTimeout(r, 30));
  ok('no solicit for fellow drivers', sent.length === 0);
  P2P._dispatch(hello('me', 'RIDER'), 't-self', true);
  await new Promise((r) => setTimeout(r, 30));
  ok('no solicit for own HELLO', sent.length === 0);
  P2P._role = 'RIDER';
  P2P._dispatch(hello('rider2', 'RIDER'), 't-rider2', false);
  await new Promise((r) => setTimeout(r, 30));
  ok('riders never solicit', sent.length === 0);

  // Phase 14: signed ping/pong round-trip + reconcile.
  const directs = [];
  P2P.sendDirect = (to, t, b) => { directs.push({ to, t, b }); return { mocked: true }; };
  P2P._dispatch({ id: 'p1', type: 'PING', body: { nonce: 'n1', ts: 1000 }, from: 'peerX', pub: 'peerX', ts: Date.now(), sig: 'x' }, 't-peerX', false);
  ok('PING auto-replies PONG echoing nonce/ts',
    directs.length === 1 && directs[0].t === 'PONG' && directs[0].to === 'peerX' &&
    directs[0].b.nonce === 'n1' && directs[0].b.ts === 1000);
  P2P._pendingPings['n9'] = { to: 'peerY', ts: Date.now() - 42, timer: setTimeout(() => {}, 99999) };
  const seen = [];
  P2P._onEvent = (e) => seen.push(e);
  P2P._dispatch({ id: 'p2', type: 'PONG', body: { nonce: 'n9', ts: Date.now() - 42 }, from: 'peerY', pub: 'peerY', ts: Date.now(), sig: 'x' }, 't-peerY', false);
  const lat = P2P.latency.get('peerY');
  ok('PONG records RTT + clears pending + emits',
    !!lat && lat.rtt >= 0 && lat.rtt < 5000 && !P2P._pendingPings['n9'] &&
    seen.some((e) => e.type === 'PONG'));
  P2P._dispatch({ id: 'p3', type: 'PONG', body: { nonce: 'nope', ts: 1 }, from: 'peerZ', pub: 'peerZ', ts: Date.now(), sig: 'x' }, 't-peerZ', false);
  ok('stray PONG ignored', !P2P.latency.get('peerZ'));
  P2P._dispatch({ id: 'p4', type: 'PING', body: { nonce: 'nS', ts: 1 }, from: 'me', pub: 'me', ts: Date.now(), sig: 'x' }, 't-self', true);
  ok('own PING/PONG ignored', directs.length === 1);
  P2P.peers = new Map([['peerY', { transportId: 't-peerY', lastSeen: Date.now() }]]);
  P2P.connect = {}; // truthy dummy; sendDirect is stubbed below
  ok('pingPeer unknown identity false', P2P.pingPeer('ghost') === false);
  P2P.status = 'offline';
  ok('pingPeer offline false', P2P.pingPeer('peerY') === false);
  P2P.status = 'online';
  const nonce = P2P.pingPeer('peerY');
  ok('pingPeer sends PING + tracks pending',
    typeof nonce === 'string' && !!P2P._pendingPings[nonce] &&
    directs.some((d) => d.t === 'PING' && d.b.nonce === nonce));
  clearTimeout(P2P._pendingPings[nonce].timer);
  delete P2P._pendingPings[nonce];
  // Reconcile: unknown transport ids get a direct HELLO, known ones don't.
  const hellos = [];
  P2P.transportId = 't-self';
  P2P._sendHello = (tid) => hellos.push(tid || null);
  P2P.connect = { getConnection: (cb) => cb({ connection: ['t-self', 't-peerY', 't-stranger'] }) };
  P2P._reconcilePeers();
  ok('reconcile greets only unknown transports',
    hellos.length === 1 && hellos[0] === 't-stranger');
  P2P.connect = null;
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('HARNESS FAIL:', e.message); process.exit(1); });
