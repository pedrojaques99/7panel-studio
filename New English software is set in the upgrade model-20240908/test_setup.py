"""
Quick test to verify keyboard controller setup
"""

import sys
import json
from pathlib import Path
import subprocess

print("\n" + "="*50)
print("KEYBOARD CONTROLLER - SETUP TEST")
print("="*50 + "\n")

# Test 1: Check Python version
print("[1/5] Checking Python version...")
version = sys.version.split()[0]
if version >= "3.8":
    print(f"  ✓ Python {version}")
else:
    print(f"  ✗ Python {version} (need 3.8+)")
    sys.exit(1)

# Test 2: Check dependencies
print("[2/5] Checking dependencies...")
try:
    import pycaw
    print("  ✓ pycaw installed")
except ImportError:
    print("  ✗ pycaw not found - run: pip install pycaw")

try:
    import comtypes
    print("  ✓ comtypes installed")
except ImportError:
    print("  ✗ comtypes not found - run: pip install comtypes")

# Test 3: Check config file
print("[3/5] Checking config file...")
config_file = Path(__file__).parent / "keyboard_config.json"
if config_file.exists():
    try:
        with open(config_file) as f:
            config = json.load(f)
        actions = len(config.get("buttons", {})) + len(config.get("volume_controls", {}))
        print(f"  ✓ Config file found ({actions} actions)")
    except json.JSONDecodeError:
        print("  ✗ Invalid JSON in config")
else:
    print("  ✗ Config file not found")

# Test 4: Check scripts
print("[4/5] Checking Python scripts...")
scripts = ["keyboard_controller.py", "keyboard_daemon.py"]
for script in scripts:
    if (Path(__file__).parent / script).exists():
        print(f"  ✓ {script}")
    else:
        print(f"  ✗ {script} not found")

# Test 5: Test controller instantiation
print("[5/5] Testing keyboard controller...")
try:
    from keyboard_controller import KeyboardController
    controller = KeyboardController(config_file)
    print(f"  ✓ Controller initialized with {len(controller.config)} actions")
except Exception as e:
    print(f"  ✗ Error: {e}")

print("\n" + "="*50)
print("SUMMARY")
print("="*50)
print("\nNext steps:")
print("1. Edit keyboard_config.json")
print("2. Edit keyboard_integration.ahk")
print("3. Run: python keyboard_daemon.py")
print("4. Run: keyboard_integration.ahk")
print("\nFor help, see: KEYBOARD_SETUP.md\n")
