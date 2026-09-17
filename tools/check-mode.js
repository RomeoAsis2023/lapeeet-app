// Phase 6 ?mode= harness: pure mapping + boot priority + URL sync (no DOM needed).
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync('www/assets/js/app.js', 'utf8');

function loadApp(search, savedRole) {
  const store = { 'lapeeet::role': savedRole };
  const win = {
    location: { search, href: 'https://x.test/lapeeet-app/' + search },
    history: { replaceState(a, b, url) { win.location.href = url; } },
  };
  const sandbox = {
    window: win,
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
    },
    console,
  };
  sandbox.window = win;
  sandbox.global = sandbox;
  win.addEventListener = () => {};
  vm.createContext(sandbox);
  vm.runInContext(src + '\nthis.__T = window.LapeeetApp;', sandbox);
  return { app: sandbox.__T, win, store };
}

let fails = 0;
const ok = (name, cond) => {
  console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name);
  if (!cond) fails++;
};

// _modeFromParam mapping
const { app } = loadApp('', null);
ok('driver->DRIVER', app._modeFromParam('driver') === 'DRIVER');
ok('DRIVER (caps)->DRIVER', app._modeFromParam('DRIVER') === 'DRIVER');
ok('passenger->RIDER', app._modeFromParam('passenger') === 'RIDER');
ok('rider alias->RIDER', app._modeFromParam('rider') === 'RIDER');
ok('whitespace/case tolerated', app._modeFromParam('  Passenger ') === 'RIDER');
ok('junk->null', app._modeFromParam('admin') === null);
ok('empty->null', app._modeFromParam('') === null);
ok('missing->null', app._modeFromParam(null) === null);

// Boot priority: URL > saved > default
ok('URL driver beats saved rider',
  loadApp('?mode=driver', 'RIDER').app.resolveInitialRole() === 'DRIVER');
ok('URL passenger beats saved driver',
  loadApp('?mode=passenger', 'DRIVER').app.resolveInitialRole() === 'RIDER');
ok('invalid URL falls back to saved',
  loadApp('?mode=bogus', 'DRIVER').app.resolveInitialRole() === 'DRIVER');
ok('no URL uses saved',
  loadApp('', 'DRIVER').app.resolveInitialRole() === 'DRIVER');
ok('no URL no saved defaults RIDER',
  loadApp('', null).app.resolveInitialRole() === 'RIDER');

// URL sync
const t1 = loadApp('', null);
t1.app.role = 'DRIVER';
t1.app._syncModeUrl();
ok('sync writes ?mode=driver', t1.win.location.href.includes('mode=driver'));
const t2 = loadApp('', null);
t2.app.role = 'RIDER';
t2.app._syncModeUrl();
ok('sync writes ?mode=passenger', t2.win.location.href.includes('mode=passenger'));
const t3 = loadApp('?foo=1&mode=driver', null);
t3.app.role = 'RIDER';
t3.app._syncModeUrl();
ok('sync preserves other params', t3.win.location.href.includes('foo=1') && t3.win.location.href.includes('mode=passenger'));

// Phase 13 lock machine: first-accept-wins (pure decision, no mesh needed).
const L = loadApp('', null).app;
L._rideLocks = {};
ok('unknown ride -> unknown', L._lockDecision('rx', 'd1') === 'unknown');
L._rideLocks = { r1: { winner: null, expires_at: Date.now() + 60000, timer: null } };
ok('open ride first arrival -> accept', L._lockDecision('r1', 'driverA') === 'accept');
L._lockRide('r1', 'driverA');
ok('locked ride same winner -> duplicate', L._lockDecision('r1', 'driverA') === 'duplicate');
ok('locked ride late arrival -> taken', L._lockDecision('r1', 'driverB') === 'taken');
ok('other ride unaffected', L._lockDecision('r2', 'driverB') === 'unknown');
L._openRideLock('r2', Date.now() + 60000);
ok('opened lock accepts', L._lockDecision('r2', 'driverC') === 'accept');
ok('lock stores expiry', L._rideLocks.r2.expires_at > Date.now());

process.exit(fails ? 1 : 0);
