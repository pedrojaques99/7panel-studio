@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

title Iniciando Mini Keyboard Control...
echo Verificando dependencias...

:: Inicia o Daemon em uma nova janela minimizada
start /min cmd /c "python keyboard_daemon.py"

:: Inicia o AutoHotkey (verifica se existe antes)
if exist "keyboard_integration.ahk" (
    start "" "keyboard_integration.ahk"
) else (
    echo [ERRO] keyboard_integration.ahk nao encontrado!
)

:: Inicia o Dashboard
if exist "START_DASHBOARD.bat" (
    start "" "START_DASHBOARD.bat"
) else (
    echo [ERRO] START_DASHBOARD.bat nao encontrado!
)

echo.
echo ===========================================
echo   SISTEMA INICIADO COM SUCESSO!
echo   O teclado ja deve estar respondendo.
echo ===========================================
echo.
pause
