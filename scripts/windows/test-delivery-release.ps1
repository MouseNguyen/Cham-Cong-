param([ValidateSet('Red','Green')][string]$Mode='Green')
$ErrorActionPreference='Stop'
& "$PSScriptRoot/test-database.ps1" -Mode $Mode -TaskId PAY-W6-02b
