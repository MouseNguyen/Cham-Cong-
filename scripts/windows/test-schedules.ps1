$ErrorActionPreference='Stop'
& (Join-Path $PSScriptRoot 'test-database.ps1') -Mode Green -TaskId PAY-W3-01b
