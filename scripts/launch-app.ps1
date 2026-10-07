$ErrorActionPreference = 'Stop'
$ProjectDir = Split-Path -Parent $PSScriptRoot
$Node = (Get-Command node.exe -ErrorAction Stop).Source
$Child = Start-Process -FilePath $Node -ArgumentList ('"{0}"' -f (Join-Path $ProjectDir 'app.js')) -WorkingDirectory $ProjectDir -WindowStyle Hidden -Wait -PassThru
exit $Child.ExitCode
