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

process.exit(fails ? 1 : 0);
