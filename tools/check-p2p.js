// Phase 3 P2P pure-logic smoke: geohash + validation (no mesh needed).
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync('www/assets/js/p2p-layer.js', 'utf8');

const sandbox = { window: {}, console };
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
  ride_id: 'r1', pickup_lat: 14.5995, pickup_lng: 120.9842,
  drop_lat: 14.65, drop_lng: 121.05, distance_km: 9.2, capacity: 2
}, over || {});
ok('valid request passes', P2P.validateRideRequest(req()));
ok('65km rejected', !P2P.validateRideRequest(req({ distance_km: 65 })));
ok('far-coords rejected', !P2P.validateRideRequest(req({ drop_lat: 15.5, drop_lng: 122.0 })));
ok('cap-4 rejected', !P2P.validateRideRequest(req({ capacity: 4 })));
ok('spoofed distance rejected', !P2P.validateRideRequest(req({ distance_km: 1 })));
ok('missing ride_id rejected', !P2P.validateRideRequest(req({ ride_id: null })));
ok('16 message types incl CHAT', Object.keys(P2P.MSG_TYPES).length === 16 && !!P2P.MSG_TYPES.CHAT);
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
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('HARNESS FAIL:', e.message); process.exit(1); });
