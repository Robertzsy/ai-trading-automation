# Use the same upgrade-safe seeding implementation as the installed engine.
param([switch]$Force)
$ErrorActionPreference = 'Stop'
if (-not $env:DSH_HOME) { throw 'DSH_HOME is not set.' }
$appRoot = Split-Path -Parent $PSScriptRoot
$repoRoot = Split-Path -Parent $appRoot
$pythonCandidates = @(
    (Join-Path $repoRoot '.venv\Scripts\python.exe'),
    (Join-Path $repoRoot 'runtime\python\python.exe'),
    (Join-Path $repoRoot 'build\runtime\python\python.exe')
)
$pythonExe = $pythonCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $pythonExe) { $pythonExe = (Get-Command python -ErrorAction Stop).Source }
$seedArgs = @((Join-Path $repoRoot 'scripts\seed-dsh-home.py'), $appRoot, $env:DSH_HOME)
if ($Force) { $seedArgs += '--force' }
& $pythonExe @seedArgs
if ($LASTEXITCODE -ne 0) { throw 'DSH home seeding failed; user settings were preserved.' }
