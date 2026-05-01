#NoEnv
SendMode Input
SetWorkingDir %A_ScriptDir%

; Configurações
pythonScript := "keyboard_controller.py"

; Função para executar ação via Python
ExecuteAction(actionKey) {
    global pythonScript
    cmd := "python """ . pythonScript . """ """ . actionKey . """"
    shell := ComObjCreate("WScript.Shell")
    msg := "Executed: " . actionKey
    shell.Run(cmd, 0, false)
    Tooltip, %msg%
    SetTimer, RemoveTooltip, 2000
    return
}

RemoveTooltip:
    Tooltip
    return

; --- MAPEAMENTO DE TECLAS (TODOS OS 12 BOTÕES) ---

F13::ExecuteAction("key_f13")
F14::ExecuteAction("key_f14")
F15::ExecuteAction("key_f15")
F16::ExecuteAction("key_f16")
F17::ExecuteAction("key_f17")
F18::ExecuteAction("key_f18")
F19::ExecuteAction("key_f19")
F20::ExecuteAction("key_f20")
F21::ExecuteAction("key_f21")
F22::ExecuteAction("key_f22")
F23::ExecuteAction("key_f23")
F24::ExecuteAction("key_f24")

; Exemplo: Controle de Volume do OBS (F4 / F5 se configurado no teclado)
F4::ExecuteAction("obs_volume_up")
F5::ExecuteAction("obs_volume_down")

; Recarregar este script (Ctrl + Alt + R)
^!r::Reload