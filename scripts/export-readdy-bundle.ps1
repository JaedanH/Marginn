# Copies all Marginn files changed for Readdy manual sync into a zip.
# Run from repo root: powershell -ExecutionPolicy Bypass -File .\scripts\export-readdy-bundle.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$files = @(
  "src/lib/scanEdgeResponse.ts",
  "src/lib/pipelineDiagnostics.ts",
  "src/lib/ensureScanPersisted.ts",
  "src/lib/authUserId.ts",
  "src/lib/forensicAuthentication.ts",
  "src/lib/scanEconomics.ts",
  "src/lib/scanListingInsights.ts",
  "src/lib/brandSizeSensitivity.ts",
  "src/lib/scanBrandAggregates.ts",
  "src/lib/scanProfit.ts",
  "src/lib/scanWatchlistAlerts.ts",
  "src/lib/watchlistConstants.ts",
  "src/lib/findBestComparables.ts",
  "src/lib/calculateMScore.ts",
  "src/types/scans.ts",
  "src/pages/scan/page.tsx",
  "src/pages/scan/components/ComparablesSection.tsx",
  "src/pages/scan/components/ScanResultCard.tsx",
  "src/pages/scan/components/FlipScoreMeter.tsx",
  "src/pages/scan/components/ForensicAuthBanner.tsx",
  "src/pages/scan/components/PreScanChecklist.tsx",
  "src/pages/share/scan-page.tsx",
  "src/pages/dashboard/page.tsx",
  "src/pages/dashboard/history/page.tsx",
  "src/pages/dashboard/history/components/ScanDetailModal.tsx",
  "src/pages/dashboard/history/components/ScanOutcomeDialogs.tsx",
  "src/pages/dashboard/components/NewScanSection.tsx",
  "src/pages/dashboard/components/DashboardScanResults.tsx",
  "src/pages/dashboard/components/BrandPerformanceCard.tsx",
  "src/router/config.tsx",
  "READDY_MANUAL_SYNC.md"
)

$outDir = Join-Path $root "readdy-sync-bundle"
if (Test-Path $outDir) { Remove-Item $outDir -Recurse -Force }
New-Item -ItemType Directory -Path $outDir | Out-Null

$manifest = @()
foreach ($rel in $files) {
  $src = Join-Path $root $rel
  if (-not (Test-Path $src)) {
    Write-Warning "Skip missing: $rel"
    continue
  }
  $dest = Join-Path $outDir $rel
  $destParent = Split-Path $dest -Parent
  if (-not (Test-Path $destParent)) { New-Item -ItemType Directory -Path $destParent -Force | Out-Null }
  Copy-Item $src $dest -Force
  $manifest += $rel
}

$manifest | Set-Content (Join-Path $outDir "FILE_LIST.txt") -Encoding UTF8

$zipPath = Join-Path $env:USERPROFILE "Desktop\marginn-readdy-sync.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path (Join-Path $outDir "*") -DestinationPath $zipPath -Force

Write-Host "Copied $($manifest.Count) files to: $outDir"
Write-Host "Zip created: $zipPath"
Write-Host "Open READDY_MANUAL_SYNC.md for paste steps. Supabase Edge + migrations are NOT in the zip - deploy from this repo."
