[CmdletBinding(DefaultParameterSetName = 'Controller')]
param(
    [Parameter(Mandatory = $true, ParameterSetName = 'Worker')]
    [switch]$Worker,

    [Parameter(Mandatory = $true, ParameterSetName = 'Worker')]
    [ValidatePattern('^PaySlip-DPAPI-Identity-[a-f0-9]{32}-Pipe$')]
    [string]$PipeName,

    [Parameter(Mandatory = $true, ParameterSetName = 'Worker')]
    [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9/_:.-]{0,127}$')]
    [string]$Purpose
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Set-StrictMode -Version Latest

$localServiceSid = 'S-1-5-19'
$canonicalLocalServiceName = 'NT AUTHORITY\LOCAL SERVICE'

function Clear-ByteArray {
    param([byte[]]$Bytes)

    if ($null -ne $Bytes) {
        [Array]::Clear($Bytes, 0, $Bytes.Length)
    }
}

function New-SyntheticBytes {
    param([int]$Length)

    $bytes = [byte[]]::new($Length)
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()

    try {
        $rng.GetBytes($bytes)
    }
    finally {
        $rng.Dispose()
    }

    return $bytes
}

function Test-ByteArraysEqual {
    param(
        [byte[]]$Left,
        [byte[]]$Right
    )

    if ($null -eq $Left -or
        $null -eq $Right -or
        $Left.Length -ne $Right.Length) {
        return $false
    }

    $different = 0

    for ($index = 0; $index -lt $Left.Length; $index++) {
        $different = $different -bor ($Left[$index] -bxor $Right[$index])
    }

    return $different -eq 0
}

function Get-PurposeEntropy {
    param([string]$Value)

    return [Text.Encoding]::UTF8.GetBytes(
        'PaySlip/dpapi/v1/' + $Value
    )
}

function Invoke-LocalServiceWorker {
    param(
        [string]$WorkerPipeName,
        [string]$WorkerPurpose
    )

    $client = $null
    $reader = $null
    $writer = $null
    $foreignCiphertext = $null
    $entropy = $null
    $localPlaintext = $null
    $localCiphertext = $null
    $localRestored = $null
    $unexpectedPlaintext = $null

    try {
        Add-Type -AssemblyName System.Security

        $identity = [Security.Principal.WindowsIdentity]::GetCurrent()

        if ($null -eq $identity.User -or
            $identity.User.Value -cne $localServiceSid) {
            throw 'WRONG_WORKER_IDENTITY'
        }

        $client = [IO.Pipes.NamedPipeClientStream]::new(
            '.',
            $WorkerPipeName,
            [IO.Pipes.PipeDirection]::InOut,
            [IO.Pipes.PipeOptions]::Asynchronous
        )

        $client.Connect(15000)

        $encoding = [Text.UTF8Encoding]::new($false)
        $reader = [IO.StreamReader]::new(
            $client,
            $encoding,
            $false,
            4096,
            $true
        )
        $writer = [IO.StreamWriter]::new(
            $client,
            $encoding,
            4096,
            $true
        )
        $writer.AutoFlush = $true

        $requestLine = $reader.ReadLine()

        if ([string]::IsNullOrWhiteSpace($requestLine) -or
            $requestLine.Length -gt 32768) {
            throw 'INVALID_REQUEST'
        }

        $request = $requestLine | ConvertFrom-Json

        if (@($request.PSObject.Properties).Count -ne 2 -or
            $request.data -isnot [string] -or
            $request.purpose -isnot [string] -or
            $request.purpose -cne $WorkerPurpose) {
            throw 'INVALID_REQUEST'
        }

        $foreignCiphertext = [Convert]::FromBase64String($request.data)

        if ($foreignCiphertext.Length -eq 0 -or
            $foreignCiphertext.Length -gt 16384 -or
            [Convert]::ToBase64String($foreignCiphertext) -cne $request.data) {
            throw 'INVALID_REQUEST'
        }

        $entropy = Get-PurposeEntropy -Value $WorkerPurpose
        $localPlaintext = New-SyntheticBytes -Length 32

        $localCiphertext =
            [Security.Cryptography.ProtectedData]::Protect(
                $localPlaintext,
                $entropy,
                [Security.Cryptography.DataProtectionScope]::CurrentUser
            )

        $localRestored =
            [Security.Cryptography.ProtectedData]::Unprotect(
                $localCiphertext,
                $entropy,
                [Security.Cryptography.DataProtectionScope]::CurrentUser
            )

        $selfRoundtrip = Test-ByteArraysEqual `
            -Left $localPlaintext `
            -Right $localRestored

        $rejectedInteractiveCiphertext = $false

        try {
            $unexpectedPlaintext =
                [Security.Cryptography.ProtectedData]::Unprotect(
                    $foreignCiphertext,
                    $entropy,
                    [Security.Cryptography.DataProtectionScope]::CurrentUser
                )
        }
        catch [Security.Cryptography.CryptographicException] {
            $rejectedInteractiveCiphertext = $true
        }

        $response = [ordered]@{
            worker = [ordered]@{
                account = $canonicalLocalServiceName
                sid = $localServiceSid
            }
            localService = [ordered]@{
                selfRoundtrip = $selfRoundtrip
                rejectedInteractiveCiphertext =
                    $rejectedInteractiveCiphertext
            }
        }

        $writer.WriteLine(
            ($response | ConvertTo-Json -Compress -Depth 5)
        )
    }
    finally {
        Clear-ByteArray -Bytes $foreignCiphertext
        Clear-ByteArray -Bytes $entropy
        Clear-ByteArray -Bytes $localPlaintext
        Clear-ByteArray -Bytes $localCiphertext
        Clear-ByteArray -Bytes $localRestored
        Clear-ByteArray -Bytes $unexpectedPlaintext

        if ($null -ne $writer) {
            $writer.Dispose()
        }

        if ($null -ne $reader) {
            $reader.Dispose()
        }

        if ($null -ne $client) {
            $client.Dispose()
        }
    }
}

if ($Worker) {
    try {
        Invoke-LocalServiceWorker `
            -WorkerPipeName $PipeName `
            -WorkerPurpose $Purpose

        exit 0
    }
    catch {
        # Never emit exception details or payloads from the worker.
        exit 1
    }
}

$taskName = 'PaySlip-DPAPI-Identity-' +
    [Guid]::NewGuid().ToString('N')
$controllerPipeName = $taskName + '-Pipe'
$controllerPurpose = 'test/identity-v1'

$server = $null
$reader = $null
$writer = $null
$connectResult = $null
$currentPlaintext = $null
$currentCiphertext = $null
$currentRestored = $null
$entropy = $null
$workerReport = $null
$createdCount = 0
$registered = $false
$cleanupFailed = $false
$controllerFailed = $false
$aclRestricted = $false
$currentRoundtrip = $false

try {
    Add-Type -AssemblyName System.Security

    $currentIdentity =
        [Security.Principal.WindowsIdentity]::GetCurrent()

    if ($null -eq $currentIdentity.User -or
        $currentIdentity.User.Value -ceq $localServiceSid) {
        throw 'INVALID_CONTROLLER_IDENTITY'
    }

    $principal =
        [Security.Principal.WindowsPrincipal]::new($currentIdentity)

    if (-not $principal.IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator
    )) {
        throw 'ADMIN_REQUIRED'
    }

    $currentSid = $currentIdentity.User
    $serviceSid =
        [Security.Principal.SecurityIdentifier]::new(
            $localServiceSid
        )

    $pipeSecurity = [IO.Pipes.PipeSecurity]::new()
    $pipeSecurity.SetAccessRuleProtection($true, $false)
    $pipeSecurity.SetOwner($currentSid)

    $pipeSecurity.AddAccessRule(
        [IO.Pipes.PipeAccessRule]::new(
            $currentSid,
            [IO.Pipes.PipeAccessRights]::FullControl,
            [Security.AccessControl.AccessControlType]::Allow
        )
    )

    $pipeSecurity.AddAccessRule(
        [IO.Pipes.PipeAccessRule]::new(
            $serviceSid,
            [IO.Pipes.PipeAccessRights]::ReadWrite,
            [Security.AccessControl.AccessControlType]::Allow
        )
    )

    $server = [IO.Pipes.NamedPipeServerStream]::new(
        $controllerPipeName,
        [IO.Pipes.PipeDirection]::InOut,
        1,
        [IO.Pipes.PipeTransmissionMode]::Byte,
        [IO.Pipes.PipeOptions]::Asynchronous,
        4096,
        4096,
        $pipeSecurity
    )

    $actualSecurity = $server.GetAccessControl()
    $actualRules = @(
        $actualSecurity.GetAccessRules(
            $true,
            $false,
            [Security.Principal.SecurityIdentifier]
        )
    )

    $actualSids = @(
        $actualRules |
            ForEach-Object { $_.IdentityReference.Value } |
            Sort-Object -Unique
    )

    $nonAllowRules = @(
        $actualRules |
            Where-Object {
                $_.AccessControlType -ne
                    [Security.AccessControl.AccessControlType]::Allow
            }
    )

    $aclRestricted =
        $actualSids.Count -eq 2 -and
        $actualSids -contains $currentSid.Value -and
        $actualSids -contains $localServiceSid -and
        $nonAllowRules.Count -eq 0

    if (-not $aclRestricted) {
        throw 'PIPE_ACL_FAILED'
    }

    $entropy = Get-PurposeEntropy -Value $controllerPurpose
    $currentPlaintext = New-SyntheticBytes -Length 48

    $currentCiphertext =
        [Security.Cryptography.ProtectedData]::Protect(
            $currentPlaintext,
            $entropy,
            [Security.Cryptography.DataProtectionScope]::CurrentUser
        )

    $currentRestored =
        [Security.Cryptography.ProtectedData]::Unprotect(
            $currentCiphertext,
            $entropy,
            [Security.Cryptography.DataProtectionScope]::CurrentUser
        )

    $currentRoundtrip = Test-ByteArraysEqual `
        -Left $currentPlaintext `
        -Right $currentRestored

    if (-not $currentRoundtrip) {
        throw 'CONTROLLER_ROUNDTRIP_FAILED'
    }

    $scriptPath = $MyInvocation.MyCommand.Path
    $workingDirectory = Split-Path -Parent (
        Split-Path -Parent (Split-Path -Parent $scriptPath)
    )

    $powershellPath = Join-Path `
        $env:SystemRoot `
        'System32\WindowsPowerShell\v1.0\powershell.exe'

    $actionArguments = (
        '-NoLogo -NoProfile -NonInteractive ' +
        '-ExecutionPolicy Bypass ' +
        '-File "{0}" -Worker -PipeName "{1}" -Purpose "{2}"'
    ) -f $scriptPath, $controllerPipeName, $controllerPurpose

    $action = New-ScheduledTaskAction `
        -Execute $powershellPath `
        -Argument $actionArguments `
        -WorkingDirectory $workingDirectory

    $trigger = New-ScheduledTaskTrigger `
        -Once `
        -At ((Get-Date).AddMinutes(5))

    $taskPrincipal = New-ScheduledTaskPrincipal `
        -UserId $canonicalLocalServiceName `
        -LogonType ServiceAccount `
        -RunLevel Highest

    $settings = New-ScheduledTaskSettingsSet `
        -ExecutionTimeLimit (New-TimeSpan -Minutes 1) `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries

    Register-ScheduledTask `
        -TaskName $taskName `
        -Action $action `
        -Trigger $trigger `
        -Principal $taskPrincipal `
        -Settings $settings `
        -Force |
        Out-Null

    $registered = $true

    $createdCount = @(
        Get-ScheduledTask `
            -TaskName $taskName `
            -ErrorAction Stop
    ).Count

    if ($createdCount -ne 1) {
        throw 'TASK_COUNT_FAILED'
    }

    $connectResult = $server.BeginWaitForConnection($null, $null)

    Start-ScheduledTask `
        -TaskName $taskName `
        -ErrorAction Stop

    if (-not $connectResult.AsyncWaitHandle.WaitOne(20000)) {
        throw 'PIPE_CONNECT_TIMEOUT'
    }

    $server.EndWaitForConnection($connectResult)

    $encoding = [Text.UTF8Encoding]::new($false)
    $reader = [IO.StreamReader]::new(
        $server,
        $encoding,
        $false,
        4096,
        $true
    )
    $writer = [IO.StreamWriter]::new(
        $server,
        $encoding,
        4096,
        $true
    )
    $writer.AutoFlush = $true

    $request = [ordered]@{
        data = [Convert]::ToBase64String($currentCiphertext)
        purpose = $controllerPurpose
    }

    $writer.WriteLine(
        ($request | ConvertTo-Json -Compress -Depth 3)
    )

    $readTask = $reader.ReadLineAsync()

    if (-not $readTask.Wait(20000)) {
        throw 'PIPE_RESPONSE_TIMEOUT'
    }

    $responseLine = $readTask.Result

    if ([string]::IsNullOrWhiteSpace($responseLine) -or
        $responseLine.Length -gt 8192) {
        throw 'INVALID_WORKER_RESPONSE'
    }

    $workerReport = $responseLine | ConvertFrom-Json

    if ($workerReport.worker.account -cne
            $canonicalLocalServiceName -or
        $workerReport.worker.sid -cne $localServiceSid) {
        throw 'WRONG_WORKER_RESPONSE'
    }
}
catch {
    # Preserve only a generic failure state.
    $controllerFailed = $true
}
finally {
    Clear-ByteArray -Bytes $currentPlaintext
    Clear-ByteArray -Bytes $currentCiphertext
    Clear-ByteArray -Bytes $currentRestored
    Clear-ByteArray -Bytes $entropy

    if ($null -ne $writer) {
        $writer.Dispose()
    }

    if ($null -ne $reader) {
        $reader.Dispose()
    }

    if ($null -ne $server) {
        $server.Dispose()
    }

    if ($null -ne $connectResult) {
        $connectResult.AsyncWaitHandle.Dispose()
    }

    if ($registered) {
        try {
            $ownedTask = Get-ScheduledTask `
                -TaskName $taskName `
                -ErrorAction SilentlyContinue

            if ($null -ne $ownedTask -and
                $ownedTask.State -eq 'Running') {
                Stop-ScheduledTask `
                    -TaskName $taskName `
                    -ErrorAction Stop
            }
        }
        catch {
            $cleanupFailed = $true
        }

        try {
            Unregister-ScheduledTask `
                -TaskName $taskName `
                -Confirm:$false `
                -ErrorAction Stop
        }
        catch {
            $cleanupFailed = $true
        }
    }
}

$residueCount = @(
    Get-ScheduledTask `
        -TaskName $taskName `
        -ErrorAction SilentlyContinue
).Count

if ($residueCount -ne 0) {
    $cleanupFailed = $true
}

if ($controllerFailed -or
    $cleanupFailed -or
    $null -eq $workerReport) {
    [Console]::Error.Write('IDENTITY_CANARY_FAILED')
    exit 1
}

$report = [ordered]@{
    schemaVersion = 1
    currentInteractiveIdentity = [ordered]@{
        selected = $true
        tested = $currentRoundtrip
    }
    worker = [ordered]@{
        account = $workerReport.worker.account
        sid = $workerReport.worker.sid
    }
    localService = [ordered]@{
        selfRoundtrip =
            [bool]$workerReport.localService.selfRoundtrip
        rejectedInteractiveCiphertext =
            [bool]$workerReport.localService.rejectedInteractiveCiphertext
    }
    namedPipe = [ordered]@{
        aclRestrictedToCurrentUserAndLocalService = $aclRestricted
    }
    scheduledTask = [ordered]@{
        createdCount = $createdCount
        cleanup = 'passed'
        residueCount = $residueCount
    }
    redaction = [ordered]@{
        plaintextPersisted = $false
        ciphertextPersisted = $false
        secretInArguments = $false
    }
}

[Console]::Out.Write(
    ($report | ConvertTo-Json -Compress -Depth 6)
)

exit 0
