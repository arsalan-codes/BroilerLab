# Arian one-shot deploy: tests + mirrors + push -> GitHub Pages + Vercel.
#
#   .\deploy.ps1 [-Message "..."] [-Bump] [-SkipTests] [-SkipVerify] [-Check]
#
#   -Message   commit message (default: "deploy: v<version> ...")
#   -Bump      patch-bump SITE_VERSION first (1.8.56 -> 1.8.57:
#              version.js + all ?v= in index.html + server_version)
#   -SkipTests skip pytest preflight (not recommended)
#   -SkipVerify skip live polling of Vercel/Pages after push
#   -Check     dry run: sync + parity + tests, then report what WOULD be
#              committed without committing or pushing
#
# What deploys where (all automatic on `git push origin main`):
#   GitHub Pages : .github/workflows/deploy.yml uploads repo ROOT
#                  (404.html = index.html copy = SPA fallback for /feed etc.)
#   Vercel       : auto-deploy from GitHub (vercel.json rewrites /api/* to
#                  api/index.py which vendors api/backend/; frontend = root)
#   Database     : Neon (BROILER_DATABASE_URL env on Vercel, untouched here)
param(
  [string]$Message = "",
  [switch]$Bump,
  [switch]$SkipTests,
  [switch]$SkipVerify,
  [switch]$Check
)
$ErrorActionPreference = "Stop"
$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ROOT

$VERCEL = "https://ariansense.vercel.app"
$PAGES  = "https://arsalan-codes.github.io/BroilerLab"

function Fail($m) { Write-Host "DEPLOY FAIL: $m" -ForegroundColor Red; exit 1 }
function Ok($m)   { Write-Host "ok: $m" -ForegroundColor Green }

# ---------- 1. repo sanity ----------
git rev-parse --show-toplevel *> $null
if ($LASTEXITCODE -ne 0) { Fail "not a git repo" }
$branch = (git branch --show-current).Trim()
if ([string]::IsNullOrWhiteSpace($branch)) { Fail "detached HEAD" }
Ok "branch $branch"

# ---------- 2. optional version bump ----------
$verFile = Join-Path $ROOT "version.js"
$verText = Get-Content -LiteralPath $verFile -Raw
if ($verText -notmatch 'SITE_VERSION\s*=\s*"([0-9]+\.[0-9]+\.[0-9]+)"') { Fail "SITE_VERSION not found" }
$oldVer = $Matches[1]
$newVer = $oldVer
if ($Bump) {
  $p = $oldVer.Split("."); $p[2] = ([int]$p[2] + 1).ToString(); $newVer = $p -join "."
  Write-Host "bump $oldVer -> $newVer"
  (Get-Content -LiteralPath $verFile -Raw).Replace($oldVer, $newVer) |
    Set-Content -LiteralPath $verFile -NoNewline -Encoding UTF8
  $idx = Join-Path $ROOT "index.html"
  $n = ([regex]::Matches((Get-Content -LiteralPath $idx -Raw), "\?v=$([regex]::Escape($oldVer))")).Count
  (Get-Content -LiteralPath $idx -Raw).Replace("?v=$oldVer", "?v=$newVer") |
    Set-Content -LiteralPath $idx -NoNewline -Encoding UTF8
  Write-Host "  index.html: $n cache-busters updated"
  $srv = Join-Path $ROOT "webapp_server.py"
  if (Test-Path -LiteralPath $srv) {
    (Get-Content -LiteralPath $srv -Raw).Replace("ArianStatic/$oldVer", "ArianStatic/$newVer") |
      Set-Content -LiteralPath $srv -NoNewline -Encoding UTF8
  }
  Ok "version $newVer"
}

# ---------- 3. sync mirrors (same contract as sync_webapp.sh) ----------
$files = @("index.html","404.html","app.js","auth.js","config.js","config.local.js",
  "router.js","version.js","i18n.js","shamsi.js","dialog.js","device-panel.js",
  "engine.js","strains.js","stats.js","xlsx.js","dd-select.js","env-control.js",
  "favicon.png","logo.svg")
foreach ($f in $files) {
  $s = Join-Path $ROOT $f
  if (Test-Path -LiteralPath $s) { Copy-Item -LiteralPath $s -Destination (Join-Path $ROOT "webapp\$f") -Force }
}
foreach ($d in @("assets","fa","data","locales","services","components","utils")) {
  $s = Join-Path $ROOT $d
  if (Test-Path -LiteralPath $s) {
    $t = Join-Path $ROOT "webapp\$d"
    if (-not (Test-Path -LiteralPath $t)) { New-Item -ItemType Directory -Path $t | Out-Null }
    Copy-Item -LiteralPath "$s\*" -Destination $t -Recurse -Force
  }
}
Get-ChildItem -Path $ROOT -Filter "logo_*.png" -File | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $ROOT "webapp\") -Force }
Get-ChildItem -Path $ROOT -Filter "logo_*.webp" -File | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $ROOT "webapp\") -Force }
Get-ChildItem -Path (Join-Path $ROOT "backend") -Filter "*.py" -File | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $ROOT "api\backend\") -Force
}
# 404.html must stay a byte-copy of index.html (Pages SPA fallback)
Copy-Item -LiteralPath (Join-Path $ROOT "index.html") -Destination (Join-Path $ROOT "404.html") -Force
Copy-Item -LiteralPath (Join-Path $ROOT "index.html") -Destination (Join-Path $ROOT "webapp\404.html") -Force
Ok "mirrors synced (webapp/ + api/backend/ + 404.html)"

# ---------- 4. parity verify ----------
function Hash($p) { return (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash }
foreach ($f in $files) {
  $a = Join-Path $ROOT $f; $b = Join-Path $ROOT "webapp\$f"
  if ((Test-Path -LiteralPath $a) -and (Test-Path -LiteralPath $b)) {
    if ((Hash $a) -ne (Hash $b)) { Fail "mirror drift: $f" }
  }
}
foreach ($d in @("assets","fa","data","locales","services","components","utils")) {
  $a = Join-Path $ROOT $d; $b = Join-Path $ROOT "webapp\$d"
  if ((Test-Path -LiteralPath $a) -and (Test-Path -LiteralPath $b)) {
    $diff = Compare-Object (Get-ChildItem -LiteralPath $a -Recurse -File | ForEach-Object { $_.FullName.Substring($a.Length) }) `
                           (Get-ChildItem -LiteralPath $b -Recurse -File | ForEach-Object { $_.FullName.Substring($b.Length) })
    if ($diff) { Fail "mirror dir drift: $d ($($diff.Count) entries)" }
  }
}
Get-ChildItem -Path (Join-Path $ROOT "backend") -Filter "*.py" -File | ForEach-Object {
  $v = Join-Path $ROOT ("api\backend\" + $_.Name)
  if ((Hash $_.FullName) -ne (Hash $v)) { Fail "vendored drift: $($_.Name)" }
}
if ((Hash (Join-Path $ROOT "index.html")) -ne (Hash (Join-Path $ROOT "404.html"))) { Fail "404.html != index.html" }
Ok "parity verified (root == webapp, backend == api/backend, 404 == index)"

# ---------- 5. tests ----------
if (-not $SkipTests) {
  Write-Host "running pytest..."
  python -m pytest tests/ -q 2>&1 | Select-Object -Last 5
  if ($LASTEXITCODE -ne 0) { Fail "pytest red - fix before deploy" }
  Ok "pytest green"
}

# ---------- 6. commit + push ----------
if ($Check) {
  Write-Host "--- CHECK MODE: no commit, no push ---"
  git status --porcelain
  Write-Host "CHECK OK - preflight green, ready to deploy." -ForegroundColor Green
  exit 0
}
git add -A
$st = git status --porcelain
$ahead = ""
try { $ahead = (git rev-list --count "@{u}..HEAD" 2>$null).Trim() } catch { $ahead = "" }
if ([string]::IsNullOrWhiteSpace($st) -and ($ahead -eq "" -or $ahead -eq "0")) {
  Write-Host "nothing to deploy - working tree clean." -ForegroundColor Yellow
  exit 0
}
if (-not [string]::IsNullOrWhiteSpace($st)) {
  Write-Host "changes:"; Write-Host $st
  if ([string]::IsNullOrWhiteSpace($Message)) { $Message = "deploy: v$newVer sync + fixes" }
  git commit -m $Message | Out-Null
  if ($LASTEXITCODE -ne 0) { Fail "git commit failed" }
  Ok "committed: $Message"
} else {
  Write-Host "pushing $ahead already-committed change(s) ahead of origin..."
}
git push origin $branch
if ($LASTEXITCODE -ne 0) { Fail "git push failed (check credentials: git credential-manager / PAT)" }
Ok "pushed to origin/$branch"

# ---------- 7. live verify ----------
if (-not $SkipVerify) {
  function Wait-Version($base, $label, $timeoutSec) {
    $deadline = (Get-Date).AddSeconds($timeoutSec)
    while ((Get-Date) -lt $deadline) {
      try {
        $t = (Invoke-WebRequest -Uri "$base/version.js" -TimeoutSec 12 -UseBasicParsing).Content
        if ($t -match [regex]::Escape($newVer)) { Ok "$label live at v$newVer"; return $true }
      } catch {}
      Start-Sleep -Seconds 15
    }
    Write-Host "WARN: $label not on v$newVer after ${timeoutSec}s" -ForegroundColor Yellow
    return $false
  }
  Wait-Version $VERCEL "Vercel" 360
  try {
    $h = (Invoke-WebRequest -Uri "$VERCEL/api/health" -TimeoutSec 12 -UseBasicParsing).Content
    Write-Host "vercel health: $h"
    if ($h -notmatch '"db":true') { Write-Host "WARN: Vercel DB not true" -ForegroundColor Yellow }
  } catch { Write-Host "WARN: Vercel /api/health unreachable" -ForegroundColor Yellow }
  Wait-Version $PAGES "Pages" 360
}
Write-Host "DEPLOY DONE v$newVer" -ForegroundColor Green
