' ─── Jaques Studio — atalho ───────────────────────────────────────────────────
' Este arquivo já foi o launcher: 60 linhas de sh.Run com WScript.Sleep fixo,
' Stop-Process que matava só o processo pai e janelas ocultas sem log nenhum.
'
' Quem faz esse trabalho agora é o app Jaques Studio (Electron):
'   • ordem por readiness real (porta escutando), não por Sleep
'   • tree-kill na árvore inteira (cmd → npm → node), sem neto órfão na porta
'   • log de cada serviço na janela, em vez de 13 terminais soltos
'
' O QUE sobe é dado, não código: Z:\Cursor\jaques-os\services.json
' Sem janela (emergência):     cd Z:\Cursor\jaques-os && npm run services:up
'
' Este .vbs sobrevive só porque atalhos antigos apontam pra ele.
' Histórico do launcher original: git log deste arquivo.

Option Explicit

Dim sh, fso, i, exe, candidates
Set sh  = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

candidates = Array( _
    sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Programs\jaques-studio\Jaques Studio.exe", _
    sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Programs\Jaques Studio\Jaques Studio.exe", _
    "Z:\Cursor\jaques-os\dist-desktop\win-unpacked\Jaques Studio.exe" _
)

exe = ""
For i = 0 To UBound(candidates)
    If exe = "" And fso.FileExists(candidates(i)) Then exe = candidates(i)
Next

If exe = "" Then
    MsgBox "Jaques Studio nao encontrado." & vbCrLf & vbCrLf & _
           "Gere o instalador em Z:\Cursor\jaques-os:" & vbCrLf & _
           "    npm run desktop:build" & vbCrLf & vbCrLf & _
           "e rode dist-desktop\Jaques Studio Setup 1.0.0.exe.", _
           48, "Jaques Studio"
    WScript.Quit 1
End If

' O app tem trava de instancia unica: se ja estiver aberto, isto so foca a janela.
sh.Run """" & exe & """", 1, False
