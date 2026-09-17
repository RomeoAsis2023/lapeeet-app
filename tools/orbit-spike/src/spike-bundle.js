// Browser entry for the P0 bundle audit: the exact stack Phase 8 would ship.
// Not app code — measures what webconnect-bridged OrbitDB costs in bytes.
import { createHelia } from 'helia'
import { createLibp2p } from 'libp2p'
import { createOrbitDB, IPFSAccessController } from '@orbitdb/core'
import { IDBBlockstore } from 'blockstore-idb'

export async function bootOffline(datadir) {
  const libp2p = await createLibp2p({
    addresses: { listen: [] },
    transports: [],
    peerDiscovery: [],
    services: {},
  })
  const ipfs = await createHelia({ libp2p, blockstore: new IDBBlockstore(datadir) })
  await ipfs.start()
  return { ipfs, createOrbitDB, IPFSAccessController }
}
