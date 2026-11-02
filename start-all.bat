@echo off
start "DermaVision Backend" cmd /k "%~dp0start-backend.bat"
timeout /t 5 >nul
start "DermaVision Frontend" cmd /k "%~dp0start-frontend.bat"
timeout /t 8 >nul
start http://localhost:5173
