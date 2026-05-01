@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title 7Panel Studio - Setup ^& Launch

echo.
echo  =====================================================
echo    7Panel Studio - by MUD Co. ^& Jaques
echo  =====================================================
echo.

:: ── Check Python ──────────────────────────────────────────────────────────────
python --version >nul 2>&1
if errorlevel 1 (
    echo  [ERRO] Python nao encontrado.
    echo  Instale em: https://www.python.org/downloads/
    echo  Marque "Add Python to PATH" durante a instalacao.
    pause & exit /b 1
)
for /f "tokens=*" %%v in ('python --version 2^>^&1') do echo  [OK] %%v

:: ── Check Node / npm ──────────────────────────────────────────────────────────
npm --version >nul 2>&1
if errorlevel 1 (
    echo  [ERRO] Node.js / npm nao encontrado.
    echo  Instale em: https://nodejs.org/
    pause & exit /b 1
)
for /f "tokens=*" %%v in ('node --version 2^>^&1') do echo  [OK] Node %%v

:: ── Python deps ───────────────────────────────────────────────────────────────
set BACKEND=backend
if not exist "%BACKEND%\requirements.txt" goto skip_pip
echo.
echo  [1/2] Instalando dependencias Python...
python -m pip install -r "%BACKEND%\requirements.txt" --quiet
if errorlevel 1 (
    echo  [ERRO] Falha no pip install. Verifique a conexao com a internet.
    pause & exit /b 1
)
echo  [OK] Dependencias Python instaladas.
:skip_pip

:: ── Node deps ─────────────────────────────────────────────────────────────────
if not exist "keyboard-ui\node_modules" (
    echo.
    echo  [2/2] Instalando dependencias Node ^(primeira vez, pode demorar^)...
    cd keyboard-ui
    npm install --silent
    if errorlevel 1 (
        echo  [ERRO] Falha no npm install.
        cd ..
        pause & exit /b 1
    )
    cd ..
    echo  [OK] Dependencias Node instaladas.
) else (
    echo  [OK] Node modules ja instalados.
)

:: ── Check ffmpeg ──────────────────────────────────────────────────────────────
ffmpeg -version >nul 2>&1
if errorlevel 1 (
    echo.
    echo  [AVISO] ffmpeg nao encontrado no PATH.
    echo  Converter, Paulstretch e download de audio nao vao funcionar.
    echo  Instale em: https://ffmpeg.org/download.html
    echo  Ou via winget: winget install ffmpeg
    echo.
) else (
    for /f "tokens=3" %%v in ('ffmpeg -version 2^>^&1 ^| findstr /i "ffmpeg version"') do echo  [OK] ffmpeg %%v & goto ffmpeg_ok
    :ffmpeg_ok
)

:: ── Check credentials ─────────────────────────────────────────────────────────
if not exist "%BACKEND%\client_secret.json" (
    echo.
    echo  [AVISO] client_secret.json nao encontrado.
    echo  Para usar o YouTube Bot, adicione o arquivo client_secret.json
    echo  na pasta "%BACKEND%"
    echo  ^(nao incluido no repositorio por seguranca^)
    echo.
)

:: ── Launch ────────────────────────────────────────────────────────────────────
echo.
echo  Iniciando aplicacao...
echo.
wscript.exe //nologo "7Panel Studio.vbs"

exit /b 0
