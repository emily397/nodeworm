@echo off
title NodeWorm Agent installer
echo Installing the NodeWorm Agent...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop';" ^
  "$dir=Join-Path $env:LOCALAPPDATA 'NodeWormAgent';" ^
  "New-Item -ItemType Directory -Force -Path $dir | Out-Null;" ^
  "$exe=Join-Path $dir 'nodeworm-agent.exe';" ^
  "Write-Host 'Downloading NodeWorm Agent (this may take a moment)...' -ForegroundColor Cyan;" ^
  "try {" ^
    "Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/emily397/nodeworm/releases/latest/download/nodeworm-agent.exe' -OutFile $exe;" ^
  "} catch {" ^
    "Write-Host ('Download failed: '+$_.Exception.Message) -ForegroundColor Red;" ^
    "Write-Host 'Check your internet connection and try again.' -ForegroundColor Yellow;" ^
    "pause; exit 1" ^
  "};" ^
  "Unblock-File -Path $exe;" ^
  "Write-Host 'Starting NodeWorm Agent in background...' -ForegroundColor Cyan;" ^
  "Start-Process -FilePath $exe -WindowStyle Hidden;" ^
  "New-ItemProperty -Path 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run' -Name 'NodeWormAgent' -Value $exe -PropertyType String -Force | Out-Null;" ^
  "Write-Host 'Done! NodeWorm Agent is running.' -ForegroundColor Green;" ^
  "Write-Host 'Go back to NodeWorm and click re-check.' -ForegroundColor Cyan"
echo.
echo NodeWorm Agent installed. Go back to NodeWorm and click "I installed it, re-check".
echo.
pause
