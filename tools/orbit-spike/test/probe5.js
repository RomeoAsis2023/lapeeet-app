import { createHelia } from 'helia'
import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { noise } from '@libp2p/noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { FsBlockstore } from 'blockstore-fs'
import { CID } from 'multiformats/cid'
import { sha256 } from 'multiformats/hashes/sha2'
import * as dagCbor from '@ipld/dag-cbor'
import { base58btc } from 'multiformats/bases/base58'
import { createOrbitDB, IPFSAccessController } from '@orbitdb/core'
import fs from 'node:fs'

fs.rmSync('./test/dbg5', { recursive: true, force: true })
const opts = () => ({
  addresses: { listen: ['/ip4/127.0.0.1/tcp/0'] },
  transports: [tcp()], connectionEncrypters: [noise()], streamMuxers: [yamux()],
  peerDiscovery: [], services: {},
})
async function makeNode(dir) {
  const ipfs = await createHelia({ libp2p: opts(), blockstore: new FsBlockstore(dir + '/blocks') })
  await ipfs.start()
  return ipfs
}
const ipfsA = await makeNode('./test/dbg5/a')
const ipfsB = await makeNode('./test/dbg5/b')
const orbitA = await createOrbitDB({ ipfs: ipfsA, id: 'a', directory: './test/dbg5/oa' })
const orbitB = await createOrbitDB({ ipfs: ipfsB, id: 'b', directory: './test/dbg5/ob' })
const oo = { type: 'events', sync: false, AccessController: IPFSAccessController({ write: ['*'] }) }
const dbA = await orbitA.open('w', oo)
const dbB = await orbitB.open('w', oo)
await dbA.add('x')
const head = (await dbA.log.heads())[0]
console.log('entry.identity:', head.identity)

// The identity hash is base58btc multihash bytes. Rewrap as CIDv1 dag-cbor.
const mhBytes = base58btc.decode(head.identity)
console.log('multihash bytes:', mhBytes.length)
const digest = sha256.decode(mhBytes)
const cid = CID.createV1(dagCbor.code, digest)
console.log('reconstructed CID:', cid.toString().slice(0, 20))
const collect = async (stream) => {
  const chunks = []
  for await (const c of stream) chunks.push(c)
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0))
  let o = 0
  for (const c of chunks) { out.set(c, o); o += c.length }
  return out
}
const idBytes = await collect(await ipfsA.blockstore.get(cid))
console.log('identity block bytes from sender store:', idBytes.length)
await ipfsB.blockstore.put(cid, idBytes)
try {
  const r = await dbB.log.joinEntry(structuredClone(head))
  console.log('join returned:', r)
} catch (e) {
  console.log('join threw:', e.message.slice(0, 100))
}
console.log('B.all =', (await dbB.all()).length)
await dbA.close(); await dbB.close()
await orbitA.stop(); await orbitB.stop()
await ipfsA.stop(); await ipfsB.stop()
process.exit(0)
