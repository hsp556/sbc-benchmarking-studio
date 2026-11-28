@echo off
rem Starts the Prowess runner. Uses the same Chrome window as the TP Catalyst runner: open https://prowess.cmie.com
rem in it and log in yourself. Settings come from office.env in this folder, when it exists.
cd /d "%~dp0"
title SBC Prowess runner
curl -s -m 3 -o nul http://127.0.0.1:9222/json/version
if errorlevel 1 powershell -ExecutionPolicy Bypass -File start-chrome.ps1
set RUNNER_AGENT=prowess
rem Its own name on the Studio's Agents page (a RUNNER_NAME in office.env is the TP Catalyst runner's).
set RUNNER_NAME=Prowess %COMPUTERNAME%
node --env-file-if-exists=office.env runner/runner.mjs
echo.
echo The runner has stopped. Read the message above, then press a key to close this window.
pause >nul
