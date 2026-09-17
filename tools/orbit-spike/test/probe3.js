import { createHelia } from 'helia'
import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { noise } from '@libp2p/noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { FsBlockstore } from 'blockstore-fs'
import { CID } from 'multiformats/cid'
import { createOrbitDB, IPFSAccessController } from '@orbitdb/core'
import fs from 'node:fs'

fs.rmSync('./test/dbg3', { recursive: true, force: true })
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
const ipfsA = await makeNode('./test/dbg3/a')
const ipfsB = await makeNode('./test/dbg3/b')
const orbitA = await createOrbitDB({ ipfs: ipfsA, id: 'a', directory: './test/dbg3/oa' })
const orbitB = await createOrbitDB({ ipfs: ipfsB, id: 'b', directory: './test/dbg3/ob' })
const oo = { type: 'events', sync: false, AccessController: IPFSAccessController({ write: ['*'] }) }
const dbA = await orbitA.open('w', oo)
const dbB = await orbitB.open('w', oo)
console.log('same addr:', dbA.address === dbB.address)
await dbA.add('x')
const head = (await dbA.log.heads())[0]
console.log('B has head?', await dbB.log.has(head.hash).catch((e) => 'ERR:' + e.message))
try {
  const r = await dbB.log.joinEntry(structuredClone(head))
  console.log('join returned:', r)
} catch (e) {
  console.log('join threw:', JSON.stringify(e.message))
  console.log('regex match:', /Failed to load block for (\S+)/.exec(e.message || ''))
  // manual fetch + retry:
  const m = /Failed to load block for (\S+)/.exec(e.message || '')
  if (m) {
    const bytes = await ipfsA.blockstore.get(CID.parse(m[1]))
    console.log('fetched bytes:', bytes.length)
    await ipfsB.blockstore.put(CID.parse(m[1]), bytes)
    const r2 = await dbB.log.joinEntry(structuredClone(head)).catch((e2) => 'THREW2:' + e2.message)
    console.log('retry result:', r2)
  }
}
console.log('B.all =', (await dbB.all()).length)
await dbA.close(); await dbB.close()
await orbitA.stop(); await orbitB.stop()
await ipfsA.stop(); await ipfsB.stop()
process.exit(0)
