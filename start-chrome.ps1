# Opens a visible Chrome that the runner can attach to.
# The named user logs in to TP Catalyst by hand in this window; no password is stored by the script.
# Chrome only allows remote debugging on a non-default profile, hence the dedicated folder.
param([int]$Port = 9222)

$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
if (-not (Test-Path $chrome)) { Write-Error "Chrome not found at $chrome"; exit 1 }

$profileDir = Join-Path $PSScriptRoot "chrome-profile"
Start-Process $chrome -ArgumentList "--remote-debugging-port=$Port", "--user-data-dir=`"$profileDir`"", "--no-first-run"
Write-Host "Chrome started on debugging port $Port. Log in to TP Catalyst in that window, then run the flow."
