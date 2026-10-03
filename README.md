# spv-testnet

Local, private BSV regtest chain for testing SPV clients (wallets and browsers): **Teranode** (from genesis) + **merkle-service** + **Arcade**, driven by one script, with scripted end-to-end and reorg tests. Used by [BOLT-Association/ChainBrowsers](https://github.com/BOLT-Association/ChainBrowsers).

```
SPV client ─── /tx ───► Arcade ◄──callbacks── merkle-service ◄─libp2p/datahub─┐
          ◄─chaintracks─┘  (:8080 / :8083)                                    │
                                              Teranode regtest (RPC :29292, asset :28090) ──┘
```

## Use

Needs Docker and PowerShell 5.1+.

```powershell
cd stack
.\stack.ps1 up            # pull latest images and start (mines 10 blocks, then keeps mining)
.\stack.ps1 up -NoMine    # no background miner (needed for reorg tests)
.\stack.ps1 status
.\stack.ps1 mine 5
.\stack.ps1 invalidate <hash> / reconsider <hash>
.\stack.ps1 down          # keeps the chain; `reset` wipes it
```

Images and ports are in `stack/.env` (override in `stack/.env.local`). Defaults avoid Teranode's usual 19292/18090 so this can sit beside an older regtest stack.

| Endpoint | URL |
|---|---|
| Arcade broadcast / status | `http://localhost:8080` (`POST /tx`, `GET /tx/:txid`) |
| Arcade chaintracks (headers) | `http://localhost:8083/chaintracks/v2` (`/tip`, `/height`, `/header/height/{n}`, `/reorg/stream`) |
| Teranode RPC | `http://localhost:29292` (bitcoin/bitcoin) |
| Teranode asset server | `http://localhost:28090/api/v1` |

The node's coinbase pays the public regtest key `PK1` from Teranode's `settings.conf`, which the tests use to fund transactions. These keys are public and worthless.

## Tests

```powershell
cd tests/e2e; npm install; npm run roundtrip   # spend a coinbase via Arcade, mine, check MINED + BUMP root vs chaintracks header
cd ../reorg; node reorg.mjs                    # needs `up -NoMine`; invalidate, mine a longer branch, check chaintracks follows
```

## Status and known issues

Verified on a fresh chain with `ghcr.io/bsv-blockchain/{teranode,arcade,merkle-service}:latest` (Oct 2026): clean boot, `reset`, `up -NoMine`, `down`/`up` keeps the chain, tx round trip with a valid BUMP, and one forced reorg with chaintracks following.

- **A second reorg on the same chain stalls Teranode's `generate`.** After `invalidateblock`, `generate` can hit the node's 30 s RPC timeout and mine nothing. The first reorg after a `reset` works. Run `reset` between reorg tests until this is understood.
- **Coinbase maturity is 100 and not configurable.** It comes from the regtest chain params, not `settings.conf`; changing it needs a custom Teranode build. Mining 100 blocks is quick, so the one-off cost is small.
- **Block mined right after a broadcast can miss the tx.** Block assembly picks it up a moment after Arcade reports it; the round-trip test waits and retries.
- **Teranode asset server logs a 401 every 30 s** to Arcade (`tier=unverified`). Not yet traced; nothing observed breaks because of it. Peer-auth only controls rate-limit tiers (`asset_peerAuthAllowlist`, `asset_httpRateLimit`).
- Older merkle-service builds needed Teranode v0.15.2 to parse blocks; `latest` works together today. If proofs stop arriving, pin `TERANODE_IMAGE` in `stack/.env`.
