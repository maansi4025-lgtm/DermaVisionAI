@echo off
title DermaVision Frontend
cd /d "%~dp0frontend"
where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install the LTS version from nodejs.org, then run this again.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing packages (first run takes a few minutes)...
  call npm install
)
echo.
echo Frontend starting at http://localhost:5173
echo If it says port 5173 is in use, close any other window running the frontend and try again.
call npm run dev
pause
