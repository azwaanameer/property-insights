# Builds the VicProp report PDF for one style and one reader view.
# Usage (from repo root):  powershell -File scripts/make-pdf.ps1 -Skin midnight -View investor
# Skins: midnight (default), ledger, atlas, eucalypt, monolith.  Views: investor, renter, buyer.
param(
  [string]$Skin = "midnight",
  [string]$View = "investor"
)
$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo
node scripts/28-build-report.mjs --pdf --skin $Skin --view $View
$dir = Join-Path $repo "_bmad-output\planning-artifacts\ux-designs\ux-property-insights-2026-11-11\mockups"
$html = Join-Path $dir "property-report-$Skin-$View.print.html"
$pdf = Join-Path $dir "VicProp-Insight-Report-310-628-Flinders-St-$Skin-$View.pdf"
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edge)) { $edge = "C:\Program Files\Google\Chrome\Application\chrome.exe" }
if (Test-Path $pdf) { Remove-Item $pdf }
$ErrorActionPreference = "Continue"   # Edge writes harmless warnings to stderr
& $edge --headless=new --disable-gpu --no-pdf-header-footer --virtual-time-budget=15000 "--print-to-pdf=$pdf" ("file:///" + $html.Replace("\", "/")) 2>$null | Out-Null
Remove-Item $html -ErrorAction SilentlyContinue
Get-Item $pdf | Select-Object Name, Length
