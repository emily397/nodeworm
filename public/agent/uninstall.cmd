@echo off
title NodeWorm Agent uninstaller
echo Removing the NodeWorm Agent...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='SilentlyContinue'; foreach($r in @('HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.nodeworm.executor','HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.nodeworm.executor')){ Remove-Item -Path $r -Force -Recurse }; foreach($r in @('HKCU:\SOFTWARE\Policies\Google\Chrome\ExtensionInstallForcelist','HKCU:\SOFTWARE\Policies\Microsoft\Edge\ExtensionInstallForcelist')){ try { $v=Get-ItemProperty -Path $r -Name '1' -ErrorAction Stop; if($v.'1' -like '*nodeworm*'){ Remove-ItemProperty -Path $r -Name '1' -Force } } catch {} }; Remove-Item -Path (Join-Path $env:LOCALAPPDATA 'NodeWormAgent') -Recurse -Force; Write-Host 'NodeWorm Agent removed.' -ForegroundColor Green"
echo.
pause
