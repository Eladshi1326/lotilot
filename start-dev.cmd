@echo off
title Loti Lot - Launcher
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [Loti Lot] Node.js is not installed on this computer.
  echo  Opening the download page - install the LTS version, then run this file again.
  start https://nodejs.org/
  pause
  exit /b 1
)

if not exist node_modules (
  echo.
  echo  [Loti Lot] First run - installing dependencies, this can take a minute or two...
  call npm install
  if errorlevel 1 (
    echo  [Loti Lot] npm install failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)

echo  [Loti Lot] Opening VS Code...
where code >nul 2>nul
if errorlevel 1 (
  echo  [Loti Lot] VS Code command-line tool not found - skipping. Open the folder manually in VS Code.
) else (
  start "" cmd /c "code ."
)

echo  [Loti Lot] Starting the local site in a new window...
start "Loti Lot - Local Server" cmd /k "npm run dev"

echo  [Loti Lot] Done! The site will open in your browser in a few seconds.
timeout /t 4 >nul
exit /b 0
