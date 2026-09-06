param([ValidateSet('Red','Green')][string]$Mode='Green')
$ErrorActionPreference='Stop'
& (Join-Path $PSScriptRoot 'test-database.ps1') -Mode $Mode -TaskId PAY-W4-01
