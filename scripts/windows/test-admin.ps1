param([ValidateSet('Red','Green')][string]$Mode='Green', [switch]$Browser)
$ErrorActionPreference='Stop'
& (Join-Path $PSScriptRoot 'test-database.ps1') -Mode $Mode -TaskId PAY-W5-02a -Browser:$Browser
