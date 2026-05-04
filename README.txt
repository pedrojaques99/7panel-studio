=====================================================
  7Panel Studio - by MUD Co. & Jaques
=====================================================

A live dashboard and automation backend for a physical
mini keyboard on Windows. Map keys to scripts, control
app volumes, play sounds, manage a YouTube bot — all
from a single React UI.


QUICK START
-----------
1. Double-click LAUNCH.bat
2. It will check for Python, Node.js, and ffmpeg
3. For each missing dependency, you'll be asked:
      Install via winget? [Y/N]
4. On first run, it installs Python and Node packages
   (also asks before installing)
5. App opens at http://localhost:5173


MANUAL SETUP
------------
If you prefer to install manually:

  # Backend
  cd backend
  pip install -r requirements.txt
  python dashboard_server.py

  # Frontend (separate terminal)
  cd keyboard-ui
  npm install
  npm run dev


REQUIREMENTS
------------
- Windows 10/11
- Python 3.10+    https://python.org/downloads
- Node.js 18+     https://nodejs.org
- ffmpeg (optional, for audio conversion)


PROJECT STRUCTURE
-----------------
7panel_studio/
  backend/                  Python backend
    dashboard_server.py     Flask API (port 5000)
    keyboard_controller.py  Key mapping logic
    keyboard_daemon.py      Background key listener
    mixer_controller.py     Windows audio mixer
    yt_bot.py               YouTube chat bot
    requirements.txt        Python dependencies
    keyboard_config.json    Key-to-action config
    bot_config.json         YouTube bot settings
  keyboard-ui/              React frontend (port 5173)
  LAUNCH.bat                Setup + launch (recommended)
  START.bat                 Quick start (no setup checks)
  jaques.vbs                Background launcher script
  TEST_SETUP.bat            Validates setup before launch


PANELS
------
- Soundboard      Trigger audio clips mapped to keys
- Audio Mixer     Per-app Windows volume control
- Drone           Ambient sound looper
- Loop Lab        Audio loop recorder/player
- Session         Session timer and notes
- YouTube Chat    Live chat overlay via YouTube bot
- OBS Control     Start/stop scenes and sources
- Synth           Web-based synthesizer
- Converter       Media converter panel
- Exporter        Export session recordings
- Timer           Countdown/stopwatch
- Briefing        Session briefing overlay


CONFIGURATION
-------------
backend/keyboard_config.json   Key-to-action mappings
backend/bot_config.json        YouTube bot settings
backend/client_secret.json     Google OAuth credentials
                               (not in repo - add manually)


YOUTUBE BOT
-----------
Requires a client_secret.json from Google Cloud Console:
https://console.cloud.google.com
Place it in backend/ before launching.


TROUBLESHOOTING
---------------
- "Python not found"  : Install Python, check "Add to PATH"
- "npm not found"     : Install Node.js, restart terminal
- UI doesn't load     : Wait 5 seconds, refresh browser
- Backend error       : Check if port 5000 is free
- Run TEST_SETUP.bat  : Validates all files and dependencies
