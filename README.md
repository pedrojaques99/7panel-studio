# Mini Keyboard Dashboard

A live dashboard and automation backend for a physical mini keyboard on Windows.  
Map keys to scripts, control app volumes, play sounds, manage a YouTube bot — all from a single React UI.

## Stack

- **Backend** — Python / Flask (`dashboard_server.py`)
- **Frontend** — React + Vite + TypeScript (`keyboard-ui/`)
- **Automation** — AutoHotkey, PowerShell, VBScript

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
cd "New English software is set in the upgrade model-20240908"
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
| `keyboard_config.json` | Key→action mappings |
| `bot_config.json` | YouTube bot settings |
| `client_secret.json` | Google OAuth credentials *(not in repo — add manually)* |

## YouTube Bot

Requires a `client_secret.json` from [Google Cloud Console](https://console.cloud.google.com).  
Place it in `New English software is set in the upgrade model-20240908/` before launching.
