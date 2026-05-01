@echo off
echo Installing audio mixer dependencies...
pip install pycaw psutil comtypes
echo Done! Restart dashboard_server.py to apply.
pause