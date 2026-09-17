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
  db.close(); db2.close();
})().catch(e => { console.error('HARNESS FAIL:', e.message); process.exit(1); });
