// Shared helpers for stack tests. Defaults match stack/.env; override with env vars.
export const RPC_URL = process.env.RPC_URL ?? 'http://localhost:29292'
export const ARCADE = process.env.ARCADE_URL ?? 'http://localhost:8080'
export const CHAINTRACKS = process.env.CHAINTRACKS_URL ?? 'http://localhost:8083/chaintracks/v2'
// Public regtest key from the teranode repo's settings.conf (PK1): the node's coinbase pays this key.
export const MINER_WIF = process.env.MINER_WIF ?? 'L56TgyTpDdvL3W24SMoALYotibToSCySQeo4pThLKxw6EFR6f93Q'

export async function rpc (method, params = []) {
  const r = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Basic ' + Buffer.from('bitcoin:bitcoin').toString('base64') },
    body: JSON.stringify({ method, params })
  })
  const j = await r.json()
  if (j.error) throw new Error(`rpc ${method}: ${JSON.stringify(j.error)}`)
  return j.result
}

export const sleep = ms => new Promise(r => setTimeout(r, ms))

export async function until (label, fn, { timeout = 60000, every = 1000 } = {}) {
  const end = Date.now() + timeout
  let last
  while (Date.now() < end) {
    try { const v = await fn(); if (v) return v } catch (e) { last = e }
    await sleep(every)
  }
  throw new Error(`timeout waiting for ${label}${last ? ': ' + last.message : ''}`)
}

export async function getJson (url) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${url} -> ${r.status}`)
  return r.json()
}

export function ok (cond, msg) {
  if (!cond) { console.error('FAIL', msg); process.exitCode = 1; throw new Error(msg) }
  console.log('ok  ', msg)
}

// `generate` can exceed Teranode's 30s RPC timeout while block assembly resets, though the blocks still
// get mined. On timeout, wait for the height to arrive instead of failing.
export async function mine (n) {
  const start = (await rpc('getinfo')).blocks
  try { return await rpc('generate', [n]) } catch (e) {
    if (!/timed out/.test(e.message)) throw e
    await until(`height ${start + n}`, async () => (await rpc('getinfo')).blocks >= start + n, { timeout: 180000, every: 2000 })
  }
}
