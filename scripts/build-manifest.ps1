param(
  [string]$DocsDir = "$PSScriptRoot\..\docs"
)

$docsRoot = (Resolve-Path $DocsDir).Path.TrimEnd('\', '/')

function Get-RelPath([string]$fullPath) {
  if ($fullPath -eq $docsRoot) { return "" }
  return ($fullPath.Substring($docsRoot.Length).TrimStart('\', '/') -replace '\\', '/')
}

function Normalize-Label([string]$raw) {
  if ([string]::IsNullOrWhiteSpace($raw)) { return "未命名" }

  $label = [System.IO.Path]::GetFileNameWithoutExtension($raw.Trim())
  $label = $label -replace '^\s*\d+\s*[、，\.\-_:：]\s*', ''
  $label = $label -replace '^\s*[、，\.\-_:：]+\s*', ''
  $label = $label.Trim()

  if ([string]::IsNullOrWhiteSpace($label)) {
    $label = [System.IO.Path]::GetFileNameWithoutExtension($raw).Trim()
  }

  switch -Regex ($label.ToLowerInvariant()) {
    '^k8s-yml模版$' { return 'K8s YML 模版' }
    '^k8s-yml模板$' { return 'K8s YML 模版' }
    default { return $label }
  }
}

function Get-NaturalKey([string]$text) {
  if ($null -eq $text) { return "" }
  return [regex]::Replace($text, '\d+', {
    param($m)
    return $m.Value.PadLeft(8, '0')
  })
}

$root = [ordered]@{
  type = "dir"
  title = "文档主页"
  path = ""
  file = "README.md"
  children = @()
}

$allDirs = @($docsRoot) + (Get-ChildItem -Path $docsRoot -Recurse -Directory | Select-Object -ExpandProperty FullName)
$nodes = @{}

foreach ($dirPath in $allDirs) {
  $relDir = Get-RelPath $dirPath
  $title = if ([string]::IsNullOrWhiteSpace($relDir)) { "文档主页" } else { Normalize-Label (Split-Path -Path $dirPath -Leaf) }

  $readmePath = Join-Path $dirPath "README.md"
  $readmeFile = if (Test-Path -Path $readmePath -PathType Leaf) {
    if ([string]::IsNullOrWhiteSpace($relDir)) { "README.md" } else { "$relDir/README.md" }
  } else {
    $null
  }

  $nodes[$relDir] = [ordered]@{
    type = "dir"
    title = $title
    path = $relDir
    file = $readmeFile
    children = @()
  }
}

$markdownFiles = Get-ChildItem -Path $docsRoot -Recurse -File -Filter "*.md" |
  Where-Object { $_.Name -ne "README.md" -and $_.Name -ne "文档梳理报告.md" }

foreach ($md in $markdownFiles) {
  $parentRel = Get-RelPath $md.DirectoryName
  $fileRel = Get-RelPath $md.FullName

  $docNode = [ordered]@{
    type = "doc"
    title = Normalize-Label $md.Name
    path = $fileRel
    file = $fileRel
    children = @()
  }

  if ($nodes.ContainsKey($parentRel)) {
    $nodes[$parentRel].children += $docNode
  }
}

foreach ($key in @($nodes.Keys)) {
  if ([string]::IsNullOrWhiteSpace($key)) { continue }

  $parentWin = Split-Path -Path ($key -replace '/', '\') -Parent
  $parentRel = if ([string]::IsNullOrWhiteSpace($parentWin) -or $parentWin -eq ".") {
    ""
  } else {
    $parentWin -replace '\\', '/'
  }

  if ($nodes.ContainsKey($parentRel)) {
    $nodes[$parentRel].children += $nodes[$key]
  }
}

function Sort-Node($node) {
  $node.children = @(
    $node.children |
      Sort-Object -Property `
        @{ Expression = { if ($_.type -eq "dir") { 0 } else { 1 } } }, `
        @{ Expression = { if ([string]::IsNullOrWhiteSpace($_.path)) { Get-NaturalKey $_.title } else { Get-NaturalKey $_.path } } }
  )

  foreach ($child in $node.children) {
    if ($child.type -eq "dir") {
      Sort-Node $child
    }
  }
}

function Prune-Node($node) {
  $kept = @()
  foreach ($child in $node.children) {
    if ($child.type -eq "dir") {
      Prune-Node $child
      $hasChildren = $child.children -and $child.children.Count -gt 0
      $hasFile = -not [string]::IsNullOrWhiteSpace($child.file)
      if ($hasChildren -or $hasFile) {
        $kept += $child
      }
    } else {
      $kept += $child
    }
  }
  $node.children = $kept
}

$root = $nodes[""]
Prune-Node $root
Sort-Node $root

$manifest = [ordered]@{
  generatedAt = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
  root = $root
}

$manifest | ConvertTo-Json -Depth 32 | Set-Content -Path (Join-Path $docsRoot "manifest.json") -Encoding utf8
