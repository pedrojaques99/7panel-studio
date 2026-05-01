# 7Panel Studio

A live dashboard and automation backend for a physical mini keyboard on Windows.  
Map keys to scripts, control app volumes, play sounds, manage a YouTube bot — all from a single React UI.

## Stack

- **Backend** — Python / Flask (`backend/dashboard_server.py`)
- **Frontend** — React + Vite + TypeScript (`keyboard-ui/`)
- **Automation** — AutoHotkey, PowerShell, VBScript

## Structure

```
7Panel Studio/
├── backend/                  ← Python backend
│   ├── dashboard_server.py   ← Flask API (port 5000)
│   ├── keyboard_controller.py
│   ├── keyboard_daemon.py
│   ├── mixer_controller.py
│   ├── yt_bot.py
│   ├── requirements.txt
│   ├── keyboard_config.json
│   ├── bot_config.json
│   ├── keyboard_integration.ahk
│   └── KEYBOARD_SETUP.md
├── keyboard-ui/              ← React frontend (port 5173)
├── 7Panel Studio.vbs         ← Launcher script
├── LAUNCH.bat                ← Setup + launch
└── START.bat
```

## Panels

| Panel | Description |
|-------|-------------|
| Soundboard | Trigger audio clips mapped to keys |
| Audio Mixer | Per-app Windows volume control |
| Drone | Ambient sound looper |
| Loop Lab | Audio loop recorder/player |
| Session | Session timer and notes |
| YouTube Chat | Live chat overlay via YouTube bot |
| OBS Control | Start/stop scenes and sources |
| Synth | Web-based synthesizer |
| Converter | Media converter panel |
| Exporter | Export session recordings |
| Timer | Countdown/stopwatch |
| Briefing | Session briefing overlay |

## Quick Start

**Prerequisites:** [Python 3.x](https://python.org/downloads) · [Node.js](https://nodejs.org) · [Git](https://git-scm.com)

```
git clone https://github.com/pedrojaques99/mini-keyboard-dashboard
cd mini-keyboard-dashboard
double-click LAUNCH.bat
```

`LAUNCH.bat` installs all dependencies on first run, then starts the backend and opens the UI at `http://localhost:5173`.

## Manual Setup

```bash
# Backend
cd backend
pip install -r requirements.txt
python dashboard_server.py

# Frontend (separate terminal)
cd keyboard-ui
npm install
npm run dev
```

## Configuration

| File | Purpose |
|------|---------|
| `backend/keyboard_config.json` | Key→action mappings |
| `backend/bot_config.json` | YouTube bot settings |
| `backend/client_secret.json` | Google OAuth credentials *(not in repo — add manually)* |

## YouTube Bot

Requires a `client_secret.json` from [Google Cloud Console](https://console.cloud.google.com).  
Place it in `backend/` before launching.
