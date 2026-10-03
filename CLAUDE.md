# Notes for Claude

Local regtest SPV test stack (Teranode + merkle-service + Arcade). See `README.md` for usage and `docs/stack.md` for layout. This file holds only what is not obvious from those or the code.

## Working agreements

- Commit when asked; **never push without asking** each time. Approval to push once does not carry over.
- End commits with the `Co-Authored-By` line from the session's attribution reminder.
- The user is on Windows (PowerShell primary). `stack.ps1` is CRLF, `.sh`/`.conf`/`.yml`/`.yaml`/`.sql` are LF (`.gitattributes`); the "LF will be replaced by CRLF" git warning is harmless.

## Verified findings (Oct 2026, `:latest` images)

- **Reorg stall root cause:** after `invalidateblock`, block assembly resets and reconciles before `generate` can mine. Defaults (`rpc_timeout` 30s, `blockassembly_generateTipWaitTimeout` 1m30s) make `generate` give up. Fixed by raising both in `stack/config/settings.conf` (3m / 2m, keep `rpc_timeout` larger). Teranode's own error message says this. Settings only apply after `reset` + `up`.
- **Chaintracks startup race:** Arcade's chaintracks learns headers only from P2P block announcements and does not catch up until the next one. Blocks mined before Arcade's P2P link is up are missed. `stack.ps1 up` now waits for the Arcade log line `All bootstrap peers connected`. If you see chaintracks stuck behind the node, mine one more block.
- **The 401 every 30s is harmless:** it is Arcade's DataHub probe of `GET /api/v1/health`, which Teranode's asset server rejects for unsigned clients (admin key and `asset_peerAuthAllowlist` do not help). Data routes (`/bestblockheader`, `/block/...`) work unauthenticated. It is unrelated to the chaintracks race.
- **Teranode RPC quirks:** `getrawmempool` returns a placeholder hash (not a real mempool), so it cannot be polled to know a tx reached block assembly; `getblockcount` and `getblocktemplate` are unimplemented (use `getinfo`). That is why `tests/e2e/tx-roundtrip.mjs` keeps a sleep + retry.
- `generate-blocks.sh` defaults to `INITIAL_BLOCKS=100`, but compose passes `--initialBlocks 10`, so `up` mines 10 (README is right). Coinbase maturity is 100 regardless; the round-trip test mines to height 110.

## Operating tips

- Waiting for the stack: poll Teranode RPC (`getinfo`) from bash rather than sleeping in PowerShell. `stack.ps1 rpc` throws if RPC is not up yet.
- Reorg test needs `up -NoMine`; it passes repeatedly on one chain without `reset`.
- Quick check after changes: `reset`, `up -NoMine`, `node tests/reorg/reorg.mjs`, then `cd tests/e2e; npm run roundtrip`.
