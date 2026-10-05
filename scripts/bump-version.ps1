param(
    [string]$Version = "",
    [switch]$Check
)

# Version-declaration writer / verifier (P0-0 defect #4).
#
#   engine/version.py is the single source of truth for the product version.
#   Every other declaration is rewritten from it so the hand-maintained copies
#   cannot drift again (three plugin manifests had drifted to 2.0.0-p2 /
#   2.0.0-p4 / 2.0.0-p5 while the product shipped 2.1.3).
#
#   powershell -ExecutionPolicy Bypass -File scripts\bump-version.ps1 -Version 2.1.4
#   powershell -ExecutionPolicy Bypass -File scripts\bump-version.ps1            # repair drift to engine/version.py
#   powershell -ExecutionPolicy Bypass -File scripts\bump-version.ps1 -Check     # verify only, never writes
#
# -Check exits 1 when any declaration disagrees with engine/version.py. It is
# wired into scripts\release-check.ps1 and .github\workflows\tests.yml.
#
# SAFETY
#   * Only the explicit allow-list below is read or written, and each site is
#     matched by an anchored, exactly-once pattern (asserted at run time).
#   * CHANGELOG.md / README*.md / docs/** contain historical version numbers
#     and are NEVER touched - they are not in the list.
#   * app/package-lock.json is NEVER touched: it contains a third-party
#     dependency (`ms`) whose real version is literally "2.1.3", so a global
#     regex over JSON would corrupt the lockfile. Its root entry carries no
#     version field, so there is nothing to keep in sync there.
#   * Files are round-tripped byte-for-byte through UTF-8 with their original
#     BOM state preserved; PowerShell's default ANSI encoding would mangle the
#     Chinese text in InvestmentAuto.iss and app/package.json.

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$versionSource = "engine/version.py"

function Read-Utf8PreservingBom([string]$path) {
    $bytes = [System.IO.File]::ReadAllBytes($path)
    $hasBom = ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF)
    if ($hasBom) {
        $encoding = New-Object System.Text.UTF8Encoding($true)
        $text = $encoding.GetString($bytes, 3, $bytes.Length - 3)
    } else {
        $encoding = New-Object System.Text.UTF8Encoding($false)
        $text = $encoding.GetString($bytes)
    }
    return @{ Text = $text; HasBom = $hasBom }
}

function Write-Utf8PreservingBom([string]$path, [string]$text, [bool]$hasBom) {
    $encoding = New-Object System.Text.UTF8Encoding($hasBom)
    [System.IO.File]::WriteAllText($path, $text, $encoding)
}

# --- declarations: every place the product version is written down ---------
# Each Pattern must capture exactly one group: the current version literal.
$declarations = @(
    # 1. the source of truth itself
    [pscustomobject]@{ Path = "engine/version.py"
                       Pattern = '(?m)^__version__\s*=\s*"([^"]+)"'
                       Replacement = '__version__ = "{V}"' }
    # 2. Python packaging metadata (the trailing sync comment stays outside the match)
    [pscustomobject]@{ Path = "pyproject.toml"
                       Pattern = '(?m)^version\s*=\s*"([^"]+)"'
                       Replacement = 'version = "{V}"' }
    # 3. Inno Setup installer
    [pscustomobject]@{ Path = "installer/InvestmentAuto.iss"
                       Pattern = '(?m)^#define\s+MyAppVersion\s+"([^"]+)"'
                       Replacement = '#define MyAppVersion "{V}"' }
    # 4. portable-archive builder default
    [pscustomobject]@{ Path = "scripts/build-windows-release.ps1"
                       Pattern = '(?m)^\s*\[string\]\$Version\s*=\s*"([^"]+)"'
                       Replacement = '    [string]$Version = "{V}"' }
    # 5-7. desktop shell assembly metadata (Version is 3-part, the other two 4-part)
    [pscustomobject]@{ Path = "windows/desktop/InvestmentAuto.Desktop.csproj"
                       Pattern = '(?m)^\s*<Version>([^<]+)</Version>'
                       Replacement = '    <Version>{V}</Version>' }
    [pscustomobject]@{ Path = "windows/desktop/InvestmentAuto.Desktop.csproj"
                       Pattern = '(?m)^\s*<AssemblyVersion>([^<]+)</AssemblyVersion>'
                       Replacement = '    <AssemblyVersion>{V}</AssemblyVersion>'
                       Assembly = $true }
    [pscustomobject]@{ Path = "windows/desktop/InvestmentAuto.Desktop.csproj"
                       Pattern = '(?m)^\s*<FileVersion>([^<]+)</FileVersion>'
                       Replacement = '    <FileVersion>{V}</FileVersion>'
                       Assembly = $true }
    # 8. DSH app shell
    [pscustomobject]@{ Path = "app/package.json"
                       Pattern = '(?m)^  "version"\s*:\s*"([^"]+)"'
                       Replacement = '  "version": "{V}"' }
    # 9-13. DSH plugins
    [pscustomobject]@{ Path = "app/plugins/dsh-investment-tools/package.json"
                       Pattern = '(?m)^  "version"\s*:\s*"([^"]+)"'
                       Replacement = '  "version": "{V}"' }
    [pscustomobject]@{ Path = "app/plugins/dsh-investment-ui/package.json"
                       Pattern = '(?m)^  "version"\s*:\s*"([^"]+)"'
                       Replacement = '  "version": "{V}"' }
    [pscustomobject]@{ Path = "app/plugins/dsh-investment-workflow/package.json"
                       Pattern = '(?m)^  "version"\s*:\s*"([^"]+)"'
                       Replacement = '  "version": "{V}"' }
    [pscustomobject]@{ Path = "app/plugins/dsh-dpapi-credentials/package.json"
                       Pattern = '(?m)^  "version"\s*:\s*"([^"]+)"'
                       Replacement = '  "version": "{V}"' }
    [pscustomobject]@{ Path = "app/plugins/dsh-product-shell/package.json"
                       Pattern = '(?m)^  "version"\s*:\s*"([^"]+)"'
                       Replacement = '  "version": "{V}"' }
    # 14-15. DSH profiles
    [pscustomobject]@{ Path = "app/profiles/investment-web/package.json"
                       Pattern = '(?m)^  "version"\s*:\s*"([^"]+)"'
                       Replacement = '  "version": "{V}"' }
    [pscustomobject]@{ Path = "app/profiles/investment/package.json"
                       Pattern = '(?m)^  "version"\s*:\s*"([^"]+)"'
                       Replacement = '  "version": "{V}"' }
)

# --- resolve the target version -------------------------------------------
if (-not (Test-Path -LiteralPath $versionSource)) { throw "version source is missing: $versionSource" }
$sourceFile = Read-Utf8PreservingBom $versionSource
$sourceMatch = [regex]::Match($sourceFile.Text, '(?m)^__version__\s*=\s*"([^"]+)"')
if (-not $sourceMatch.Success) { throw "cannot read __version__ from $versionSource" }
$current = $sourceMatch.Groups[1].Value

if (-not $Version) { $Version = $current }
if ($Version -notmatch '^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$') {
    throw "-Version must look like X.Y.Z (optionally with a -suffix); got '$Version'"
}
$numeric = ($Version -split '-')[0]
$assembly = "$numeric.0"

Write-Host "== Investment Auto version declarations"
Write-Host ("   source of truth ({0}): {1}" -f $versionSource, $current)
if ($Check) {
    Write-Host "   mode: -Check (nothing is written)"
} else {
    Write-Host ("   mode: write -> {0}" -f $Version)
}
Write-Host ""

$drift = @()
$updated = @()
foreach ($declaration in $declarations) {
    if (-not (Test-Path -LiteralPath $declaration.Path)) {
        throw "declared version site is missing (layout changed?): $($declaration.Path)"
    }
    $file = Read-Utf8PreservingBom $declaration.Path
    $matches = [regex]::Matches($file.Text, $declaration.Pattern)
    if ($matches.Count -ne 1) {
        throw ("pattern for {0} matched {1} times, expected exactly 1 - refusing to " +
               "rewrite (pattern: {2})" -f $declaration.Path, $matches.Count, $declaration.Pattern)
    }
    $found = $matches[0].Groups[1].Value
    $want = if ($declaration.Assembly) { $assembly } else { $Version }

    if ($found -eq $want) {
        Write-Host ("   ok        {0}" -f $declaration.Path)
        continue
    }

    Write-Host ("   DRIFT     {0}   {1} -> {2}" -f $declaration.Path, $found, $want) -ForegroundColor Yellow
    $drift += [pscustomobject]@{ Path = $declaration.Path; From = $found; To = $want }
    if ($Check) { continue }

    $template = $declaration.Replacement -replace '\{V\}', $want
    # the templates contain PowerShell variables such as $Version / $LASTEXITCODE,
    # so every literal '$' must be escaped for .NET's replacement syntax.
    $replacement = $template.Replace('$', '$$')
    $newText = [regex]::Replace($file.Text, $declaration.Pattern, $replacement)
    if ($newText -eq $file.Text) {
        throw "internal error: the replacement had no effect on $($declaration.Path)"
    }
    Write-Utf8PreservingBom $declaration.Path $newText $file.HasBom
    $updated += $declaration.Path
}

Write-Host ""
if ($Check) {
    if ($drift.Count -gt 0) {
        $paths = ($drift | ForEach-Object { $_.Path } | Select-Object -Unique) -join ", "
        Write-Host ("VERSION CHECK FAILED: {0} declaration(s) disagree with {1} ({2})" -f `
            $drift.Count, $current, $paths) -ForegroundColor Red
        Write-Host ("   fix: powershell -ExecutionPolicy Bypass -File scripts\bump-version.ps1 -Version {0}" -f $current)
        exit 1
    }
    Write-Host ("VERSION CHECK PASSED: all {0} declarations match {1}." -f `
        $declarations.Count, $current) -ForegroundColor Green
    exit 0
}

if ($updated.Count -eq 0) {
    Write-Host ("Already at {0}: all {1} declarations unchanged (idempotent no-op)." -f `
        $Version, $declarations.Count) -ForegroundColor Green
} else {
    Write-Host ("Updated {0} of {1} declarations to {2}:" -f $updated.Count, $declarations.Count, $Version) -ForegroundColor Green
    foreach ($path in ($updated | Select-Object -Unique)) { Write-Host ("   - {0}" -f $path) }
}
exit 0
