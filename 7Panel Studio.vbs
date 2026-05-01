' ─── 7Panel Studio ───────────────────────────────────────────────────────────
' 7Panel Studio - by MUD Co. & Jaques
' Single-instance launcher. Kills orphan processes before starting.
' Idempotente: rodar varias vezes nao acumula processos zombie.

Set sh = CreateObject("WScript.Shell")
Dim base : base = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)

' Kill orphan python processes via WMI (filtra por CommandLine, preserva
' outros pythons do user). Stderr suprimido pra nao floodar.
sh.Run "powershell.exe -NoProfile -WindowStyle Hidden -Command ""Get-CimInstance Win32_Process -Filter \""Name='python.exe'\"" | Where-Object { $_.CommandLine -match 'dashboard_server|yt_bot' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }""", 0, True

' Pequena espera pro socket :5000 liberar.
WScript.Sleep 600

sh.Run "cmd /c cd /d """ & base & "\New English software is set in the upgrade model-20240908"" && python dashboard_server.py", 0, False
WScript.Sleep 2000
sh.Run "cmd /c cd /d """ & base & "\New English software is set in the upgrade model-20240908"" && python yt_bot.py", 1, False
WScript.Sleep 1000
sh.Run "cmd /c cd /d """ & base & "\keyboard-ui"" && npm run dev", 0, False
WScript.Sleep 3000
sh.Run "http://localhost:5173"
