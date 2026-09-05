# Pipe-only helper. Never invoke interactively with real secret data.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Set-StrictMode -Version Latest
$chars = $null
$dataBytes = $null
$entropy = $null
$resultBytes = $null
$exitCode = 0
try {
    if ($args.Count -ne 0) { throw 'INVALID_REQUEST' }
    $chars = [char[]]::new(32769)
    $count = [Console]::In.ReadBlock($chars, 0, $chars.Length)
    if ($count -eq 0 -or $count -gt 32768) { throw 'INVALID_REQUEST' }
    $request = [string]::new($chars, 0, $count) | ConvertFrom-Json
    if (@($request.PSObject.Properties).Count -ne 2 -or
        $request.data -isnot [string] -or $request.purpose -isnot [string] -or
        $request.purpose -cnotmatch '^[A-Za-z0-9][A-Za-z0-9/_:.-]{0,127}$') {
        throw 'INVALID_REQUEST'
    }
    $dataBytes = [Convert]::FromBase64String($request.data)
    if ($dataBytes.Length -eq 0 -or $dataBytes.Length -gt 4096 -or
        [Convert]::ToBase64String($dataBytes) -cne $request.data) {
        throw 'INVALID_REQUEST'
    }
    $entropy = [Text.Encoding]::UTF8.GetBytes('PaySlip/dpapi/v1/' + $request.purpose)
    Add-Type -AssemblyName System.Security
    $resultBytes = [Security.Cryptography.ProtectedData]::Protect(
        $dataBytes, $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)
    if ($resultBytes.Length -eq 0 -or $resultBytes.Length -gt 16384) { throw 'INVALID_RESULT' }
    [Console]::Out.Write([Convert]::ToBase64String($resultBytes))
} catch {
    # Never emit exceptions, request data, stack traces or decrypted bytes.
    [Console]::Error.Write('SECRET_PROTECT_FAILED')
    $exitCode = 1
} finally {
    if ($null -ne $chars) { [Array]::Clear($chars, 0, $chars.Length) }
    if ($null -ne $dataBytes) { [Array]::Clear($dataBytes, 0, $dataBytes.Length) }
    if ($null -ne $entropy) { [Array]::Clear($entropy, 0, $entropy.Length) }
    if ($null -ne $resultBytes) { [Array]::Clear($resultBytes, 0, $resultBytes.Length) }
}
exit $exitCode
