param(
    [Parameter(Mandatory = $true)][string]$Destination,
    [string]$Revision = "HEAD"
)
$ErrorActionPreference = "Stop"
$sourceRoot = Split-Path -Parent $PSScriptRoot
$commit = (& git -C $sourceRoot rev-parse "$Revision^{commit}").Trim()
if ($LASTEXITCODE -ne 0) { throw "Cannot resolve release revision" }
$destinationPath = [System.IO.Path]::GetFullPath($Destination)
if (Test-Path -LiteralPath $destinationPath) { throw "Release source destination must be new: $destinationPath" }
$parent = Split-Path -Parent $destinationPath
New-Item -ItemType Directory -Force -Path $parent | Out-Null
$archive = $destinationPath + ".source.zip"
if (Test-Path -LiteralPath $archive) { throw "Source archive already exists: $archive" }
& git -C $sourceRoot archive --format=zip --output=$archive $commit
if ($LASTEXITCODE -ne 0) { throw "git archive failed" }
Expand-Archive -LiteralPath $archive -DestinationPath $destinationPath
$files = @{}
Get-ChildItem -LiteralPath $destinationPath -File -Recurse | ForEach-Object {
    $relative = $_.FullName.Substring($destinationPath.Length + 1).Replace([System.IO.Path]::DirectorySeparatorChar, [char]'/')
    $files[$relative] = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
}
$receipt = @{ commit = $commit; files = $files } | ConvertTo-Json -Depth 4
[System.IO.File]::WriteAllText((Join-Path $destinationPath "release-source.json"), $receipt, [System.Text.UTF8Encoding]::new($false))
Write-Host "Clean release source: $destinationPath ($commit, $($files.Count) tracked files)"
