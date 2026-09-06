param([ValidateSet('all','admin','attendance')][string]$Scope='all')
$ErrorActionPreference='Stop'
& node (Join-Path $PSScriptRoot 'local-runtime.cjs') start --scope $Scope
if ($LASTEXITCODE -ne 0) { throw "Pay Slip startup failed: $LASTEXITCODE" }
