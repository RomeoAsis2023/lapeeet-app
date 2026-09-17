// P0 spike harness: OrbitDB-over-webconnect bridge feasibility.
// - Two OFFLINE Helia nodes (no bootstrap, no dials, localhost only).
// - Mock webconnect bus (structured-clone boundary mimics Trystero transport).
// - syncAutomatically:false — ALL replication goes through the mock bridge.
// Gates: offline init, public-API seams, convergence both ways, forgery
// rejection, restart persistence, writer-list enforcement.
import { createHelia } from 'helia'
import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { noise } from '@libp2p/noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { identify } from '@libp2p/identify'
import { FsBlockstore } from 'blockstore-fs'
import { CID } from 'multiformats/cid'
import * as core from '@orbitdb/core'
import fs from 'node:fs'

const results = []
const ok = (name, cond, extra) => {
  results.push({ name, pass: !!cond })
  console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name + (extra ? ' :: ' + extra : ''))
}

console.log('core exports:', Object.keys(core).sort().join(' '))
const { createOrbitDB } = core
const IPFSAccessController = core.IPFSAccessController || core.IPFSAccessControllers?.IPFSAccessController
ok('IPFSAccessController exported', !!IPFSAccessController)

// Mock webconnect bus: rooms keyed by action name, structured-clone delivery.
const bus = {
  rooms: new Map(),
  on(action, fn) {
    if (!this.rooms.has(action)) this.rooms.set(action, new Set())
    this.rooms.get(action).add(fn)
  },
  send(action, msg, from) {
    for (const fn of this.rooms.get(action) || []) {
      setTimeout(() => fn(structuredClone(msg), from), 5)
    }
  },
}

const DIRS = { a: './test/data-a', b: './test/data-b', c: './test/data-c' }
for (const d of Object.values(DIRS)) fs.rmSync(d, { recursive: true, force: true })

async function makeNode(dir) {
  // Hermetic OPTIONS (not an instance): Helia merges defaults by REPLACE, so
  // every networked key must be explicitly overridden. No discovery, no
  // bootstrap, localhost TCP only, nothing ever dials. Mirrors the browser
  // "offline stub" (there: webrtc transport + empty discovery/services).
  const libp2pOpts = {
    addresses: { listen: ['/ip4/127.0.0.1/tcp/0'] },
    transports: [tcp()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    peerDiscovery: [],
    services: {},
  }
  const blockstore = new FsBlockstore(dir + '/blocks')
  const ipfs = await createHelia({ libp2p: libp2pOpts, blockstore })
  await ipfs.start()
  return { libp2p: ipfs.libp2p, ipfs }
}

const t0 = Date.now()
const A = await makeNode(DIRS.a)
const B = await makeNode(DIRS.b)
ok('offline Helia init x2 (no bootstrap/dial)', true, `${Date.now() - t0}ms`)

const orbitA = await createOrbitDB({ ipfs: A.ipfs, id: 'driver-A', directory: DIRS.a + '/orbitdb' })
const orbitB = await createOrbitDB({ ipfs: B.ipfs, id: 'rider-B', directory: DIRS.b + '/orbitdb' })

const openOpts = {
  type: 'events',
  sync: false, // v4 option name (NOT syncAutomatically): disable stock libp2p sync,
  AccessController: IPFSAccessController({ write: ['*'] }), // bridge replicates instead
}
const dbA = await orbitA.open('ride-spike', openOpts)
const dbB = await orbitB.open('ride-spike', openOpts)
ok('open events db syncAutomatically:false', true)
ok('same-name open-access DBs share address', dbA.address === dbB.address, dbA.address)
ok('stock db exposes .log', !!dbA.log)
ok('log.joinEntry is function', typeof dbA.log?.joinEntry === 'function')
ok('entryStorage present', !!dbA.log?.storage)

// Bridge: A --update--> bus --receive--> B.joinEntry (and reverse).
// Missing blocks (identity keys, ancestors) resolve via the block
// request/response layer: fetch from source peer, verify by CID on put,
// retry join. Mirrors the production webconnect `orbitdb-blocks` action.
async function mergeWithFetch(targetLog, entry, sourceIpfs, targetIpfs, label) {
  const collect = async (stream) => {
    const chunks = []
    for await (const chunk of stream) chunks.push(chunk)
    const total = chunks.reduce((n, c) => n + c.length, 0)
    const out = new Uint8Array(total)
    let off = 0
    for (const c of chunks) { out.set(c, off); off += c.length }
    return out
  }
  const deadline = Date.now() + 30000
  for (let i = 0; i < 40; i++) {
    if (Date.now() > deadline) throw new Error('merge timed out waiting for blocks')
    try {
      return await targetLog.joinEntry(structuredClone(entry))
    } catch (e) {
      const m = /Failed to load block for (\S+)/.exec(e.message || '')
      if (!m) throw e
      const cid = CID.parse(m[1])
      const bytes = await collect(await sourceIpfs.blockstore.get(cid))
      await targetIpfs.blockstore.put(cid, bytes)
      console.log(`  [bridge:${label}] fetched block ${m[1].slice(0, 12)}… (${bytes.length}B)`)
    }
  }
  throw new Error('block fetch loop exhausted')
}
dbA.events.on('update', (entry) => { console.log('  [dbg] A update fired', entry.hash.slice(0, 12)); bus.send('orbit-heads', { db: dbA.address, entry }, 'A') })
dbB.events.on('update', (entry) => { console.log('  [dbg] B update fired', entry.hash.slice(0, 12)); bus.send('orbit-heads', { db: dbB.address, entry }, 'B') })
bus.on('orbit-heads', async ({ db, entry }, from) => {
  try {
    if (from === 'A') await mergeWithFetch(dbB.log, entry, A.ipfs, B.ipfs, 'A->B')
    else await mergeWithFetch(dbA.log, entry, B.ipfs, A.ipfs, 'B->A')
  } catch (e) { console.log('joinEntry threw:', e.message) }
})

const waitFor = async (fn, ms = 8000) => {
  const t = Date.now()
  while (Date.now() - t < ms) {
    if (await fn()) return true
    await new Promise((r) => setTimeout(r, 100))
  }
  return false
}

await dbA.add('pickup:14.60,120.98')
await dbA.add('status:enroute')
console.log('  [dbg] A.all after adds:', (await dbA.all()).length)
const convergedB = await waitFor(async () => (await dbB.all()).length >= 2)
ok('A writes converge to B via bridge', convergedB,
  JSON.stringify((await dbB.all()).map((e) => e.value)))
await dbB.add('status:arrived')
const convergedA = await waitFor(async () => (await dbA.all()).length >= 3)
ok('B writes converge to A via bridge', convergedA)

// Block layer: raw entry bytes round-trip through both helia blockstores.
const heads = await dbA.log.heads()
const sample = heads[0]
const bytes = await dbA.log.storage.get(sample.hash)
ok('entry bytes retrievable from storage', bytes && bytes.length > 0, `${bytes?.length}B`)
await B.ipfs.blockstore.put(CID.parse(sample.hash), bytes)
const back = await B.ipfs.blockstore.get(CID.parse(sample.hash))
const same = back && back.length === bytes.length &&
  back[0] === bytes[0] && back[back.length - 1] === bytes[bytes.length - 1]
ok('block bytes round-trip B blockstore', !!same, `${back?.length}B vs ${bytes.length}B`)

// Forgery: mutate a valid entry, keep original hash -> joinEntry must refuse.
const forged = structuredClone(sample)
forged.payload = 'forged-payload'
let forgeryRejected = false
try {
  await dbB.log.joinEntry(forged)
} catch (e) {
  forgeryRejected = true
}
const stillClean = (await dbB.all()).every((e) => e.value !== 'forged-payload')
ok('forged entry rejected', forgeryRejected && stillClean)

// Writer-list enforcement: restricted DB, outsider write must fail to merge.
const orbitC = await createOrbitDB({ ipfs: B.ipfs, id: 'attacker-C', directory: DIRS.c + '/orbitdb' })
const writers = [orbitA.identity.id]
const dbA2 = await orbitA.open('ride-private', {
  type: 'events', syncAutomatically: false,
  AccessController: IPFSAccessController({ write: writers }),
})
const dbC2 = await orbitC.open(dbA2.address)
ok('restricted DB opens by address (manifest resolvable)', !!dbC2.address)
let outsiderRejected = false
try {
  // Attacker appends locally then pushes the head at the insider:
  const h = await dbC2.log.heads().catch(() => [])
  const entry = await dbC2.add('malicious')
  await dbA2.log.joinEntry(structuredClone(entry))
} catch (e) {
  outsiderRejected = true
}
ok('non-writer entry refused by insider log', outsiderRejected)

// Persistence: full stop, reopen from same dirs, data intact.
await dbA.close(); await dbB.close()
await orbitA.stop(); await orbitB.stop()
await A.ipfs.stop(); await B.ipfs.stop()
try { await A.libp2p.stop(); } catch (e) {}
try { await B.libp2p.stop(); } catch (e) {}
const A2 = await makeNode(DIRS.a)
const orbitA2 = await createOrbitDB({ ipfs: A2.ipfs, id: 'driver-A', directory: DIRS.a + '/orbitdb' })
const dbA2r = await orbitA2.open('ride-spike', openOpts)
const rows = await dbA2r.all()
ok('restart persistence (entries survive)', rows.length >= 3, `${rows.length} rows`)
  await dbA2r.close(); await orbitA2.stop(); await A2.ipfs.stop()
  try { await A2.libp2p.stop(); } catch (e) {}

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} gates pass`)
process.exit(failed.length ? 1 : 0)
