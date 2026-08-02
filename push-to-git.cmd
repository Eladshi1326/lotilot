@echo off
title Loti Lot - Push to Git
cd /d "%~dp0"

where git >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [Loti Lot] Git is not installed. Opening the download page...
  start https://git-scm.com/download/win
  pause
  exit /b 1
)

if not exist .git (
  echo  [Loti Lot] Initializing a new git repository...
  git init -b main
)

git config user.email >nul 2>nul
if errorlevel 1 (
  echo  [Loti Lot] Setting git identity for this repository...
  git config user.name "Elad"
  git config user.email "eladshi1326@gmail.com"
)

git remote get-url origin >nul 2>nul
if errorlevel 1 (
  echo  [Loti Lot] Connecting to the GitHub repository for the first time...
  git remote add origin https://github.com/Eladshi1326/lotilot.git
)

rem A stale lock file can be left behind if a git process was interrupted.
rem It blocks add/commit, so clear it before saving.
if exist ".git\index.lock" (
  echo  [Loti Lot] Clearing a stale git lock file...
  del /f /q ".git\index.lock"
)

where node >nul 2>nul
if not errorlevel 1 (
  echo  [Loti Lot] Refreshing lottery data before upload...
  node scripts\update-data.mjs
)

echo  [Loti Lot] Saving changes...
git add -A
git commit -m "Update site - %date% %time%"

echo  [Loti Lot] Pushing to GitHub...
git push -u origin main
if errorlevel 1 (
  echo.
  echo  [Loti Lot] Push failed. Common fixes:
  echo    - First time: GitHub may ask you to sign in - approve it in the browser.
  echo    - If the remote has newer commits, run: git pull --rebase origin main
  echo      and then double-click this file again.
  pause
  exit /b 1
)

echo  [Loti Lot] Done! Everything is up on GitHub:
echo  https://github.com/Eladshi1326/lotilot
pause
exit /b 0
