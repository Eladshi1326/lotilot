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
  git init
)

git config user.email >nul 2>nul
if errorlevel 1 (
  echo  [Loti Lot] Setting git identity for this repository...
  git config user.name "Elad"
  git config user.email "eladshi1326@gmail.com"
)

echo  [Loti Lot] Saving changes...
git add -A
git commit -m "Update site - %date% %time%"

git remote get-url origin >nul 2>nul
if errorlevel 1 (
  echo.
  echo  ============================================================
  echo   No GitHub repository is connected yet.
  echo   When you have one, run this command here once:
  echo.
  echo     git remote add origin https://github.com/USER/REPO.git
  echo.
  echo   Then double-click this file again to upload.
  echo  ============================================================
  pause
  exit /b 0
)

echo  [Loti Lot] Pushing to GitHub...
git push -u origin HEAD
if errorlevel 1 (
  echo.
  echo  [Loti Lot] Push failed. Common fixes:
  echo    - First time: GitHub may ask you to sign in - approve it in the browser.
  echo    - If the remote has newer commits, run: git pull --rebase origin
  pause
  exit /b 1
)

echo  [Loti Lot] Done! Everything is up on GitHub.
pause
exit /b 0
