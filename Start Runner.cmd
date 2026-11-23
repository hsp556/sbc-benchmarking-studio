@echo off
rem Opens the TP Catalyst Chrome window (if it is not open yet) and starts the runner.
rem Settings come from office.env in this folder, when it exists. Log in to TP Catalyst in the Chrome window yourself.
cd /d "%~dp0"
title SBC Catalyst runner
curl -s -m 3 -o nul http://127.0.0.1:9222/json/version
if errorlevel 1 powershell -ExecutionPolicy Bypass -File start-chrome.ps1
node --env-file-if-exists=office.env runner/runner.mjs
echo.
echo The runner has stopped. Read the message above, then press a key to close this window.
pause >nul
