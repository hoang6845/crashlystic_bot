param (
    [ValidateSet('Register', 'Unregister', 'Status', 'Run')]
    [string]$Action = 'Register'
)
$ErrorActionPreference = 'Stop'
$TaskName = 'FirebaseCrashReportDaily'
$ProjectDir = Split-Path -Parent $PSScriptRoot
if ($Action -eq 'Register') {
    Get-Command node.exe -ErrorAction Stop | Out-Null
    if (!(Test-Path (Join-Path $ProjectDir 'node_modules'))) { throw 'Run npm ci first.' }
    if (!(Test-Path (Join-Path $ProjectDir '.env'))) { throw 'Create .env from .env.example first.' }
    $CurrentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    $Arguments = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}"' -f (Join-Path $PSScriptRoot 'launch-app.ps1')
    $TaskAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $Arguments -WorkingDirectory $ProjectDir
    $Trigger = New-ScheduledTaskTrigger -AtLogOn -User $CurrentUser
    $Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
    $Principal = New-ScheduledTaskPrincipal -UserId $CurrentUser -LogonType Interactive
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Register-ScheduledTask -TaskName $TaskName -Action $TaskAction -Trigger $Trigger -Settings $Settings -Principal $Principal -Force | Out-Null
    Write-Host 'Installed. Starts at Windows sign-in; reports at REPORT_TIME in Vietnam time.'
} elseif ($Action -eq 'Unregister') {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
} elseif ($Action -eq 'Run') {
    Start-ScheduledTask -TaskName $TaskName
} else {
    Get-ScheduledTask -TaskName $TaskName
    Get-ScheduledTaskInfo -TaskName $TaskName
}
