// Phase 2 DB smoke: schema + constraints + CRUD round-trip (Node harness).
const fs = require('fs');
const path = require('path');
const VL = path.join(__dirname, '..', 'www', 'assets', 'vendor-live');

(async () => {
  const initSqlJs = require(path.join(VL, 'sql-wasm.js'));
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(VL, 'sql-wasm.wasm')) });

  // Extract SCHEMA from db-layer.js source (single source of truth).
  const src = fs.readFileSync(path.join(__dirname, '..', 'www', 'assets', 'js', 'db-layer.js'), 'utf8');
  const schema = src.match(/const SCHEMA = `([\s\S]*?)`;/)[1];
  const db = new SQL.Database();
  db.exec(schema);
  db.exec('INSERT OR IGNORE INTO me(id) VALUES (1)');
  db.exec('INSERT OR IGNORE INTO my_profile(id) VALUES (1)');
  const ok = (name, fn, shouldThrow) => {
    try {
      fn();
      console.log((shouldThrow ? 'FAIL' : 'PASS') + ' - ' + name);
    } catch (e) {
      console.log((shouldThrow ? 'PASS' : 'FAIL') + ' - ' + name + (shouldThrow ? '' : ' :: ' + e.message));
    }
  };

  ok('create ebike cap=2', () => db.run(
    'INSERT INTO my_ebikes (brand,model,color,capacity,photo1,photo2,photo3,is_primary) VALUES (?,?,?,?,?,?,?,?)',
    ['YADEA', 'C-Line', 'Blue', 2, '', '', '', 1]));
  ok('reject ebike cap=4 (whitelist)', () => db.run(
    'INSERT INTO my_ebikes (brand,model,capacity) VALUES (?,?,?)', ['X', 'Y', 4]), true);
  ok('reject ebike cap=5 (whitelist)', () => db.run(
    'INSERT INTO my_ebikes (brand,model,capacity) VALUES (?,?,?)', ['X', 'Y', 5]), true);
  ok('allow ebike cap=15 (max whitelist)', () => db.run(
    'INSERT INTO my_ebikes (brand,model,capacity) VALUES (?,?,?)', ['X', 'Y', 15]));
  ok('allow ride 42km', () => db.run(
    'INSERT INTO my_rides_as_rider (id,distance_km,fare_php,status,created_at) VALUES (?,?,?,?,?)',
    ['r1', 42, 534, 'requested', Date.now()]));
  ok('reject ride 65km (cap)', () => db.run(
    'INSERT INTO my_rides_as_rider (id,distance_km,fare_php,status,created_at) VALUES (?,?,?,?,?)',
    ['r2', 65, 810, 'requested', Date.now()]), true);
  ok('reject driver ride 60.01km', () => db.run(
    'INSERT INTO my_rides_as_driver (id,distance_km,status,created_at) VALUES (?,?,?,?)',
    ['d1', 60.01, 'offered', Date.now()]), true);
  ok('allow driver ride exactly 60km', () => db.run(
    'INSERT INTO my_rides_as_driver (id,distance_km,status,created_at) VALUES (?,?,?,?)',
    ['d2', 60, 'offered', Date.now()]));
  ok('geocode cache write/read', () => {
    db.run('INSERT OR REPLACE INTO geocode_cache (q,lat,lng,address,ts) VALUES (?,?,?,?,?)',
      ['s:manila', 14.5995, 120.9842, 'Manila', Date.now()]);
    const r = db.exec('SELECT * FROM geocode_cache WHERE q = \'s:manila\'');
    if (!r.length || !r[0].values.length) throw new Error('no row');
  });

  // Export -> re-import round-trip.
  const blob = db.export();
  console.log((blob.length > 1000 ? 'PASS' : 'FAIL') + ' - export blob bytes=' + blob.length);
  const db2 = new SQL.Database(blob);
  const n = db2.exec('SELECT COUNT(*) AS c FROM my_ebikes')[0].values[0][0];
  console.log((n === 2 ? 'PASS' : 'FAIL') + ' - re-import ebike count=' + n);
  // Legacy id=1 singleton guard.
  const me = db2.exec('SELECT * FROM me WHERE id = 1');
  console.log((me.length && me[0].values.length ? 'PASS' : 'FAIL') + ' - me singleton row');
  // Phase 9: passkey column present on fresh schema.
  const cols = db2.exec('PRAGMA table_info(my_profile)')[0].values.map(r => r[1]);
  console.log((cols.includes('passkey_json') ? 'PASS' : 'FAIL') + ' - my_profile.passkey_json column');
  // Rich profile + PIN columns.
  ['first_name', 'last_name', 'email', 'pin_json'].forEach(c => {
    console.log((cols.includes(c) ? 'PASS' : 'FAIL') + ' - my_profile.' + c + ' column');
  });
  ok('passkey set/get round-trip', () => {
    db2.run('UPDATE my_profile SET passkey_json = ? WHERE id = 1', ['{"credIdB64":"abc"}']);
    const r = db2.exec("SELECT passkey_json FROM my_profile WHERE id = 1")[0].values[0][0];
    if (r !== '{"credIdB64":"abc"}') throw new Error('mismatch');
  });
  // Phase 9 migration: pre-existing DB WITHOUT the column gets ALTERed.
  const old = new SQL.Database();
  old.exec(`CREATE TABLE my_profile(id INTEGER PRIMARY KEY CHECK(id = 1),
    name TEXT DEFAULT '', phone TEXT DEFAULT '', avatar_url TEXT DEFAULT '')`);
  old.exec(`INSERT INTO my_profile(id,name,phone) VALUES (1,'Old User','+639171234567')`);
  try { old.exec('ALTER TABLE my_profile ADD COLUMN passkey_json TEXT DEFAULT ' + "''"); }
  catch (e) { throw new Error('migration failed: ' + e.message); }
  const migrated = old.exec('SELECT name, phone, passkey_json FROM my_profile WHERE id = 1')[0].values[0];
  console.log((migrated[0] === 'Old User' && migrated[1] === '+639171234567' && migrated[2] === ''
    ? 'PASS' : 'FAIL') + ' - pre-existing DB migrates, data intact');
  // Second ALTER (already-migrated DB) must be a harmless no-op error.
  let secondOk = false;
  try { old.exec('ALTER TABLE my_profile ADD COLUMN passkey_json TEXT'); }
  catch (e) { secondOk = /duplicate/i.test(e.message); }
  console.log((secondOk ? 'PASS' : 'FAIL') + ' - repeat migration safely rejected');
  db.close(); db2.close(); old.close();

  // Drive the REAL db-layer.js saveProfile/displayName (vm + stubbed browser env).
  const vm = require('vm');
  const dblSrc = fs.readFileSync(path.join(__dirname, '..', 'www', 'assets', 'js', 'db-layer.js'), 'utf8');
  const win = {};
  const sandbox = {
    window: win, console,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    setTimeout: (fn) => 0, clearTimeout: () => {},
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(dblSrc, sandbox);
  const DBL = sandbox.LapeeetDB;
  DBL.SQL = SQL;
  DBL.db = new SQL.Database();
  DBL.db.exec(schema);
  DBL.db.exec('INSERT OR IGNORE INTO me(id) VALUES (1)');
  DBL.db.exec('INSERT OR IGNORE INTO my_profile(id) VALUES (1)');
  DBL.initialized = true;
  const t = (name, cond) => console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name);
  t('displayName empty when blank', DBL.displayName() === '');
  DBL.saveProfile({ first_name: 'Juan', last_name: 'Dela Cruz', email: 'juan@example.com', phone: '+639171234567' });
  t('displayName joins first+last', DBL.displayName() === 'Juan Dela Cruz');
  t('legacy name synced', DBL.getProfile().name === 'Juan Dela Cruz');
  t('email stored', DBL.getProfile().email === 'juan@example.com');
  DBL.saveProfile({ phone: '+639999999999' });
  t('partial patch keeps names', DBL.displayName() === 'Juan Dela Cruz' && DBL.getProfile().phone === '+639999999999');
  DBL.saveProfile({ avatar_url: 'data:image/jpeg;base64,AAA' });
  t('avatar stored', DBL.getProfile().avatar_url === 'data:image/jpeg;base64,AAA');
  // Legacy single-name profile still displays.
  DBL.db.run("UPDATE my_profile SET first_name = '', last_name = '', name = 'Old Name' WHERE id = 1");
  t('legacy name fallback', DBL.displayName() === 'Old Name');
})().catch(e => { console.error('HARNESS FAIL:', e.message); process.exit(1); });
