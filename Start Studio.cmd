@echo off
rem Starts the Studio (website and API). Settings come from office.env in this folder, when it exists.
cd /d "%~dp0"
title SBC Benchmarking Studio
node --env-file-if-exists=office.env studio/api/server.mjs
echo.
echo The Studio has stopped. Read the message above, then press a key to close this window.
pause >nul
