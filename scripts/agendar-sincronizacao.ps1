# Cria a tarefa do Windows que sincroniza o Daxiang com o Tracker de hora em hora (7h às 21h).
# Para remover depois: Unregister-ScheduledTask -TaskName "Tracker - Sincronizar Daxiang"
$vbs = Join-Path $PSScriptRoot "daxiang-sync-hidden.vbs"
$action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$vbs`""
$trigger = New-ScheduledTaskTrigger -Daily -At 7:00am
$trigger.Repetition = (New-ScheduledTaskTrigger -Once -At 7:00am -RepetitionInterval (New-TimeSpan -Hours 1) -RepetitionDuration (New-TimeSpan -Hours 14)).Repetition
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 20) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName "Tracker - Sincronizar Daxiang" -Description "Envia a agenda do Daxiang para o Tracker (de hora em hora, 7h-21h)" -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName "Tracker - Sincronizar Daxiang"
Write-Host ""
Write-Host "Pronto! A sincronizacao do Daxiang vai rodar sozinha de hora em hora, das 7h as 21h." -ForegroundColor Green
Write-Host "Pode fechar esta janela."
Read-Host "Aperte Enter para fechar"
