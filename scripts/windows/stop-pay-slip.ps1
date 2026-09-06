$ErrorActionPreference='Stop'
& node (Join-Path $PSScriptRoot 'local-runtime.cjs') stop
if ($LASTEXITCODE -ne 0) { throw "Pay Slip stop failed: $LASTEXITCODE" }
