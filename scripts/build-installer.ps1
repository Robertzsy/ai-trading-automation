param([string]$Compiler = "")
$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
& (Join-Path $projectRoot "build/runtime/python/python.exe") (Join-Path $PSScriptRoot "verify-release-source.py")
if ($LASTEXITCODE -ne 0) { throw "Release source validation failed" }
if (-not $Compiler) {
    $candidates = @(
        (Join-Path ${env:ProgramFiles(x86)} "Inno Setup 6/ISCC.exe"),
        (Join-Path $env:LOCALAPPDATA "Programs/Inno Setup 6/ISCC.exe")
    )
    $Compiler = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}
if (-not $Compiler) { throw "Install the official Inno Setup 6 compiler or pass -Compiler" }
& $Compiler (Join-Path $projectRoot "installer/AiTradingAutomation.iss")
if ($LASTEXITCODE -ne 0) { throw "Installer compilation failed" }
$installer = Join-Path $projectRoot "release/AiTradingAutomation-Setup-x64.exe"
$checksum = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant()
[System.IO.File]::WriteAllText(($installer + ".sha256"), "$checksum  $([System.IO.Path]::GetFileName($installer))`n", [System.Text.UTF8Encoding]::new($false))
Write-Host "Installer: $installer ($checksum)"
