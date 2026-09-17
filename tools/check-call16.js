// Phase 16 Moderntown deltas: glare tie-break + narration, room check, alert guards.
const fs = require('fs');
const vm = require('vm');
let fails = 0;
const ok = (name, cond) => {
  console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name);
  if (!cond) fails++;
};

/* ---------- call-layer: glare tie-break + narration ---------- */
const callSrc = fs.readFileSync('www/assets/js/call-layer.js', 'utf8');
const sentDirect = [];
const callSandbox = {
  console, setTimeout, clearTimeout,
  navigator: {},
  document: { getElementById: () => null, createElement: () => ({ style: {} }), body: { appendChild: () => {} } },
};
callSandbox.window = callSandbox;
callSandbox.global = callSandbox;
callSandbox.LapeeetP2P = {
  connectId: 'peer-A',
  MSG_TYPES: { CALL_INITIATE: 'CALL_INITIATE', CALL_END: 'CALL_END' },
  sendDirect: (to, type, body) => sentDirect.push({ to, type, body }),
};
vm.createContext(callSandbox);
vm.runInContext(callSrc, callSandbox);
const Call = callSandbox.LapeeetCall;
Call._render = () => {}; // DOM-free: test the state machine only
const reset = () => {
  try { clearTimeout(Call._ringTimer); } catch (e) {}
  try { Call._cleanup(); } catch (e) {}
  Call.state = 'idle';
  Call.rideId = null;
  Call.remoteStream = null;
};
const incBody = { ride_id: 'r1', audio: true, video: true };

reset();
Call._handleIncoming(incBody, 'peer-B', 't-B');
ok('idle incoming -> ringing', Call.state === 'ringing' && Call.peerIdentity === 'peer-B');

// Glare: I dialed B too, and my id is LOWER -> I win, ignore their leg.
reset();
Call.state = 'outgoing'; Call.peerIdentity = 'peer-B'; Call.rideId = 'r1';
callSandbox.LapeeetP2P.connectId = 'peer-A';
sentDirect.length = 0;
Call._handleIncoming(incBody, 'peer-B', 't-B');
ok('glare winner keeps outgoing, no busy sent',
  Call.state === 'outgoing' && Call.peerIdentity === 'peer-B' && sentDirect.length === 0);

// Glare: my id is HIGHER -> I lose, stand down and answer (no busy reject).
reset();
let stopped = 0;
Call.state = 'outgoing'; Call.peerIdentity = 'peer-B'; Call.rideId = 'r1';
Call.localStream = { getTracks: () => [{ stop: () => { stopped++; } }] };
callSandbox.LapeeetP2P.connectId = 'peer-Z';
sentDirect.length = 0;
Call._handleIncoming(incBody, 'peer-B', 't-B');
ok('glare loser answers, stops own media, no busy sent',
  Call.state === 'ringing' && Call.peerIdentity === 'peer-B' &&
  stopped === 1 && Call.localStream === null && sentDirect.length === 0);

// Busy with a THIRD party while outgoing -> CALL_END busy, leg untouched.
reset();
Call.state = 'outgoing'; Call.peerIdentity = 'peer-B'; Call.rideId = 'r1';
callSandbox.LapeeetP2P.connectId = 'peer-A';
sentDirect.length = 0;
Call._handleIncoming(incBody, 'peer-C', 't-C');
ok('third-party incoming while busy -> CALL_END busy',
  sentDirect.length === 1 && sentDirect[0].type === 'CALL_END' &&
  sentDirect[0].body.reason === 'busy' && Call.state === 'outgoing' &&
  Call.peerIdentity === 'peer-B');

// Narration lines.
reset();
Call.state = 'outgoing';
ok('narrate outgoing = Connecting', /Connecting/.test(Call._connLine().text));
Call.state = 'ringing';
ok('narrate ringing = incoming', /Incoming/.test(Call._connLine().text));
Call.state = 'in-call'; Call.remoteStream = null;
ok('narrate in-call w/o media = Connecting', /Connecting/.test(Call._connLine().text));
Call.remoteStream = { fake: true };
ok('narrate in-call + media = Connected', /Connected/.test(Call._connLine().text));
Call.state = 'error';
ok('narrate error mentions chat fallback', /chat still works/.test(Call._connLine().text));

/* ---------- p2p-layer: room stamp + fail-open filter ---------- */
const p2pSrc = fs.readFileSync('www/assets/js/p2p-layer.js', 'utf8');
const p2pBox = { window: {}, console, setTimeout, clearTimeout, setInterval, clearInterval };
p2pBox.window = p2pBox;
p2pBox.global = p2pBox;
vm.createContext(p2pBox);
vm.runInContext(p2pSrc, p2pBox);
const P2P = p2pBox.LapeeetP2P;
const baseEnv = { id: 'e1', type: 'HELLO', body: {}, from: 'x', pub: 'x', ts: Date.now(), sig: 's' };
ok('shape rejects non-string room',
  !P2P._validEnvelopeShape(Object.assign({}, baseEnv, { room: 42 })));
ok('shape accepts string room',
  P2P._validEnvelopeShape(Object.assign({}, baseEnv, { room: 'lapeeet-wdw5' })));
ok('shape accepts legacy envelope without room',
  P2P._validEnvelopeShape(Object.assign({}, baseEnv)));
ok('signEnvelope stamps channel as room (source)',
  /room:\s*this\.channel\s*\|\|\s*null/.test(p2pSrc));
P2P.channel = 'lapeeet-wdw5';
P2P._seenIds = [];
P2P.peers = new Map();
P2P.verify = () => true;
const dispatched = [];
P2P._dispatch = (env) => dispatched.push(env.type);
const rx = (id, room) => {
  const e = { id, type: 'HELLO', body: {}, from: 'peer-' + id, pub: 'peer-' + id, ts: Date.now(), sig: 's' };
  if (room !== 'ABSENT') e.room = room;
  P2P._onReceive(e, 't-' + id);
};
rx('m1', 'lapeeet-xxxx');
ok('cross-room message dropped', dispatched.length === 0);
rx('m2', 'lapeeet-wdw5');
ok('same-room message dispatched', dispatched.length === 1);
rx('m3', 'ABSENT');
ok('legacy no-room message dispatched (fail-open)', dispatched.length === 2);

/* ---------- app.js: alert guards (sound off / no APIs) ---------- */
const appSrc = fs.readFileSync('www/assets/js/app.js', 'utf8');
const store = {};
const vibrated = [];
const appBox = {
  console, setTimeout, clearTimeout, setInterval, clearInterval,
  localStorage: {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  },
  navigator: { vibrate: (p) => { vibrated.push(p); return true; } },
  document: { addEventListener: () => {}, body: {} },
  addEventListener: () => {},
};
appBox.window = appBox;
appBox.global = appBox;
vm.createContext(appBox);
vm.runInContext(appSrc, appBox);
const App = appBox.LapeeetApp;
ok('sound defaults ON', App._soundEnabled() === true);
App.setSoundEnabled(false);
ok('sound toggle persists off', App._soundEnabled() === false && store['lapeeet::sound'] === 'off');
App.setSoundEnabled(true);
vibrated.length = 0;
App._alertRideRequest(); App._alertChat(); App._alertCall();
ok('alerts vibrate without AudioContext, never throw', vibrated.length === 2 &&
  JSON.stringify(vibrated[0]) === '[200,100,200]');
// With a stub AudioContext, beeps are scheduled (oscillator count).
let oscCount = 0;
function StubAC() { this.currentTime = 100; this.state = 'running'; this.destination = {}; }
StubAC.prototype.resume = function () {};
StubAC.prototype.createOscillator = function () {
  oscCount++;
  return { type: '', frequency: { value: 0 }, connect: () => {}, start: () => {}, stop: () => {} };
};
StubAC.prototype.createGain = function () {
  const p = { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} };
  return { gain: p, connect: () => {} };
};
appBox.AudioContext = StubAC;
App._audioCtx = null;
App._alertRideRequest(); App._alertChat(); App._alertCall();
ok('stub AudioContext schedules 3+1+6 beeps', oscCount === 10);
App.setSoundEnabled(false);
vibrated.length = 0;
App._alertRideRequest(); App._alertChat(); App._alertCall();
ok('alerts silent when off', vibrated.length === 0);
App.setSoundEnabled(true);
appBox.navigator = {}; // no vibrate API at all
let threw = false;
try { App._alertRideRequest(); App._alertChat(); App._alertCall(); } catch (e) { threw = true; }
ok('alerts survive missing vibrate API', !threw);

console.log(fails === 0 ? 'ALL CHECKS PASSED' : fails + ' CHECK(S) FAILED');
process.exit(fails === 0 ? 0 : 1);
