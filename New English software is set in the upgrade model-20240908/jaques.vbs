Dim sh
Set sh = CreateObject("WScript.Shell")

Dim base
base = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)

Dim ui
ui = CreateObject("Scripting.FileSystemObject").GetParentFolderName(base) & "\keyboard-ui"

' 1. Flask API server (hidden)
sh.Run "cmd /c cd /d """ & base & """ && python dashboard_server.py", 0, False

' 2. Keyboard daemon (hidden)
sh.Run "cmd /c cd /d """ & base & """ && python keyboard_daemon.py", 0, False

' 3. AutoHotkey bridge (if present)
Dim ahk
ahk = base & "\keyboard_integration.ahk"
If CreateObject("Scripting.FileSystemObject").FileExists(ahk) Then
    sh.Run """" & ahk & """", 1, False
End If

' 4. Vite dev server (hidden)
sh.Run "cmd /c cd /d """ & ui & """ && npm run dev", 0, False

' 5. Wait 3 s then open browser
WScript.Sleep 3000
sh.Run "http://localhost:5173", 1, False

Set sh = Nothing
