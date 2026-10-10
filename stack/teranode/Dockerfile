# Teranode for the regtest stack with Genesis and Chronicle active from block 1.
#
# Teranode takes its consensus activation heights only from go-chaincfg, chosen by network name; no
# setting overrides them. In go-chaincfg v1.6.2 (what the pinned image uses) regtest activates Genesis
# at 100 and Chronicle at 200, so on a fresh chain anything that needs Chronicle's script rules (b017's
# covenant unlocking scripts use non-push operators) is refused with "Only non-push operators allowed
# in signatures" until height 200. This builds the same Teranode source commit with go-chaincfg's
# regtest heights set to 1 and swaps only the binary into the pinned image (settings, wait.sh and
# libraries stay as published).
#
# Built by `docker compose build teranode1` (stack.ps1 up builds it when missing). To move to a newer
# Teranode, change TERANODE_REV and RUN_IMG together (RUN_IMG must be the image built from that commit:
# `docker image inspect <image> -f '{{index .Config.Labels "org.opencontainers.image.revision"}}'`).
ARG BASE_IMG=ghcr.io/bsv-blockchain/teranode-base@sha256:d88575a38171a7378c334651759d31c5accfd8bf741d31f88379311a946500d6
ARG RUN_IMG=ghcr.io/bsv-blockchain/teranode@sha256:57a6706c069a70470ed9c3a9051cdf6d0074b2cad47de868fc9a331095711e10

FROM ${BASE_IMG} AS build
ARG TERANODE_REV=fffcc4e110622624d35e586ba3e5e15727c6a964
WORKDIR /app
# The build image has no git: BuildKit fetches the commit itself (it fetches the whole repository, ~3 min;
# a first attempt once failed with "Not a valid object name" and succeeded on retry).
ADD --keep-git-dir=false https://github.com/bsv-blockchain/teranode.git#${TERANODE_REV} /app
# The module download takes ~30 min on a cold cache; proxy stream errors are transient: build again.
RUN go mod download
# The go-chaincfg Teranode pins, copied and patched: regtest activates Genesis and Chronicle at block 1.
# The grep fails the build if the patch did not land.
RUN src="$(go list -m -f '{{.Dir}}' github.com/bsv-blockchain/go-chaincfg)" \
 && cp -r "$src" /chaincfg && chmod -R u+w /chaincfg \
 && sed -i '/^var RegressionNetParams = Params{/,/^}/{s/\(GenesisActivationHeight:[[:space:]]*\)[0-9]*/\11/;s/\(ChronicleActivationHeight:[[:space:]]*\)[0-9]*/\11/}' /chaincfg/params.go \
 && sed -n '/^var RegressionNetParams = Params{/,/^}/p' /chaincfg/params.go | grep -E 'GenesisActivationHeight:[[:space:]]+1,' \
 && sed -n '/^var RegressionNetParams = Params{/,/^}/p' /chaincfg/params.go | grep -E 'ChronicleActivationHeight:[[:space:]]+1,' \
 && go mod edit -replace github.com/bsv-blockchain/go-chaincfg=/chaincfg
ENV CGO_ENABLED=1
RUN GIT_COMMIT=${TERANODE_REV} GIT_VERSION=${TERANODE_REV}-regtest-h1 make build-teranode

FROM ${RUN_IMG}
COPY --from=build /app/teranode.run /app/teranode.run
LABEL org.opencontainers.image.description="Teranode with regtest Genesis and Chronicle active from block 1 (spv-testnet stack/teranode)"
