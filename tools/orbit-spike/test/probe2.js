import { createHelia } from 'helia'
import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { noise } from '@libp2p/noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { FsBlockstore } from 'blockstore-fs'
import { createOrbitDB, IPFSAccessController } from '@orbitdb/core'
import fs from 'node:fs'

fs.rmSync('./test/dbg2', { recursive: true, force: true })
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
const ipfsA = await makeNode('./test/dbg2/a')
const ipfsB = await makeNode('./test/dbg2/b')
const orbitA = await createOrbitDB({ ipfs: ipfsA, id: 'a', directory: './test/dbg2/oa' })
const orbitB = await createOrbitDB({ ipfs: ipfsB, id: 'b', directory: './test/dbg2/ob' })
const oo = { type: 'events', sync: false, AccessController: IPFSAccessController({ write: ['*'] }) }
const dbA = await orbitA.open('shared', oo)
const dbB = await orbitB.open('shared', oo)
console.log('same address:', dbA.address === dbB.address)

const h = await dbA.add('ping')
console.log('A added, A.all =', (await dbA.all()).length)
const heads = await dbA.log.heads()
console.log('heads:', heads.length, 'hash:', heads[0].hash.slice(0, 12))
const entry = heads[0]
console.log('entry.id:', entry.id?.slice?.(0, 20), '| log id match:', entry.id === dbB.address)

try {
  const r = await dbB.log.joinEntry(structuredClone(entry))
  console.log('joinEntry returned:', r)
} catch (e) {
  console.log('joinEntry THREW:', e.message)
}
console.log('B.all =', (await dbB.all()).length)
await dbA.close(); await dbB.close()
await orbitA.stop(); await orbitB.stop()
await ipfsA.stop(); await ipfsB.stop()
process.exit(0)
