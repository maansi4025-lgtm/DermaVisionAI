@echo off
title DermaVision Backend
cd /d "%~dp0backend"
where python >nul 2>nul
if errorlevel 1 (
  echo Python was not found. Install Python 3.12 from python.org and tick "Add python.exe to PATH", then run this again.
  pause
  exit /b 1
)
if not exist .venv (
  echo Creating virtual environment...
  python -m venv .venv
)
call .venv\Scripts\activate.bat
echo Installing/Checking packages (first run takes a few minutes)...
pip install -r requirements.txt
if not exist .env (
  copy .env.example .env >nul
  echo Created backend\.env from .env.example. Open it and set JWT_SECRET.
)
echo.
echo Backend starting at http://localhost:8000  (health check: http://localhost:8000/api/health)
echo Press Ctrl+C to stop.
uvicorn app.main:app --reload --port 8000
pause
