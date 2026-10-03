// Forced reorg: needs the stack started with `stack.ps1 up -NoMine` (no background miner).
// Mines branch A, invalidates its first block, mines a longer branch B, then checks that Teranode
// and Arcade's chaintracks both follow the heavier chain.
import { rpc, mine, CHAINTRACKS, until, getJson, ok } from '../e2e/lib.mjs'

const height = async () => (await rpc('getinfo')).blocks
const base = await height()
console.log('base height', base)

await mine(3)
const branchA = []
for (let h = base + 1; h <= base + 3; h++) branchA.push(await rpc('getblockhash', [h]))
const tipA = branchA[2]
await until("chaintracks at A tip", async () => (await getJson(`${CHAINTRACKS}/tip`)).hash === tipA, { timeout: 120000, every: 2000 })
ok(true, `chaintracks follows branch A tip ${tipA.slice(0, 8)}`)

// Orphan branch A, then mine a longer branch B.
await rpc('invalidateblock', [branchA[0]])
await until('node applies invalidateblock', async () => (await height()) === base, { timeout: 60000, every: 1000 })
ok(true, 'height back to base after invalidateblock')
await mine(4)
const tipB = await rpc('getblockhash', [base + 4])
ok(tipB !== tipA, 'branch B tip differs from A')
ok((await rpc('getbestblockhash')) === tipB, 'teranode best block is branch B tip')

await until('chaintracks reorg to B', async () => (await getJson(`${CHAINTRACKS}/tip`)).hash === tipB, { timeout: 180000, every: 2000 })
ok(true, `chaintracks switched to branch B tip ${tipB.slice(0, 8)} (height ${base + 4})`)

// Informational: how does chaintracks report the orphaned header?
const orphan = await fetch(`${CHAINTRACKS}/header/hash/${branchA[2]}`)
console.log('orphaned A tip header lookup ->', orphan.status)
for (let h = base + 1; h <= base + 4; h++) {
  const hh = await getJson(`${CHAINTRACKS}/header/height/${h}`)
  const want = await rpc('getblockhash', [h])
  ok(hh.hash === want, `chaintracks header at height ${h} is on branch B`)
}
console.log('PASS reorg')
