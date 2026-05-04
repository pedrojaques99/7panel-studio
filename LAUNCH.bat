@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title 7Panel Studio - Setup ^& Launch
color 0F

echo.
echo  =====================================================
echo    7Panel Studio - by MUD Co. ^& Jaques
echo  =====================================================
echo.

:: ── Check Python ──────────────────────────────────────────────────────────────
python --version >nul 2>&1
if errorlevel 1 (
    echo  [X] Python nao encontrado.
    echo.
    choice /c YN /m "  Instalar Python via winget?"
    if errorlevel 2 (
        echo.
        echo  Instale manualmente em: https://www.python.org/downloads/
        echo  Marque "Add Python to PATH" durante a instalacao.
        pause & exit /b 1
    )
    winget install --id Python.Python.3 -e --silent --accept-package-agreements --accept-source-agreements
    if errorlevel 1 (
        echo  [ERRO] Falha ao instalar Python.
        pause & exit /b 1
    )
    echo  [OK] Python instalado. Reinicie o LAUNCH.bat para continuar.
    pause & exit /b 0
)
for /f "tokens=*" %%v in ('python --version 2^>^&1') do echo  [OK] %%v

:: ── Check Node / npm ──────────────────────────────────────────────────────────
npm --version >nul 2>&1
if errorlevel 1 (
    echo  [X] Node.js nao encontrado.
    echo.
    choice /c YN /m "  Instalar Node.js via winget?"
    if errorlevel 2 (
        echo.
        echo  Instale manualmente em: https://nodejs.org/
        pause & exit /b 1
    )
    winget install --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements
    if errorlevel 1 (
        echo  [ERRO] Falha ao instalar Node.js.
        pause & exit /b 1
    )
    echo  [OK] Node.js instalado. Reinicie o LAUNCH.bat para continuar.
    pause & exit /b 0
)
for /f "tokens=*" %%v in ('node --version 2^>^&1') do echo  [OK] Node %%v

:: ── Check ffmpeg ──────────────────────────────────────────────────────────────
ffmpeg -version >nul 2>&1
if errorlevel 1 (
    echo  [X] ffmpeg nao encontrado.
    echo      ^(necessario para converter audio, Paulstretch e download^)
    echo.
    choice /c YNS /m "  Instalar ffmpeg via winget? (Y=Sim / N=Nao / S=Skip)"
    if errorlevel 3 goto ffmpeg_skip
    if errorlevel 2 goto ffmpeg_skip
    winget install --id Gyan.FFmpeg -e --silent --accept-package-agreements --accept-source-agreements
    if errorlevel 1 (
        echo  [AVISO] Falha ao instalar ffmpeg. Funcoes de audio limitadas.
    ) else (
        echo  [OK] ffmpeg instalado.
        for /f "tokens=*" %%p in ('powershell -NoProfile -Command "[System.Environment]::GetEnvironmentVariable(\"PATH\",\"Machine\") + \";\" + [System.Environment]::GetEnvironmentVariable(\"PATH\",\"User\")"') do set PATH=%%p
    )
    :ffmpeg_skip
) else (
    for /f "tokens=3" %%v in ('ffmpeg -version 2^>^&1 ^| findstr /i "ffmpeg version"') do (
        echo  [OK] ffmpeg %%v
        goto ffmpeg_ok
    )
    :ffmpeg_ok
)

:: ── Python deps ───────────────────────────────────────────────────────────────
set BACKEND=backend
if not exist "%BACKEND%\requirements.txt" goto skip_pip

python -c "import flask, flask_cors, comtypes" >nul 2>&1
if errorlevel 1 (
    echo.
    echo  [X] Dependencias Python faltando ^(flask, comtypes, etc^)
    echo.
    choice /c YN /m "  Instalar dependencias Python agora?"
    if errorlevel 2 (
        echo  [AVISO] Backend pode nao funcionar sem as dependencias.
        goto skip_pip
    )
    echo.
    echo  Instalando...
    python -m pip install -r "%BACKEND%\requirements.txt" --quiet
    if errorlevel 1 (
        echo  [ERRO] Falha no pip install. Verifique a conexao com a internet.
        pause & exit /b 1
    )
    echo  [OK] Dependencias Python instaladas.
) else (
    echo  [OK] Dependencias Python ja instaladas.
)
:skip_pip

:: ── Node deps ─────────────────────────────────────────────────────────────────
if not exist "keyboard-ui\node_modules" (
    echo.
    echo  [X] node_modules nao encontrado ^(primeira vez?^)
    echo.
    choice /c YN /m "  Rodar npm install agora? (pode demorar ~1 min)"
    if errorlevel 2 (
        echo  [AVISO] A UI nao vai funcionar sem npm install.
        goto skip_npm
    )
    echo.
    echo  Instalando...
    cd keyboard-ui
    npm install
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
:skip_npm

:: ── Check credentials ─────────────────────────────────────────────────────────
if not exist "%BACKEND%\client_secret.json" (
    echo.
    echo  [AVISO] client_secret.json nao encontrado.
    echo  Para usar o YouTube Bot, adicione o arquivo client_secret.json
    echo  na pasta "%BACKEND%"
    echo  ^(nao incluido no repositorio por seguranca^)
    echo.
)

:: ── Summary ──────────────────────────────────────────────────────────────────
echo.
echo  =====================================================
echo    Setup completo! Iniciando 7Panel Studio...
echo  =====================================================
echo.

wscript.exe //nologo "jaques.vbs"

exit /b 0
