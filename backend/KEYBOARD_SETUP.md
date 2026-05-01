# Mini Keyboard Controller - Setup Guide

Sistema para rodar scripts, abrir apps e controlar volume de aplicações específicas no seu mini teclado.

## 🚀 Quick Start

### 1. Setup Inicial
```powershell
powershell -ExecutionPolicy Bypass -File setup.ps1
```

Isso instala:
- `pycaw` - controle de volume por app
- `comtypes` - compatibilidade COM

### 2. Configurar Ações

Edite **`keyboard_config.json`** e customize as ações:

```json
{
  "key_1": {
    "type": "open_app",
    "label": "Open VS Code",
    "path": "code"
  },
  "key_2": {
    "type": "run_script",
    "label": "Export VSN",
    "path": "C:\\scripts\\vsn-exporter.ps1",
    "args": ""
  },
  "obs_volume_up": {
    "type": "adjust_volume",
    "app": "obs64.exe",
    "delta": 0.05
  }
}
```

### 3. Mapear Botões do Teclado

Edite **`keyboard_integration.ahk`** para mapear suas teclas físicas:

```autohotkey
; Substitua F1, F2, etc. pelos seus botões reais
F1::ExecuteAction("key_1")
F2::ExecuteAction("obs_volume_up")
F3::ExecuteAction("vsn_export")
```

### 4. Rodar

**Terminal 1** - Daemon:
```bash
python keyboard_daemon.py
```

**Terminal 2** - AutoHotkey (ou clique 2x no arquivo):
```bash
keyboard_integration.ahk
```

## 📋 Tipos de Ação Suportados

### Abrir Aplicação
```json
{
  "type": "open_app",
  "path": "C:\\Program Files\\app.exe",
  "args": "-flag value"
}
```

### Executar Script PowerShell
```json
{
  "type": "run_script",
  "path": "C:\\scripts\\my-script.ps1",
  "args": "param1 param2"
}
```

### Ajustar Volume de App
```json
{
  "type": "adjust_volume",
  "app": "obs64.exe",
  "delta": 0.05
}
```

### Definir Volume Específico
```json
{
  "type": "set_volume",
  "app": "spotify.exe",
  "volume": 0.5
}
```

## 🎛️ Controle de Volume por App

Funciona para qualquer app que produz áudio:
- OBS Studio: `obs64.exe`
- Spotify: `spotify.exe`
- Discord: `Discord.exe`
- Chrome: `chrome.exe`
- Qualquer outro...

**Encontrar nome do app:**
1. Abra Task Manager (Ctrl+Shift+Esc)
2. Procure pelo app que quer controlar
3. Copie o nome exato da coluna "Name"

## 🔍 Testando

Teste manualmente:
```bash
python keyboard_controller.py key_1
python keyboard_controller.py obs_volume_up
```

Logs salvos em: `keyboard_daemon.log`

## 🛠️ Troubleshooting

**"App not found"**
- Verifique o caminho em `keyboard_config.json`
- Use full path: `C:\\Program Files\\app.exe`

**Volume control não funciona**
- App deve estar produzindo áudio
- Verifique nome em Task Manager
- Rode como admin se necessário

**AutoHotkey não detecta botões**
- Identifique códigos reais dos seus botões
- Use Spy++ ou AHK menu Tools → Key History

## 📁 Arquivos

- `keyboard_controller.py` - Engine principal
- `keyboard_daemon.py` - Daemon que roda 24/7
- `keyboard_integration.ahk` - Mapear botões
- `keyboard_config.json` - Suas ações
- `setup.ps1` - Setup inicial

## 💡 Exemplos Práticos

### Workflow OBS
```json
{
  "obs_start": {"type": "open_app", "path": "C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe"},
  "obs_vol_up": {"type": "adjust_volume", "app": "obs64.exe", "delta": 0.05},
  "obs_vol_down": {"type": "adjust_volume", "app": "obs64.exe", "delta": -0.05},
  "export_video": {"type": "run_script", "path": "C:\\scripts\\export.ps1"}
}
```

### Botões Multifuncionais (com clicks)
Configure em `keyboard_integration.ahk`:
```autohotkey
F1::ExecuteAction("key_1")                    ; Single
F1 & F2::ExecuteAction("key_1_f2")            ; F1 + F2
F1 & LCtrl::ExecuteAction("key_1_ctrl")       ; F1 + Ctrl
```

## 📞 Próximos Passos

1. ✅ Setup executado
2. Configure `keyboard_config.json`
3. Mapear `keyboard_integration.ahk`
4. Teste cada ação
5. Rode daemon + AutoHotkey

**Sucesso!** 🎉