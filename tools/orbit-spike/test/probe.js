import { createHelia } from 'helia'
import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { noise } from '@libp2p/noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { identify } from '@libp2p/identify'
import { FsBlockstore } from 'blockstore-fs'
import { createOrbitDB, IPFSAccessController } from '@orbitdb/core'
import fs from 'node:fs'

fs.rmSync('./test/dbg', { recursive: true, force: true })
const libp2pOpts = {
  addresses: { listen: ['/ip4/127.0.0.1/tcp/0'] },
  transports: [tcp()], connectionEncrypters: [noise()], streamMuxers: [yamux()],
  peerDiscovery: [], services: {},
}
const ipfs = await createHelia({ libp2p: libp2pOpts, blockstore: new FsBlockstore('./test/dbg/blocks') })
await ipfs.start()
const orbit = await createOrbitDB({ ipfs, id: 'dbg', directory: './test/dbg/orbitdb' })
const db = await orbit.open('dbg-db', {
  type: 'events', sync: false, AccessController: IPFSAccessController({ write: ['*'] }),
})
db.events.on('update', (e) => console.log('UPDATE fired hash=', e.hash))
const h = await db.add('hello')
console.log('add returned', h)
console.log('all:', JSON.stringify((await db.all()).map((e) => e.value)))
console.log('heads:', (await db.log.heads()).length)
const heads = await db.log.heads()
console.log('head keys:', Object.keys(heads[0]).join(','))
console.log('head.next:', JSON.stringify(heads[0].next), 'refs:', JSON.stringify(heads[0].refs))
await db.close(); await orbit.stop(); await ipfs.stop()
process.exit(0)
