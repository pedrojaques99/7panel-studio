# Script para verificar se os processos do teclado estao ativos
$daemon = Get-CimInstance Win32_Process -Filter "Name = 'python.exe' AND CommandLine LIKE '%keyboard_daemon.py%'"
$ahk = Get-Process AutoHotkey -ErrorAction SilentlyContinue

Clear-Host
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "      STATUS DO MINI KEYBOARD CONTROLLER" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""

if ($daemon) {
    Write-Host "[ OK ] Daemon Python (keyboard_daemon.py) esta RODANDO." -ForegroundColor Green
} else {
    Write-Host "[ ERRO ] Daemon Python esta DESLIGADO." -ForegroundColor Red
}

if ($ahk) {
    Write-Host "[ OK ] AutoHotkey (Integração) esta RODANDO." -ForegroundColor Green
} else {
    Write-Host "[ ERRO ] AutoHotkey esta DESLIGADO." -ForegroundColor Red
}

Write-Host ""
Write-Host "Dica: Use o START_KEYBOARD.bat para ligar tudo." -ForegroundColor Gray
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "Pressione qualquer tecla para sair..."
$null = [Console]::ReadKey($true)
