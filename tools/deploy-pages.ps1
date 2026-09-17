# Lapeeet Pages deploy — rebuilds dist/ and publishes it to the gh-pages branch.
# Usage:  powershell -ExecutionPolicy Bypass -File tools/deploy-pages.ps1
# Result: https://romeoasis2023.github.io/lapeeet-app/ (+ ?mode=driver|passenger)
$ErrorActionPreference = 'Stop'
$ROOT = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $ROOT

Write-Output '== 1/4 rebuild dist =='
python tools/build-single.py --out dist/lapeeet.html
if ($LASTEXITCODE -ne 0) { throw 'build-single.py failed' }

$work = Join-Path ([IO.Path]::GetTempPath()) 'lapeeet-ghpages'
if (Test-Path -LiteralPath $work) { Remove-Item -LiteralPath $work -Recurse -Force }
$hasBranch = (git ls-remote origin refs/heads/gh-pages).Length -gt 0
if ($hasBranch) {
  Write-Output '== 2/4 clone existing gh-pages =='
  git clone --quiet --branch gh-pages --single-branch origin $work
} else {
  Write-Output '== 2/4 init new gh-pages branch =='
  New-Item -ItemType Directory -Path $work | Out-Null
  Set-Location -LiteralPath $work
  git init --quiet
  git checkout --quiet --orphan gh-pages
  git remote add origin https://github.com/RomeoAsis2023/lapeeet-app.git
  Set-Location -LiteralPath $ROOT
}
Set-Location -LiteralPath $work

Write-Output '== 3/4 replace payload with dist =='
Get-ChildItem -LiteralPath $work -Force | Where-Object { $_.Name -ne '.git' } | Remove-Item -Recurse -Force
Copy-Item -LiteralPath (Join-Path $ROOT 'dist/lapeeet.html') -Destination (Join-Path $work 'index.html') -Force
Copy-Item -LiteralPath (Join-Path $ROOT 'dist/manifest.json') -Destination (Join-Path $work 'manifest.json') -Force
$imgSrc = Join-Path $ROOT 'dist/assets/img'
if (Test-Path -LiteralPath $imgSrc) {
  $imgDst = Join-Path $work 'assets/img'
  New-Item -ItemType Directory -Path $imgDst -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $imgSrc '*') -Destination $imgDst -Force
}
Set-Content -LiteralPath (Join-Path $work '.nojekyll') -Value '' -NoNewline
git add -A
$status = git status --porcelain
if ([string]::IsNullOrWhiteSpace($status)) {
  Write-Output 'No changes — site already current.'
} else {
  $sha = (git -C $ROOT rev-parse --short HEAD).Trim()
  git -c user.name='Lapeeet Dev' -c user.email='dev@lapeeet.local' commit --quiet -m "Deploy $sha to Pages"
  Write-Output '== 4/4 push gh-pages =='
  git push origin gh-pages
}
Set-Location -LiteralPath $ROOT
Write-Output 'DONE — https://romeoasis2023.github.io/lapeeet-app/'
