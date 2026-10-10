# Stack layout and operations

Everything lives under `stack/` and is driven by `stack/stack.ps1` (see the README for the command list).

## What runs

| Service | Image | Role |
|---|---|---|
| `teranode1` | `ghcr.io/bsv-blockchain/teranode` | Single private regtest node, started from genesis |
| `merkle-service` | `ghcr.io/bsv-blockchain/merkle-service` | Watches Teranode over P2P and the asset server, builds STUMPs/BUMPs |
| `arcade` | `ghcr.io/bsv-blockchain/arcade` | Transaction broadcast/status API plus embedded chaintracks (headers) |
| `postgres`, `kafka-shared` (Redpanda), `aerospike-1` | upstream images | Teranode's backing stores |
| `block-generator` | `curlimages/curl` | Optional miner (profile `mining`): 10 blocks, then keeps mining. Skipped by `up -NoMine` |

Images and ports are in `stack/.env`; override in the gitignored `stack/.env.local`. The Teranode, merkle-service and Arcade images are pinned by `@sha256` digest to the combination verified together (Oct 2026). The node runs `spv-testnet/teranode:regtest-h1`, built by compose from `stack/teranode/Dockerfile` on the pinned `TERANODE_IMAGE`: the same source commit with regtest's Genesis and Chronicle activation heights set to 1 (upstream: 100 and 200).

## Files

```
stack/stack.ps1                    driver
stack/docker-compose.yml           services above
stack/.env                         image tags and host ports
stack/config/settings.conf         Teranode settings (public regtest keys; see "Settings we override")
stack/config/settings_test.conf    Teranode local overrides (client names, Kafka topics, port prefixes)
stack/config/arcade.yaml           Arcade config
stack/config/merkle.yaml           merkle-service config
stack/config/{postgres,aerospike}  backing store init/config
stack/scripts/generate-blocks.sh   background miner
```

`.gitattributes` forces LF for `.sh`, `.conf`, `.yml`, `.yaml` and `.sql`, because CRLF breaks the Linux containers. Keep it that way when editing on Windows.

## Ports (host)

| Port | Use |
|------|-----|
| 29292 | Teranode RPC (user and password both `bitcoin`) |
| 28090 | Asset server / DataHub at `/api/v1` |
| 28000 | Teranode health |
| 8080 / 8081 | Arcade API / health |
| 8082 | Arcade SSE (`/events?callbackToken=<token>`; published as `ARCADE_SSE_PORT`) |
| 8083 | Arcade chaintracks (`/chaintracks/v2`) |
| 8086 | merkle-service |
| 25433 | Postgres |

These avoid the 19292/18090 range used by older standalone Teranode regtest setups.

## Settings we override in `settings.conf`

Search for the context `.docker.teranode1.test`:

- `asset_httpRateLimit`, `asset_httpHeavyRateLimit` = 0: merkle-service's STUMP builds burst far past the default per-IP limits and would get HTTP 429.
- `rpc_timeout` = 3m and `blockassembly_generateTipWaitTimeout` = 2m: after `invalidateblock`, block assembly resets before `generate` can mine. With the defaults (30 s / 1m30s) `generate` gives up and mines nothing. Raise both together, keeping `rpc_timeout` larger.

## Behaviour worth knowing

- `stack.ps1 up` waits for Arcade's P2P link to Teranode before returning. Chaintracks only learns headers from P2P block announcements and has no catch-up until the next one, so blocks mined before the link is up are missed until another block arrives.
- `down` keeps chain data; `reset` also wipes volumes and `stack/data`, returning to genesis.
- Coinbase maturity is 100 and set by the regtest chain params. The background miner's first 10 blocks are not enough to spend a coinbase; `tests/e2e` mines up to height 110.
- merkle-service was built against Teranode v0.15.2's block format. The pinned digests in `stack/.env` keep the three in step; upgrade them together and re-run `tests/e2e` and `tests/reorg`. If STUMPs/BUMPs stop arriving after an upgrade, pin `TERANODE_IMAGE` back.
