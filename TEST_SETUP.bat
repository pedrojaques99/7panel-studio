@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title 7Panel Studio - Test Suite

set PASS=0
set FAIL=0
set WARN=0

echo.
echo  =====================================================
echo    7Panel Studio - FULL TEST SUITE
echo  =====================================================
echo.

:: ── 1. File structure ────────────────────────────────────────────────────────
echo  [TEST] File structure...

if exist "jaques.vbs"       (echo   [OK] jaques.vbs     & set /a PASS+=1) else (echo   [FAIL] jaques.vbs MISSING     & set /a FAIL+=1)
if exist "LAUNCH.bat"       (echo   [OK] LAUNCH.bat     & set /a PASS+=1) else (echo   [FAIL] LAUNCH.bat MISSING     & set /a FAIL+=1)
if exist "START.bat"        (echo   [OK] START.bat      & set /a PASS+=1) else (echo   [FAIL] START.bat MISSING      & set /a FAIL+=1)
if exist "backend"          (echo   [OK] backend/       & set /a PASS+=1) else (echo   [FAIL] backend/ MISSING       & set /a FAIL+=1)
if exist "keyboard-ui"      (echo   [OK] keyboard-ui/   & set /a PASS+=1) else (echo   [FAIL] keyboard-ui/ MISSING   & set /a FAIL+=1)

:: ── 2. Backend files ─────────────────────────────────────────────────────────
echo.
echo  [TEST] Backend files...

if exist "backend\dashboard_server.py" (echo   [OK] dashboard_server.py & set /a PASS+=1) else (echo   [FAIL] dashboard_server.py MISSING & set /a FAIL+=1)
if exist "backend\requirements.txt"    (echo   [OK] requirements.txt    & set /a PASS+=1) else (echo   [FAIL] requirements.txt MISSING    & set /a FAIL+=1)
if exist "backend\keyboard_config.json" (echo   [OK] keyboard_config.json & set /a PASS+=1) else (echo   [FAIL] keyboard_config.json MISSING & set /a FAIL+=1)
if exist "backend\yt_bot.py"           (echo   [OK] yt_bot.py           & set /a PASS+=1) else (echo   [FAIL] yt_bot.py MISSING           & set /a FAIL+=1)

:: ── 3. No stale paths in scripts ─────────────────────────────────────────────
echo.
echo  [TEST] No stale paths in scripts...

findstr /i /c:"New English software" LAUNCH.bat >nul 2>&1
if errorlevel 1 (echo   [OK] LAUNCH.bat has no stale paths & set /a PASS+=1) else (echo   [FAIL] LAUNCH.bat still references old folder name & set /a FAIL+=1)

findstr /i /c:"New English software" START.bat >nul 2>&1
if errorlevel 1 (echo   [OK] START.bat has no stale paths & set /a PASS+=1) else (echo   [FAIL] START.bat still references old folder name & set /a FAIL+=1)

findstr /i /c:"7Panel Studio.vbs" LAUNCH.bat >nul 2>&1
if errorlevel 1 (echo   [OK] LAUNCH.bat does not reference missing VBS & set /a PASS+=1) else (echo   [FAIL] LAUNCH.bat references "7Panel Studio.vbs" which does not exist & set /a FAIL+=1)

findstr /i /c:"\backend" jaques.vbs >nul 2>&1
if not errorlevel 1 (echo   [OK] jaques.vbs points to \backend & set /a PASS+=1) else (echo   [FAIL] jaques.vbs does not point to \backend & set /a FAIL+=1)

:: ── 4. No leaked secrets ─────────────────────────────────────────────────────
echo.
echo  [TEST] No leaked secrets...

if not exist "backend\client_secret.json" (echo   [OK] client_secret.json not in repo  & set /a PASS+=1) else (echo   [WARN] client_secret.json present - should be in .gitignore & set /a WARN+=1)
if not exist "backend\yt_token.json"      (echo   [OK] yt_token.json not in repo       & set /a PASS+=1) else (echo   [WARN] yt_token.json present - should be in .gitignore      & set /a WARN+=1)

:: ── 5. Dependencies available ────────────────────────────────────────────────
echo.
echo  [TEST] Runtime dependencies...

python --version >nul 2>&1
if not errorlevel 1 (
    for /f "tokens=*" %%v in ('python --version 2^>^&1') do echo   [OK] %%v
    set /a PASS+=1
) else (
    echo   [FAIL] Python not found
    set /a FAIL+=1
)

npm --version >nul 2>&1
if not errorlevel 1 (
    for /f "tokens=*" %%v in ('node --version 2^>^&1') do echo   [OK] Node %%v
    set /a PASS+=1
) else (
    echo   [FAIL] Node/npm not found
    set /a FAIL+=1
)

:: ── 6. Python imports ────────────────────────────────────────────────────────
echo.
echo  [TEST] Python imports (backend deps)...

python -c "import flask; print('  [OK] flask', flask.__version__)" 2>&1 || (echo   [FAIL] flask not installed & set /a FAIL+=1)
python -c "import flask_cors; print('  [OK] flask-cors')" 2>&1 || (echo   [FAIL] flask-cors not installed & set /a FAIL+=1)
python -c "import comtypes; print('  [OK] comtypes')" 2>&1 || (echo   [FAIL] comtypes not installed & set /a FAIL+=1)

:: ── 7. Node modules ─────────────────────────────────────────────────────────
echo.
echo  [TEST] Node modules...

if exist "keyboard-ui\node_modules" (
    echo   [OK] node_modules installed
    set /a PASS+=1
) else (
    echo   [WARN] node_modules missing - run: cd keyboard-ui ^&^& npm install
    set /a WARN+=1
)

if exist "keyboard-ui\package.json" (echo   [OK] package.json & set /a PASS+=1) else (echo   [FAIL] package.json MISSING & set /a FAIL+=1)

:: ── 8. Quick backend smoke test ──────────────────────────────────────────────
echo.
echo  [TEST] Backend syntax check...

python -c "import py_compile; py_compile.compile(r'backend\dashboard_server.py', doraise=True); print('  [OK] dashboard_server.py compiles')" 2>&1
if errorlevel 1 (set /a FAIL+=1) else (set /a PASS+=1)

:: ── Results ──────────────────────────────────────────────────────────────────
echo.
echo  =====================================================
echo    RESULTS:  %PASS% passed  /  %FAIL% failed  /  %WARN% warnings
echo  =====================================================

if %FAIL% gtr 0 (
    echo.
    echo   [!] Some tests FAILED. Fix the issues above before launching.
    echo.
) else (
    echo.
    echo   All critical tests passed!
    echo   Run LAUNCH.bat to start 7Panel Studio.
    echo.
)

pause
