// Spend a mature coinbase, broadcast via Arcade (EF, 0-fee), mine, and check MINED + merkle path
// against the chaintracks header.
import { PrivateKey, P2PKH, Transaction, MerklePath } from '@bsv/sdk'
import { rpc, mine, sleep, ARCADE, CHAINTRACKS, MINER_WIF, until, getJson, ok } from './lib.mjs'

const key = PrivateKey.fromWif(MINER_WIF)
const myScript = new P2PKH().lock(key.toPublicKey().toHash()).toHex()

// 1. Make sure there is a mature coinbase (maturity 100 on regtest).
let tip = (await rpc('getinfo')).blocks
if (tip < 110) { console.log(`mining to 110 (tip ${tip})`); await mine(110 - tip); tip = 110 }
const height = tip - 101
const blockHash = await rpc('getblockhash', [height])
const block = await rpc('getblock', [blockHash, 1])
const cbTxid = block.tx?.[0] ?? block.merkleroot  // regtest blocks hold only the coinbase
const cbHex = await rpc('getrawtransaction', [cbTxid, 0])
const source = Transaction.fromHex(cbHex)
const vout = source.outputs.findIndex(o => o.lockingScript.toHex() === myScript)
ok(vout >= 0, `coinbase ${cbTxid.slice(0, 8)} (height ${height}) pays the miner key`)

// 2. Spend it: one output back to the same key, zero fee.
const tx = new Transaction()
tx.addInput({ sourceTransaction: source, sourceOutputIndex: vout, unlockingScriptTemplate: new P2PKH().unlock(key) })
tx.addOutput({ lockingScript: new P2PKH().lock(key.toPublicKey().toHash()), satoshis: source.outputs[vout].satoshis })
await tx.sign()
const txid = tx.id('hex')

// 3. Broadcast to Arcade as Extended Format.
const res = await fetch(`${ARCADE}/tx`, {
  method: 'POST',
  headers: { 'content-type': 'text/plain', 'X-CallbackToken': 'e2e', 'X-FullStatusUpdates': 'true' },
  body: tx.toHexEF()
})
const body = await res.json().catch(() => ({}))
ok(res.status === 202, `arcade accepted ${txid.slice(0, 8)}: ${res.status} ${JSON.stringify(body)}`)

// 4. Wait until Arcade has it on the network, give Teranode's block assembly a moment to pick it up
// (a block mined immediately can miss it), then mine until it shows up MINED.
await until('SEEN_ON_NETWORK', async () => ['SEEN_ON_NETWORK', 'SEEN_ON_MULTIPLE_NODES', 'MINED'].includes((await getJson(`${ARCADE}/tx/${txid}`)).txStatus), { timeout: 30000 })
await sleep(3000)
let st
for (let attempt = 1; attempt <= 5 && !st; attempt++) {
  await mine(1)
  st = await until('MINED + merklePath', async () => {
    const s = await getJson(`${ARCADE}/tx/${txid}`)
    return s.txStatus === 'MINED' || s.txStatus === 'IMMUTABLE' ? s : null
  }, { timeout: 45000, every: 2000 }).catch(() => { console.log(`  not MINED after block attempt ${attempt}`) })
}
ok(!!st, 'tx MINED')
ok(!!st.merklePath, 'merklePath delivered')

// 5. Verify the BUMP against the chaintracks header for its block.
const mp = typeof st.merklePath === 'string' ? MerklePath.fromHex(st.merklePath) : MerklePath.fromBinary(st.merklePath)
const root = mp.computeRoot(txid)
const hdr = await getJson(`${CHAINTRACKS}/header/height/${mp.blockHeight}`)
ok(hdr.merkleRoot === root, `BUMP root matches chaintracks header at height ${mp.blockHeight}`)
console.log('PASS tx round trip')
