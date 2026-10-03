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

- **Images are pinned by digest** in `stack/.env` (teranode, merkle-service, arcade; verified together Oct 2026). To upgrade, change all three, then `reset`, `up -NoMine`, and re-run reorg + roundtrip. Get digests from `docker image inspect <id> -f '{{json .RepoDigests}}'`.

## What wallets/browsers need from this stack (found building Hodos spv mode, Oct 2026)

- **Arcade SSE is a separate listener** (`sse` service, default `:8082`, started in `mode: all` but not exposed by default). The stack publishes it as `ARCADE_SSE_PORT` (`.env`) -> `8082`; after changing ports run `docker compose --env-file .env -f docker-compose.yml up -d arcade` (the chain data volumes persist). Frames: `id:` / `event: status` / `data: {txid, txStatus, ...}`; `: keepalive` every 15 s; the MINED frame carries `blockHash`, `blockHeight`, `merklePath`; `Last-Event-ID` replay is best-effort. Events only for txs submitted with the same `X-CallbackToken`.
- **`POST /tx` takes raw or Extended Format, not BEEF** (it parses with `NewTransactionFromStream`). It returns `202` even for a tx that is rejected a moment later (e.g. a coinbase already spent), so check the status afterwards.
- **First-seen:** a conflicting tx ends `REJECTED` and the original stays `SEEN_ON_NETWORK`; the original is not flagged `DOUBLE_SPEND_ATTEMPTED` on this single node. A child of an unmined parent stays `ACCEPTED_BY_NETWORK` until a block.
- **Arcade embeds go-chaintracks** (headers stored in the `chaintracks-data` volume, served at `/chaintracks/v1|v2`, bulk `/headers`); no separate block-headers-service or chaintracks container is needed.
- **`block-generator` keeps mining every few seconds**, so any test that needs an unmined tx must `docker stop cb-block-generator` first and mine with RPC `generate`; `docker start cb-block-generator` afterwards.
- Arcade's `/policy` reports `miningFee` 0 sat/KB; clients with a fee sanity range may reject it.

## Operating tips

- Waiting for the stack: poll Teranode RPC (`getinfo`) from bash rather than sleeping in PowerShell. `stack.ps1 rpc` throws if RPC is not up yet.
- Don't pipe `stack.ps1 up` through `Select-Object -First N`: it ends the pipeline early and kills `up` partway.
- Reorg test needs `up -NoMine`; it passes repeatedly on one chain without `reset`.
- Quick check after changes: `reset`, `up -NoMine`, `node tests/reorg/reorg.mjs`, then `cd tests/e2e; npm run roundtrip`.
