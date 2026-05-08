param(
  [string]$DocsDir = "$PSScriptRoot\..\docs"
)

$docsRoot = (Resolve-Path $DocsDir).Path.TrimEnd('\')

function Get-RelPath([string]$fullPath) {
  return ($fullPath.Substring($docsRoot.Length).TrimStart('\') -replace '\\', '/')
}

$exclude = @(
  "README.md",
  "文档梳理报告.md"
)

$updated = 0

$mdFiles = Get-ChildItem -Path $docsRoot -Recurse -File -Filter "*.md" |
  Where-Object {
    $rel = Get-RelPath $_.FullName
    -not ($exclude -contains $rel)
  }

foreach ($file in $mdFiles) {
  $rel = Get-RelPath $file.FullName
  $dir = Split-Path -Path $rel -Parent
  if ([string]::IsNullOrWhiteSpace($dir) -or $dir -eq ".") { $dir = "根目录" }
  $dir = $dir -replace '\\', '/'
  $name = [System.IO.Path]::GetFileName($rel)

  $meta = @"
<!-- ORIGIN_INFO_START -->
> 原始文件路径：$rel
> 原始目录：$dir
> 原始文件名：$name
<!-- ORIGIN_INFO_END -->

"@

  $raw = Get-Content -Raw $file.FullName
  $content = [regex]::Replace($raw, '^(?s)<!-- ORIGIN_INFO_START -->.*?<!-- ORIGIN_INFO_END -->\r?\n*', '')
  $new = $meta + $content

  if ($new -ne $raw) {
    Set-Content -Path $file.FullName -Value $new -Encoding utf8
    $updated++
  }
}

Write-Output "updated=$updated"
