# Local private teranode regtest chain

Source: `BOLT-Stack-Demo/external/teranode/compose/docker-compose-regtest.yml`.
A standalone copy lives at `C:\Users\honoh\Code\teranode-regtest-bundle` (outside the repo, about 125 KB).

## What it is

A single private regtest teranode, started from genesis, with its own Postgres, Redpanda (Kafka) and Aerospike. A block-generator container mines 10 blocks and then keeps mining. It uses a prebuilt image, so none of the Go source in `external/teranode` is needed.

P2P is turned ON in the compose file so a local Arcade can track blocks over libp2p. It is still a single private node, with legacy sync off.

## Files to copy

Keep this layout. `regtest.ps1` looks for `settings.conf` one level above `compose/`.

```
settings.conf
compose/docker-compose-regtest.yml
compose/regtest.ps1
compose/settings_test.conf
compose/scripts/generate-blocks.sh
compose/postgres/init.sql
compose/aerospike/aerospike-1.conf
```

## Run

Prereq: Docker, and an image tagged `teranode:latest`.

```
docker pull ghcr.io/f1r3hydr4nt/teranode-privregtest:latest
docker tag ghcr.io/f1r3hydr4nt/teranode-privregtest:latest teranode:latest
.\compose\regtest.ps1 up
```

Other commands: `down`, `reset` (wipes `data\regtest`, back to genesis), `restart`, `status`, `logs [svc]`, `mine [N]`, `info`, `rpc <method> [json-params]`.

Always start through `regtest.ps1`, not plain `docker compose`. The script writes line-ending-normalised copies of `settings.conf`, `settings_test.conf` and `generate-blocks.sh` into `data\regtest\mounts`, because CRLF breaks the Linux containers.

## Ports

| Port | Use |
|------|-----|
| 19292 | RPC (user and password both `bitcoin`) |
| 18090 | Dashboard / asset server (datahub at `/api/v1`) |
| 18000 | Health |
| 18081-18092 | Other teranode service ports |
| 15433 | Postgres |

## Not in the bundle

Arcade, merkle-service and the wapps are driven by `BOLT-Stack-Demo/stack.ps1`:

- It pins teranode to the v0.15.2-compatible image above, because merkle-service's P2P client needs that BlockMessage format.
- It launches merkle-service from PowerShell, because Git Bash mangles the `/dns4/...` bootstrap multiaddr.
- Arcade config is `BOLT-Stack-Demo/arcade-regtest/config.regtest.yaml` and merkle-service config is `BOLT-Stack-Demo/merkle-regtest/config.yaml`.
- The existing chain state in `external/teranode/data` (9.2 GB) is not copied. A fresh copy starts a new chain.
