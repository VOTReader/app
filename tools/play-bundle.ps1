<#
.SYNOPSIS
Build the signed Play Store bundle (com.votreader.app): .\tools\play-bundle.ps1

.DESCRIPTION
ln5 (2026-10-05). Decrypts the upload-key password from the machine's DPAPI secret store
(D:\AgentBackbone\secrets\secrets.xml, key VOT_UPLOAD_PASSWORD; readable only by Corbin's
Windows account on this laptop) into this process's environment, runs
`gradlew :app:bundleStore`, checks the bundle's signer, and prints the AAB path. The password
is never printed or written anywhere. Never install a store-signed build on Corbin's Pixel.
See docs/PLAY.md.

.PARAMETER VersionCode
Pin a versionCode instead of the default UTC build hour (yyMMddHH).
#>
param([int]$VersionCode = 0)

$ErrorActionPreference = 'Stop'
$repo  = Split-Path -Parent $PSScriptRoot
$store = 'D:\AgentBackbone\secrets\secrets.xml'
$bag = Import-Clixml $store
if (-not $bag.ContainsKey('VOT_UPLOAD_PASSWORD')) { throw "VOT_UPLOAD_PASSWORD is not in $store (docs/PLAY.md)" }
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR((ConvertTo-SecureString $bag['VOT_UPLOAD_PASSWORD']))
try {
    $env:VOT_UPLOAD_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
    $gradleArgs = @(':app:bundleStore')
    if ($VersionCode -gt 0) { $gradleArgs += "-Pvot.versionCode=$VersionCode" }
    Push-Location $repo
    # Gradle writes progress to stderr; under 'Stop' PowerShell 5.1 would abort on the first line.
    $ErrorActionPreference = 'Continue'
    try { & .\gradlew.bat @gradleArgs 2>&1 | ForEach-Object { "$_" } }
    finally { Pop-Location; $ErrorActionPreference = 'Stop' }
    if ($LASTEXITCODE -ne 0) { throw "gradlew exit $LASTEXITCODE" }
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    Remove-Item Env:VOT_UPLOAD_PASSWORD -ErrorAction SilentlyContinue
}

# The bundle lands under the module's build dir, which local.properties may relocate (vot.buildDir).
$aab = Get-ChildItem -Recurse -Filter 'app-store.aab' -Path @(
    (Join-Path $repo 'app\build'),
    (Join-Path 'D:\VOTReader-build' (Split-Path -Leaf $repo))
) -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $aab) { throw 'bundleStore succeeded but app-store.aab was not found' }
$ErrorActionPreference = 'Continue'
$signer = & jarsigner -verify -verbose:summary -certs $aab.FullName 2>&1 | Select-String 'CN=' | Select-Object -First 1
if ("$signer" -notmatch 'CN=VOTReader') { throw "unexpected signer: $signer" }
"signed by: $("$signer".Trim())"
$aab.FullName
exit 0
