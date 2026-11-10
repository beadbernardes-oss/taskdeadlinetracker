' Roda a sincronização do Daxiang sem abrir janela (usado pelo Agendador de Tarefas do Windows)
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
CreateObject("WScript.Shell").Run "cmd /c node """ & dir & "\daxiang-sync.mjs""", 0, True
