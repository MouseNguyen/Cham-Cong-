param([switch]$Browser)
$ErrorActionPreference='Stop'
& (Join-Path $PSScriptRoot 'test-database.ps1') -Mode Green -TaskId PAY-W2-02 -Browser:$Browser
