# Shared runtime manifest for the build / release scripts.
#
# SINGLE SOURCE OF TRUTH
#   The pinned portable-runtime versions live in exactly one place: the
#   parameter block of scripts\fetch-runtime.ps1 (the downloader). Nothing else
#   may hard-code a runtime version or a Node extraction sub-directory.
#   Get-IAPinnedNodeVersion() below reads that pin and FAILS LOUDLY when the
#   declaration shape changes, so a silent fallback can never reintroduce the
#   drift this file exists to prevent (build-windows-release.ps1 used to pin
#   Node v20.18.1 in a version-named sub-directory while fetch-runtime.ps1
#   downloaded v22.19.0 and bundle-runtime.ps1 flattened it).
#
# EXTRACTION LAYOUT (produced by scripts\bundle-runtime.ps1:45-58, consumed by
# scripts\build-windows-release.ps1 and installer\InvestmentAuto.iss:41)
#   build\runtime\python\python.exe    flattened CPython
#   build\runtime\node\node.exe        flattened Node.js - NO version sub-dir
#
# Consumers: bundle-runtime.ps1, build-windows-release.ps1, release-check.ps1

$IAScriptsDir = $PSScriptRoot
$IAProjectRoot = Split-Path -Parent $IAScriptsDir

function Get-IAPinnedNodeVersion {
    <#
      Returns the Node.js version pinned by fetch-runtime.ps1, e.g. "v22.19.0".
      Anchored to the parameter declaration on purpose: if the line is ever
      reformatted the parse throws instead of returning a stale default.
    #>
    $fetch = Join-Path $IAScriptsDir "fetch-runtime.ps1"
    if (-not (Test-Path -LiteralPath $fetch)) {
        throw "runtime pin source is missing: $fetch"
    }
    $text = [System.IO.File]::ReadAllText($fetch)
    $match = [regex]::Match($text, '(?m)^\s*\[string\]\$NodeVersion\s*=\s*"([^"]+)"')
    if (-not $match.Success) {
        throw ("cannot read the pinned Node version from {0}: expected a parameter line " +
               "like [string]`$NodeVersion = `"v22.19.0`"" -f $fetch)
    }
    return $match.Groups[1].Value
}

function Get-IAPinnedPythonVersion {
    <# Returns the CPython version pinned by fetch-runtime.ps1, e.g. "3.11.9". #>
    $fetch = Join-Path $IAScriptsDir "fetch-runtime.ps1"
    if (-not (Test-Path -LiteralPath $fetch)) {
        throw "runtime pin source is missing: $fetch"
    }
    $text = [System.IO.File]::ReadAllText($fetch)
    $match = [regex]::Match($text, '(?m)^\s*\[string\]\$PythonVersion\s*=\s*"([^"]+)"')
    if (-not $match.Success) {
        throw "cannot read the pinned Python version from $fetch"
    }
    return $match.Groups[1].Value
}

function Get-IANodeRuntimeDir {
    param([string]$ProjectRoot = $IAProjectRoot)
    return (Join-Path $ProjectRoot "build\runtime\node")
}

function Get-IAPythonRuntimeDir {
    param([string]$ProjectRoot = $IAProjectRoot)
    return (Join-Path $ProjectRoot "build\runtime\python")
}

function Get-IABundledNodeExe {
    <# Absolute path to the bundled node.exe, or $null when not bundled yet. #>
    param([string]$ProjectRoot = $IAProjectRoot)
    $exe = Join-Path (Get-IANodeRuntimeDir $ProjectRoot) "node.exe"
    if (Test-Path -LiteralPath $exe) { return $exe }
    return $null
}

function Resolve-IANodeExe {
    <#
      Node interpreter for build gates: the bundled runtime when it exists
      (that is what ships), otherwise the one on PATH. Returns a hashtable so
      callers can report which one was used instead of hiding the difference.
    #>
    param([string]$ProjectRoot = $IAProjectRoot)
    $bundled = Get-IABundledNodeExe -ProjectRoot $ProjectRoot
    if ($bundled) {
        return @{ Exe = $bundled; Bundled = $true; Source = "build\runtime\node\node.exe" }
    }
    return @{ Exe = "node"; Bundled = $false; Source = "PATH" }
}
