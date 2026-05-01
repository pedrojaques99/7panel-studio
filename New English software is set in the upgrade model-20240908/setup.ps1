# Setup script for Keyboard Controller
# Run with: powershell -ExecutionPolicy Bypass -File setup.ps1

Write-Host "=== Keyboard Controller Setup ===" -ForegroundColor Green
Write-Host ""

# Check Python
Write-Host "Checking Python installation..." -ForegroundColor Cyan
python --version | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Python not found. Install Python 3.8+ first." -ForegroundColor Red
    exit 1
}
Write-Host "✓ Python found" -ForegroundColor Green

# Install pip packages
Write-Host "Installing Python dependencies..." -ForegroundColor Cyan
pip install --upgrade pip
pip install pycaw comtypes
Write-Host "✓ Dependencies installed" -ForegroundColor Green

# Check AutoHotkey
Write-Host "Checking AutoHotkey..." -ForegroundColor Cyan
$ahk = Get-Command AutoHotkey.exe -ErrorAction SilentlyContinue
if ($null -eq $ahk) {
    Write-Host "⚠ AutoHotkey not found. Install from: https://www.autohotkey.com" -ForegroundColor Yellow
    Write-Host "  Then restart this script." -ForegroundColor Yellow
} else {
    Write-Host "✓ AutoHotkey found" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== Setup Complete ===" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Edit keyboard_config.json to customize your actions"
Write-Host "2. Edit keyboard_integration.ahk to map your buttons"
Write-Host "3. Run: python keyboard_daemon.py (in another terminal)"
Write-Host "4. Run the AutoHotkey script: keyboard_integration.ahk"
Write-Host ""

Pause
