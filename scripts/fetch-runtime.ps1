param(
    [string]$PythonVersion = "3.11.9",
    [string]$NodeVersion = "v22.19.0",   # SINGLE SOURCE OF TRUTH for the Node pin
    [string]$OutputDirectory = ""
)

# Downloads the portable runtimes used by the desktop installer:
#   - official python.org NuGet package (full, relocatable Python, no MSI)
#   - official Node.js Windows zip
#   - Microsoft WebView2 Evergreen bootstrapper
# Build-time only: end users never run this script.
#
# The two versions above are the ONE place a runtime version is written down.
# scripts\runtime-common.ps1 reads the Node pin back out of this file
# (Get-IAPinnedNodeVersion) and bundle-runtime.ps1 / build-windows-release.ps1 /
# release-check.ps1 all consume it, so those scripts can no longer drift to a
# different Node than the one downloaded here.

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $projectRoot "build\runtime-downloads" }
$OutputDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

$ProgressPreference = "SilentlyContinue"
$pythonFile = Join-Path $OutputDirectory "python-$PythonVersion.nupkg"
$nodeFile = Join-Path $OutputDirectory "node-$NodeVersion-win-x64.zip"
$webviewFile = Join-Path $OutputDirectory "MicrosoftEdgeWebview2Setup.exe"

if (-not (Test-Path $pythonFile)) {
    Write-Host "Downloading python.org NuGet package $PythonVersion ..."
    Invoke-WebRequest -Uri "https://www.nuget.org/api/v2/package/python/$PythonVersion" -OutFile $pythonFile
}
if (-not (Test-Path $nodeFile)) {
    Write-Host "Downloading Node.js $NodeVersion ..."
    Invoke-WebRequest -Uri "https://nodejs.org/dist/$NodeVersion/node-$NodeVersion-win-x64.zip" -OutFile $nodeFile
}
if (-not (Test-Path $webviewFile)) {
    Write-Host "Downloading WebView2 Evergreen bootstrapper ..."
    Invoke-WebRequest -Uri "https://go.microsoft.com/fwlink/p/?LinkId=2124703" -OutFile $webviewFile
}

Write-Host "Runtime bundles ready in $OutputDirectory"
Get-ChildItem $OutputDirectory | ForEach-Object {
    Write-Host ("  {0}  {1:N1} MB" -f $_.Name, ($_.Length / 1MB))
}
