$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$docsRoot = Join-Path $repoRoot "docs"

if (-not (Test-Path $docsRoot)) {
  throw "docs directory not found: $docsRoot"
}

function Normalize-Name([string]$text) {
  if ([string]::IsNullOrWhiteSpace($text)) { return "" }
  $t = $text -replace '^\d+[、._-]*', ''
  $t = $t -replace '\s+', ''
  $t = $t -replace '[\-_/（）()【】\[\]·`~!@#$%^&*+=|\\:;"''<>,.?，。；：、]', ''
  return $t.ToLowerInvariant()
}

$moves = @()

Get-ChildItem -Path $docsRoot -Directory -Recurse | ForEach-Object {
  $dir = $_
  $subdirs = Get-ChildItem -Path $dir.FullName -Directory
  if ($subdirs.Count -gt 0) { return }

  $files = Get-ChildItem -Path $dir.FullName -File
  if ($files.Count -ne 1) { return }

  $md = $files | Where-Object { $_.Extension -eq ".md" } | Select-Object -First 1
  if ($null -eq $md) { return }

  $dirNameNorm = Normalize-Name $dir.Name
  $fileNameNorm = Normalize-Name $md.BaseName
  if ($dirNameNorm -ne $fileNameNorm) { return }

  $parent = $dir.Parent.FullName
  $target = Join-Path $parent ($dir.Name + ".md")
  $source = $md.FullName

  if ($source -ieq $target) { return }
  if (Test-Path $target) { return }

  $moves += [pscustomobject]@{
    Source = $source
    Target = $target
    Dir    = $dir.FullName
  }
}

foreach ($item in $moves) {
  Move-Item -Path $item.Source -Destination $item.Target
}

$removed = 0
foreach ($item in $moves) {
  $remaining = @(Get-ChildItem -Path $item.Dir -Force)
  if ($remaining.Count -eq 0) {
    Remove-Item -Path $item.Dir -Force
    $removed++
  }
}

Write-Output ("flattened={0}" -f $moves.Count)
Write-Output ("removed_empty_dirs={0}" -f $removed)
