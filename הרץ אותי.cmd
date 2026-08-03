@echo off
title Loti Lot
cd /d "%~dp0"
chcp 65001 >nul
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Opening the download page...
  start https://nodejs.org/
  pause
  exit /b 1
)
node scripts\push-site.mjs
pause
