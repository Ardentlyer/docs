param(
  [string]$DocsDir = "$PSScriptRoot\..\docs",
  [string]$ReportFile = "$PSScriptRoot\..\docs\文档梳理报告.md"
)

$docsRoot = (Resolve-Path $DocsDir).Path.TrimEnd('\')
$reportFullPath = [System.IO.Path]::GetFullPath($ReportFile)
$mdFiles = Get-ChildItem -Path $docsRoot -Recurse -File -Filter "*.md" |
  Where-Object { [System.IO.Path]::GetFullPath($_.FullName) -ne $reportFullPath } |
  Sort-Object FullName

function Get-RelPath([string]$fullPath) {
  return ($fullPath.Substring($docsRoot.Length).TrimStart('\') -replace '\\', '/')
}

function Get-NaturalKey([string]$text) {
  if ($null -eq $text) { return "" }
  return [regex]::Replace($text, '\d+', {
    param($m)
    return $m.Value.PadLeft(8, '0')
  })
}

function Get-TopCategory([string]$relPath) {
  if ($relPath -notmatch '/') { return "根目录" }
  $parts = $relPath -split '/'
  if ($parts.Count -ge 1) { return $parts[0] }
  return "未分类"
}

$missingH1 = New-Object System.Collections.Generic.List[string]
$unclosedFences = New-Object System.Collections.Generic.List[string]
$brokenLinks = New-Object System.Collections.Generic.List[object]

foreach ($md in $mdFiles) {
  $rel = Get-RelPath $md.FullName
  $raw = Get-Content -Raw $md.FullName

  if ($raw -notmatch '(?m)^\s*#\s+.+$') {
    $missingH1.Add($rel)
  }

  $fenceCount = ([regex]::Matches($raw, '(?m)^```')).Count
  if ($fenceCount % 2 -ne 0) {
    $unclosedFences.Add($rel)
  }

  $matches = [regex]::Matches($raw, '!\[[^\]]*\]\(([^)]+)\)|\[[^\]]+\]\(([^)]+)\)')
  foreach ($m in $matches) {
    $target = if ($m.Groups[1].Success) { $m.Groups[1].Value } else { $m.Groups[2].Value }
    $target = $target.Trim()
    if ([string]::IsNullOrWhiteSpace($target)) { continue }

    if ($target -match '^\$\{.+\}$') { continue }
    if ($target -like '*${*') { continue }
    if ($target -match '^(https?://|mailto:|tel:|#|data:|//)') { continue }
    if ($target.StartsWith('/')) { continue }

    $pathPart = $target.Split(' ')[0].Trim('"', "'")
    $pathPart = $pathPart.Split('#')[0].Split('?')[0]
    if ([string]::IsNullOrWhiteSpace($pathPart)) { continue }

    $candidate = Join-Path $md.DirectoryName $pathPart
    if (-not (Test-Path -Path $candidate)) {
      $brokenLinks.Add([pscustomobject]@{
          File = $rel
          Target = $target
        })
    }
  }
}

$uniqueBrokenLinks = $brokenLinks |
  Sort-Object -Property File, Target -Unique

$categoryStats = $mdFiles |
  ForEach-Object {
    $rel = Get-RelPath $_.FullName
    [pscustomobject]@{
      Category = Get-TopCategory $rel
      File = $rel
    }
  } |
  Group-Object -Property Category |
  ForEach-Object {
    [pscustomobject]@{
      Category = $_.Name
      Count = $_.Count
    }
  } |
  Sort-Object -Property @{ Expression = { Get-NaturalKey $_.Category } }

$reportLines = New-Object System.Collections.Generic.List[string]
$reportLines.Add("# 文档梳理报告")
$reportLines.Add("")
$reportLines.Add("- 生成时间: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')")
$reportLines.Add("- 文档总数: $($mdFiles.Count)")
$reportLines.Add("- 缺少一级标题: $($missingH1.Count)")
$reportLines.Add("- 代码块未闭合: $($unclosedFences.Count)")
$reportLines.Add("- 相对链接失效: $($uniqueBrokenLinks.Count)")
$reportLines.Add("")
$reportLines.Add("## 分类与数量")
$reportLines.Add("")
foreach ($item in $categoryStats) {
  $reportLines.Add("- $($item.Category): $($item.Count)")
}

$reportLines.Add("")
$reportLines.Add("## 结构问题")
$reportLines.Add("")
$reportLines.Add("### 缺少一级标题")
$reportLines.Add("")
if ($missingH1.Count -eq 0) {
  $reportLines.Add("- 无")
} else {
  foreach ($item in ($missingH1 | Sort-Object)) {
    $reportLines.Add("- $item")
  }
}

$reportLines.Add("")
$reportLines.Add("### 代码块未闭合")
$reportLines.Add("")
if ($unclosedFences.Count -eq 0) {
  $reportLines.Add("- 无")
} else {
  foreach ($item in ($unclosedFences | Sort-Object)) {
    $reportLines.Add("- $item")
  }
}

$reportLines.Add("")
$reportLines.Add("## 链接问题")
$reportLines.Add("")
if ($uniqueBrokenLinks.Count -eq 0) {
  $reportLines.Add("- 无")
} else {
  foreach ($row in $uniqueBrokenLinks) {
    $reportLines.Add("- $($row.File) -> $($row.Target)")
  }
}

$reportLines | Set-Content -Path $ReportFile -Encoding utf8
Write-Output "report=$ReportFile"
