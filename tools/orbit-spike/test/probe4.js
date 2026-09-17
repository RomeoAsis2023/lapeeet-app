import { createHelia } from 'helia'
import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { noise } from '@libp2p/noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { FsBlockstore } from 'blockstore-fs'
import { createOrbitDB, IPFSAccessController } from '@orbitdb/core'
import fs from 'node:fs'

fs.rmSync('./test/dbg4', { recursive: true, force: true })
const opts = () => ({
  addresses: { listen: ['/ip4/127.0.0.1/tcp/0'] },
  transports: [tcp()], connectionEncrypters: [noise()], streamMuxers: [yamux()],
  peerDiscovery: [], services: {},
})
const ipfs = await createHelia({ libp2p: opts(), blockstore: new FsBlockstore('./test/dbg4/blocks') })
await ipfs.start()
const orbit = await createOrbitDB({ ipfs, id: 'x', directory: './test/dbg4/orbitdb' })
const db = await orbit.open('w', { type: 'events', sync: false, AccessController: IPFSAccessController({ write: ['*'] }) })
await db.add('x')
const head = (await db.log.heads())[0]
console.log('identity field:', JSON.stringify(head.identity))
console.log('key field:', JSON.stringify(head.key))
console.log('orbit identity id:', orbit.identity.id)
console.log('has:', typeof orbit.identities?.has, 'getIdentity:', typeof orbit.identities?.getIdentity)
await db.close(); await orbit.stop(); await ipfs.stop()
process.exit(0)
