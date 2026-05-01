"""
Keyboard Daemon - Listen for keyboard events and execute actions
Runs in background alongside MINI_KEYBOARD.exe
"""

import json
from pathlib import Path
from keyboard_controller import KeyboardController
import logging
import time

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("keyboard_daemon.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

CONFIG_FILE = Path(__file__).parent / "keyboard_config.json"

class KeyboardDaemon:
    """Run as background service"""

    def __init__(self):
        self.controller = KeyboardController(CONFIG_FILE)
        logger.info("Keyboard Daemon initialized")

    def start(self):
        """Start listening (placeholder - integrate with your device)"""
        logger.info("Keyboard Daemon started")
        logger.info(f"Loaded {len(self.controller.config)} actions")
        print("\n=== Keyboard Daemon Running ===")
        print("Actions loaded:")
        for key, action in self.controller.config.items():
            if isinstance(action, dict):
                print(f"  {key}: {action.get('label', 'no label')}")
        print("\nPress Ctrl+C to stop\n")

        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            logger.info("Keyboard Daemon stopped")
            print("\nDaemon stopped.")

    def execute(self, action_key):
        """Execute action (called from external trigger)"""
        logger.info(f"Executing action: {action_key}")
        return self.controller.execute_action(action_key)


if __name__ == "__main__":
    daemon = KeyboardDaemon()
    daemon.start()
