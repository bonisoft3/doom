$MiseVersion = "v2026.11.8"
$MiseDir = Join-Path $env:LOCALAPPDATA "mise\bin"
$Mise = Join-Path $MiseDir "mise.exe"

$NeedInstall = -not (Test-Path $Mise)
if (-not $NeedInstall) {
  try {
    $Out = (& $Mise --version) -join "`n"
    if ($LASTEXITCODE -ne 0 -or $Out -notmatch '(?m)^(\d+\.\d+\.\d+)') {
      $NeedInstall = $true
    } else {
      $NeedInstall = [version]$Matches[1] -lt [version]($MiseVersion.TrimStart('v'))
    }
  } catch {
    $NeedInstall = $true
  }
}

if ($NeedInstall) {
  New-Item -ItemType Directory -Force -Path $MiseDir | Out-Null
  $Tmp = "$Mise.tmp"
  Invoke-WebRequest "https://github.com/jdx/mise/releases/download/$MiseVersion/mise-$MiseVersion-windows-x64.exe" -OutFile $Tmp
  Move-Item -Force $Tmp $Mise
}

$env:PATH = "$MiseDir;$env:PATH"
Get-ChildItem -Recurse -File -Filter ".mise.toml" | ForEach-Object {
  & $Mise trust -a -y (Split-Path $_.FullName)
}
& $Mise install
