import json
import subprocess
import os
import sys
import ctypes
from pathlib import Path
from ctypes import *
from comtypes import *
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

import time

# Support for user-installed packages
user_site = os.path.expandvars(r'%APPDATA%\Python\Python313\site-packages')
if user_site not in sys.path:
    sys.path.append(user_site)

try:
    from pycaw.pycaw import AudioUtilities, ISimpleAudioVolume
except ImportError:
    logger.warning("pycaw not installed. Volume control will be disabled.")
    AudioUtilities = None

CONFIG_FILE = Path(__file__).parent / "keyboard_config.json"

class AppVolumeController:
    """Control volume for specific applications"""

    def __init__(self):
        self.sessions = {}

    def _get_app_volume(self, app_name):
        """Get volume object for specific app"""
        if not AudioUtilities:
            return None

        try:
            sessions = AudioUtilities.GetAllSessions()
            for session in sessions:
                if session.Process and session.Process.name().lower() == app_name.lower():
                    volume = session.SimpleAudioVolume
                    return volume
        except Exception as e:
            logger.error(f"Error getting app volume: {e}")
        return None

    def set_volume(self, app_name, volume_level):
        """Set volume for app (0.0 - 1.0)"""
        volume = self._get_app_volume(app_name)
        if volume:
            try:
                volume.SetMasterVolume(max(0, min(1, volume_level)), None)
                logger.info(f"Set {app_name} volume to {volume_level:.0%}")
                return True
            except Exception as e:
                logger.error(f"Error setting volume: {e}")
        else:
            logger.warning(f"App '{app_name}' not found or not playing audio")
        return False

    def adjust_volume(self, app_name, delta):
        """Adjust volume by delta (-0.1 to 0.1)"""
        volume = self._get_app_volume(app_name)
        if volume:
            try:
                current = volume.GetMasterVolume()
                new_volume = max(0, min(1, current + delta))
                volume.SetMasterVolume(new_volume, None)
                logger.info(f"Adjusted {app_name} volume: {current:.0%} → {new_volume:.0%}")
                return True
            except Exception as e:
                logger.error(f"Error adjusting volume: {e}")
        return False


class KeyboardController:
    """Main keyboard action controller"""

    def __init__(self, config_file):
        self.config = self._load_config(config_file)
        self.volume_controller = AppVolumeController()

    def _load_config(self, config_file):
        """Load configuration from JSON"""
        try:
            with open(config_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except FileNotFoundError:
            logger.error(f"Config file not found: {config_file}")
            return {}
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON config: {e}")
            return {}

    def execute_action(self, action_key):
        """Execute action based on configuration (searches root, buttons, and volume_controls)"""
        action = self.config.get(action_key)
        
        # If not at root, check specialized dictionaries
        if not action:
            action = self.config.get("buttons", {}).get(action_key)
        if not action:
            action = self.config.get("volume_controls", {}).get(action_key)

        if not action:
            logger.warning(f"Action '{action_key}' not configured in root, 'buttons' or 'volume_controls'")
            return False
        action_type = action.get("type")

        try:
            if action_type == "open_app":
                return self._open_app(action)
            elif action_type == "run_script":
                return self._run_script(action)
            elif action_type == "set_volume":
                return self._set_volume(action)
            elif action_type == "adjust_volume":
                return self._adjust_volume(action)
            elif action_type == "play_audio":
                return self._play_audio(action, action_key)
            else:
                logger.error(f"Unknown action type: {action_type}")
                return False
        except Exception as e:
            logger.error(f"Error executing action '{action_key}': {e}")
            return False

    def _open_app(self, action):
        """Open application with proper working directory"""
        app_path = action.get("path")
        args = action.get("args", "")
        
        # Ensure apps like OBS load plugins/DLLs by setting CWD to their bin folder
        cwd = os.path.dirname(app_path) if os.path.isabs(app_path) else None

        try:
            if args:
                subprocess.Popen([app_path] + args.split(), cwd=cwd)
            else:
                subprocess.Popen(app_path, cwd=cwd)
            logger.info(f"Opened: {app_path} (CWD: {cwd})")
            return True
        except Exception as e:
            logger.error(f"Failed to open app: {e}")
            return False

    def _run_script(self, action):
        """Execute PowerShell script"""
        script_path = action.get("path")
        args = action.get("args", "")

        try:
            cmd = f'powershell -NoProfile -ExecutionPolicy Bypass -File "{script_path}"'
            if args:
                cmd += f' {args}'

            subprocess.Popen(cmd, shell=True)
            logger.info(f"Executed script: {script_path}")
            return True
        except Exception as e:
            logger.error(f"Failed to run script: {e}")
            return False

    def _set_volume(self, action):
        """Set app volume to specific level"""
        app_name = action.get("app")
        volume = action.get("volume", 0.5)
        return self.volume_controller.set_volume(app_name, volume)

    def _adjust_volume(self, action):
        """Adjust app volume"""
        app_name = action.get("app")
        delta = action.get("delta", 0.05)
        return self.volume_controller.adjust_volume(app_name, delta)

    def _play_audio(self, action, action_key: str = ''):
        """Toggle audio via dashboard_server (tracks process per key to avoid overlap)."""
        audio_path = os.path.abspath(action.get("path"))
        try:
            import urllib.request, json as _json
            payload = _json.dumps({'key': action_key, 'path': audio_path}).encode()
            req = urllib.request.Request(
                'http://localhost:5000/api/audio/play-toggle',
                data=payload, headers={'Content-Type': 'application/json'}, method='POST'
            )
            urllib.request.urlopen(req, timeout=2)
            return True
        except Exception as e:
            logger.error(f"Failed to toggle audio via server: {e}")
            return False

def notify_ui(action_key: str):
    """Notify the React dashboard that a key was pressed."""
    try:
        import urllib.request, json as _json
        payload = _json.dumps({'key': action_key}).encode()
        req = urllib.request.Request(
            'http://localhost:5000/api/key-event',
            data=payload, headers={'Content-Type': 'application/json'}, method='POST'
        )
        urllib.request.urlopen(req, timeout=0.5)
    except Exception:
        pass  # Dashboard may not be running


def main():
    controller = KeyboardController(CONFIG_FILE)

    if len(sys.argv) > 1:
        action_key = sys.argv[1]
        controller.execute_action(action_key)
        notify_ui(action_key)
    else:
        print("Usage: python keyboard_controller.py <action_key>")
        print(f"Available actions: {list(controller.config.keys())}")


if __name__ == "__main__":
    main()