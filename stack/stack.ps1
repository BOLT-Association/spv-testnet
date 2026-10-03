#requires -Version 5.1
<#
.SYNOPSIS
  Drive the ChainBrowsers regtest stack: Teranode (private, from genesis) + merkle-service + Arcade.

.DESCRIPTION
    up [-NoMine]        pull images and start everything (-NoMine skips the block generator)
    down                stop containers (keeps chain data)
    reset               stop and wipe all chain data (back to genesis)
    status              container state + Teranode / Arcade / chaintracks health
    mine [N]            mine N blocks via RPC (default 1)
    rpc <method> [json] raw Teranode RPC call, e.g. rpc getbestblockhash
    info                getinfo
    logs [svc]          tail logs (teranode1|merkle-service|arcade|...)
    invalidate <hash>   invalidateblock (start of a forced reorg, see tests/reorg)
    reconsider <hash>   reconsiderblock

  Config: stack/.env (image versions, ports); override in stack/.env.local.
#>
[CmdletBinding()]
param(
  [Parameter(Position = 0)][string]$Command = 'help',
  [Parameter(Position = 1, ValueFromRemainingArguments = $true)][string[]]$Rest,
  [switch]$NoMine
)
$ErrorActionPreference = 'Stop'
$Dir = $PSScriptRoot

# Merge .env and .env.local so ports/URLs here match what compose sees.
$cfg = @{}
foreach ($f in '.env', '.env.local') {
  $p = Join-Path $Dir $f
  if (Test-Path $p) {
    Get-Content $p | Where-Object { $_ -match '^\s*([A-Z0-9_]+)=(.*)$' } | ForEach-Object { $cfg[$Matches[1]] = $Matches[2].Trim() }
  }
}
function Port($k) { $cfg[$k] }
$RpcUrl = if ($env:RPC_URL) { $env:RPC_URL } else { "http://localhost:$(Port TERANODE_RPC_PORT)" }
$RpcAuth = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes('bitcoin:bitcoin'))

function Dc {
  $ErrorActionPreference = 'Continue'   # docker writes progress to stderr; rely on the exit code
  $files = @('-f', (Join-Path $Dir 'docker-compose.yml'), '--env-file', (Join-Path $Dir '.env'))
  $local = Join-Path $Dir '.env.local'
  if (Test-Path $local) { $files += @('--env-file', $local) }
  & docker compose @files @args
  if ($LASTEXITCODE -ne 0) { throw "docker compose failed (exit $LASTEXITCODE)" }
}

function Invoke-Rpc([string]$Method, [string]$Params = '[]') {
  $r = Invoke-RestMethod -Uri $RpcUrl -Method Post -ContentType 'application/json' `
    -Headers @{ Authorization = $RpcAuth } -Body "{`"method`":`"$Method`",`"params`":$Params}"
  $r | ConvertTo-Json -Depth 10
}

function Probe($label, $url) {
  try { Write-Host ("{0,-22} OK   {1}" -f $label, ((Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 $url).Content -replace '\s+', ' ')) }
  catch { Write-Host ("{0,-22} DOWN {1}" -f $label, $url) -ForegroundColor Yellow }
}

switch ($Command.ToLower()) {
  'up' {
    $profileArgs = if ($NoMine) { @() } else { @('--profile', 'mining') }
    Dc pull --ignore-buildable
    Dc @profileArgs up -d
    Write-Host "`nStack starting. Check with: .\stack.ps1 status"
    Write-Host "  Teranode RPC  $RpcUrl (bitcoin/bitcoin)"
    Write-Host "  Asset server  http://localhost:$(Port TERANODE_ASSET_PORT)"
    Write-Host "  Arcade        http://localhost:$(Port ARCADE_API_PORT)   chaintracks :$(Port ARCADE_CHAINTRACKS_PORT)"
  }
  'down' { Dc --profile mining down }
  'reset' {
    Dc --profile mining down -v
    $data = Join-Path $Dir 'data'
    if (Test-Path $data) { Remove-Item -Recurse -Force $data }
    Write-Host 'Chain data wiped; next `up` starts from genesis.'
  }
  'status' {
    Dc ps -a
    Write-Host ''
    try { Write-Host ("teranode getinfo       " + ((Invoke-Rpc getinfo) -replace '\s+', ' ')) } catch { Write-Host 'teranode RPC           DOWN' -ForegroundColor Yellow }
    Probe 'arcade health' "http://localhost:$(Port ARCADE_HEALTH_PORT)/health"
    Probe 'chaintracks height' "http://localhost:$(Port ARCADE_CHAINTRACKS_PORT)/chaintracks/v2/height"
    Probe 'merkle-service' "http://localhost:$(Port MERKLE_PORT)/health"
  }
  'mine' { Invoke-Rpc generate "[$(if ($Rest) { $Rest[0] } else { 1 })]" }
  'info' { Invoke-Rpc getinfo }
  'rpc' {
    if (-not $Rest) { throw 'usage: rpc <method> [json-params]' }
    Invoke-Rpc $Rest[0] $(if ($Rest.Count -ge 2) { $Rest[1] } else { '[]' })
  }
  'invalidate' { Invoke-Rpc invalidateblock "[`"$($Rest[0])`"]" }
  'reconsider' { Invoke-Rpc reconsiderblock "[`"$($Rest[0])`"]" }
  'logs' { Dc logs -f --tail 80 $(if ($Rest) { $Rest[0] } else { 'teranode1' }) }
  default { Get-Help $PSCommandPath -Detailed }
}
