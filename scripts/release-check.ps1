param(
    [switch]$SkipUpgrade,
    [switch]$SkipPythonVenv,
    [switch]$SkipPythonBundled,
    [switch]$SkipNodeBundled,
    [switch]$SkipDotNet,
    [switch]$SkipWeb,
    [string]$WebUrl = "http://127.0.0.1:4567",
    [string]$Installer = "release\InvestmentAuto-Setup-x64.exe"
)

# Release-candidate gate (P5): runs every automated acceptance check and
# prints the release manifest (SHA-256 + size). Any failure exits non-zero.
#
#   powershell -ExecutionPolicy Bypass -File scripts\release-check.ps1
#
# Switches skip individual gates (VM runs may want -SkipUpgrade, for example).
# Every skipped gate is echoed as SKIPPED and listed again in the summary, so a
# green run that skipped work is never mistaken for a full sign-off. In
# particular the product-shell smoke needs a LIVE investment-web instance: with
# no instance it fails loudly with instructions instead of passing quietly, and
# -SkipWeb is the explicit, visible way out.

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot
. (Join-Path $PSScriptRoot "runtime-common.ps1")
$script:failures = @()
$script:skipped = @()

function Run-Step([string]$name, [scriptblock]$body) {
    Write-Host "== $name"
    try {
        & $body
        Write-Host "   PASS"
    } catch {
        # script: scope - a plain += would shadow the caller's list inside
        # the function and silently produce a green exit code.
        $script:failures += $name
        Write-Host ("   FAIL: " + $_.Exception.Message) -ForegroundColor Red
    }
}

function Skip-Step([string]$name, [string]$why) {
    Write-Host "== $name"
    Write-Host ("   SKIPPED: " + $why) -ForegroundColor Yellow
    $script:skipped += $name
}

function Test-WebInstance([string]$url) {
    # Any HTTP answer - including 4xx/5xx - proves an instance is listening.
    # Only a transport failure means "there is no instance to smoke".
    try {
        $null = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
        return $true
    } catch {
        return ($null -ne $_.Exception.Response)
    }
}

# 0. Every hand-maintained version declaration must agree with the single
#    source of truth (engine/version.py). Runs in a child PowerShell so the
#    checker's exit code cannot terminate this script.
Run-Step "Version declarations match engine/version.py (bump-version.ps1 -Check)" {
    & powershell -ExecutionPolicy Bypass -NoProfile -File (Join-Path $PSScriptRoot "bump-version.ps1") -Check | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "version declarations drifted (bump-version.ps1 -Check exit code $LASTEXITCODE)" }
}

# 1. Desktop shell unit tests (single instance, ready parse, pythonw/node
#    locate, autostart, process manager).
if ($SkipDotNet) {
    Skip-Step "C# desktop tests (dotnet test)" "-SkipDotNet"
} else {
    $dotnet = "dotnet"
    foreach ($candidate in @("C:\Program Files\dotnet\dotnet.exe", "$env:ProgramFiles\dotnet\dotnet.exe")) {
        if (Test-Path $candidate) { $dotnet = $candidate; break }
    }
    Run-Step "C# desktop tests (dotnet test)" {
        & $dotnet test "windows\desktop\InvestmentAuto.Desktop.Tests\InvestmentAuto.Desktop.Tests.csproj" -c Release --nologo | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "dotnet test exit code $LASTEXITCODE" }
    }
}

# 2. Dev-mode regression: full Python suite on the dev venv.
if ($SkipPythonVenv) {
    Skip-Step "Python suite on .venv (dev-mode regression)" "-SkipPythonVenv"
} elseif (-not (Test-Path ".venv\Scripts\python.exe")) {
    Skip-Step "Python suite on .venv (dev-mode regression)" "no .venv\Scripts\python.exe"
} else {
    Run-Step "Python suite on .venv (dev-mode regression)" {
        & ".venv\Scripts\python.exe" -m pytest tests -q --no-header | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "venv pytest exit code $LASTEXITCODE" }
    }
}

# 3. Node interpreter: the bundled runtime is what ships, so it is what the
#    gates must exercise. Its version is compared against the single pin in
#    fetch-runtime.ps1 rather than a second hard-coded literal.
$node = Resolve-IANodeExe -ProjectRoot $projectRoot
$pinnedNode = Get-IAPinnedNodeVersion
if ($SkipNodeBundled) {
    Skip-Step "Bundled Node runtime matches the fetch-runtime.ps1 pin ($pinnedNode)" "-SkipNodeBundled"
} elseif (-not $node.Bundled) {
    Run-Step "Bundled Node runtime matches the fetch-runtime.ps1 pin ($pinnedNode)" {
        throw ("bundled Node is missing (build\runtime\node\node.exe); the shipped archive would " +
               "depend on the build machine's Node. Run scripts\fetch-runtime.ps1 then " +
               "scripts\bundle-runtime.ps1, or pass -SkipNodeBundled.")
    }
} else {
    Run-Step "Bundled Node runtime matches the fetch-runtime.ps1 pin ($pinnedNode)" {
        $actual = (& $node.Exe --version).Trim()
        Write-Host ("   bundled node --version: {0}" -f $actual)
        if ($actual -ne $pinnedNode) {
            throw "bundled Node is $actual but scripts\fetch-runtime.ps1 pins $pinnedNode - re-run scripts\bundle-runtime.ps1"
        }
    }
}
Write-Host ("   gate interpreter: {0} ({1})" -f $node.Exe, $node.Source)

# 4. DSH app gates: plugin unit tests + skill structure/tool-reference check +
#    plugin packaging/client-contract check.
Run-Step "DSH plugin unit tests (node --test)" {
    & $node.Exe --test "app/plugins/dsh-investment-tools/test/*.test.mjs" "app/plugins/dsh-investment-workflow/test/*.test.mjs" "app/plugins/dsh-dpapi-credentials/test/*.test.mjs" "app/plugins/dsh-product-shell/test/*.test.mjs" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "node --test exit code $LASTEXITCODE" }
}
Run-Step "Investment skills structural check" {
    & $node.Exe app/scripts/check-skills.mjs | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "check-skills exit code $LASTEXITCODE" }
}
Run-Step "Plugin packaging + client contract check" {
    & $node.Exe app/scripts/check-plugins.mjs | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "check-plugins exit code $LASTEXITCODE" }
}

# 4b. Generated artefacts must match their sources. The icon set is spliced into
#     lib/client.js at build time; a stale block would ship icons that no longer
#     correspond to the generator, and nothing else would notice.
Run-Step "Generated icon set is current (generate-icons.mjs --check)" {
    & $node.Exe app/plugins/dsh-product-shell/scripts/generate-icons.mjs --check | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "generate-icons check exit code $LASTEXITCODE" }
}

# 4b-2. The Markdown renderer is generated into the same file by the same kind of
#       script: a stale block would keep displaying reports through an outdated
#       parser while every other gate stayed green.
Run-Step "Generated Markdown renderer is current (generate-markdown.mjs --check)" {
    & $node.Exe app/plugins/dsh-product-shell/scripts/generate-markdown.mjs --check | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "generate-markdown check exit code $LASTEXITCODE" }
}

Run-Step "Generated Dashboard is current (generate-dashboard.mjs --check)" {
    & $node.Exe app/plugins/dsh-product-shell/scripts/generate-dashboard.mjs --check | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "generate-dashboard check exit code $LASTEXITCODE" }
}

# 4c. The bundler used to produce client.js must never reach the shipped payload.
#     It lives in devDependencies only; this asserts that is still true.
Run-Step "Build-only tooling stays out of the shipped app payload" {
    $pkg = Get-Content app/package.json -Raw | ConvertFrom-Json
    $shipped = @()
    if ($pkg.dependencies) { $shipped += $pkg.dependencies.PSObject.Properties.Name }
    $forbidden = @($shipped | Where-Object { $_ -in @('esbuild', 'lucide-static', 'lucide-react') })
    if ($forbidden.Count -gt 0) {
        throw "build-only package(s) declared as runtime dependencies: $($forbidden -join ', ')"
    }
    $dev = @()
    if ($pkg.devDependencies) { $dev += $pkg.devDependencies.PSObject.Properties.Name }
    Write-Host "   runtime deps: $($shipped -join ', ')"
    Write-Host "   dev-only    : $($dev -join ', ')"
}

# 5. Product shell smoke in a real browser. Requires a running investment-web
#    instance; see the note at the top of this file.
if ($SkipWeb) {
    Skip-Step "Product shell smoke (app/scripts/smoke-web.mjs)" "-SkipWeb"
} else {
    Run-Step "Product shell smoke (app/scripts/smoke-web.mjs)" {
        if (-not (Test-WebInstance $WebUrl)) {
            $message = "no investment-web instance is listening at {0}. Start one with " +
                       "app\scripts\dev.ps1, point -WebUrl at a running instance, or pass -SkipWeb " +
                       "to skip this gate explicitly. Refusing to report a pass without a live instance."
            throw ($message -f $WebUrl)
        }
        & $node.Exe app/scripts/smoke-web.mjs $WebUrl | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "smoke-web exit code $LASTEXITCODE" }
    }
}

# 6. Bundled runtime must be fully self-contained (-s disables user-site,
#    so a clean machine is simulated even on the build box) and able to run
#    the same suite (offline deps ok).
if ($SkipPythonBundled) {
    Skip-Step "Bundled runtime self-containment (pip check + imports)" "-SkipPythonBundled"
    Skip-Step "Python suite on bundled runtime" "-SkipPythonBundled"
} else {
    $bundled = Join-Path (Get-IAPythonRuntimeDir -ProjectRoot $projectRoot) "python.exe"
    $missingMessage = "bundled runtime missing: $bundled (run scripts\fetch-runtime.ps1 then scripts\bundle-runtime.ps1)"
    Run-Step "Bundled runtime self-containment (pip check + imports)" {
        if (-not (Test-Path $bundled)) { throw $missingMessage }
        & $bundled -s -m pip check | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "bundled pip check failed" }
        & $bundled -s -c "import pydantic, typing_extensions, pandas, numpy, pymongo, openai, httpx, requests, yaml, apscheduler, dotenv, tzlocal, h11, httpcore; print('ok')" | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "bundled smoke imports failed" }
    }
    Run-Step "Python suite on bundled runtime" {
        if (-not (Test-Path $bundled)) { throw $missingMessage }
        & $bundled -s -m pytest tests -q --no-header | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "bundled pytest exit code $LASTEXITCODE" }
    }
}

# 7. Upgrade over an existing install must preserve every user data byte
#    (test req #8).
if ($SkipUpgrade) {
    Skip-Step "Upgrade preserves user data" "-SkipUpgrade"
} else {
    Run-Step "Upgrade preserves user data" {
        & "$PSScriptRoot\verify-upgrade.ps1" -Installer $Installer | Out-Null
    }
}

# 8. Release manifest.
Run-Step "Installer manifest" {
    $installer = Join-Path $projectRoot $Installer
    if (-not (Test-Path $installer)) { throw "installer missing: $installer" }
    $hash = Get-FileHash $installer -Algorithm SHA256
    Write-Host ("   SHA-256: " + $hash.Hash)
    Write-Host ("   size:    " + (Get-Item $installer).Length + " bytes")
}

Write-Host ""
if ($script:skipped.Count -gt 0) {
    Write-Host ("Skipped gates (" + $script:skipped.Count + "): " + ($script:skipped -join ", ")) -ForegroundColor Yellow
    Write-Host "  a run that skipped gates is NOT a full release sign-off." -ForegroundColor Yellow
}
if ($script:failures.Count -gt 0) {
    Write-Host ("RELEASE CHECK FAILED: " + ($script:failures -join ", ")) -ForegroundColor Red
    exit 1
}
if ($script:skipped.Count -gt 0) {
    Write-Host "RELEASE CHECK PASSED (with skipped gates - see above)." -ForegroundColor Yellow
    exit 0
}
Write-Host "RELEASE CHECK PASSED - all automated gates green." -ForegroundColor Green
