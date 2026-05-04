@echo off
title Mini Keyboard — Starting...

echo [1/2] Starting Flask backend...
start "Flask Backend" cmd /k "cd /d "%~dp0backend" && python dashboard_server.py"

timeout /t 2 /nobreak >nul

echo [2/2] Starting UI...
start "Keyboard UI" cmd /k "cd /d "%~dp0keyboard-ui" && npm run dev"

timeout /t 3 /nobreak >nul
start http://localhost:5173
