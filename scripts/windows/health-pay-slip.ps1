$ErrorActionPreference='Stop'
& node (Join-Path $PSScriptRoot 'local-runtime.cjs') health
if ($LASTEXITCODE -ne 0) { throw 'Pay Slip is not healthy' }
