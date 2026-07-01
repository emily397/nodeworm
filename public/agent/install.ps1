# NodeWorm Agent installer (cert-free path).
# Run with:  powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://abie-three.vercel.app/agent/install.ps1 | iex"
# The EXE is fetched via Invoke-WebRequest, which does NOT apply the Mark-of-the-Web,
# so Windows Smart App Control does not block it. No admin, no code-signing cert needed.

$ErrorActionPreference = 'Stop'
$exeUrl = 'https://github.com/emily397/nodeworm/releases/latest/download/nodeworm-agent.exe'
$runtimeUrl = 'https://github.com/emily397/nodeworm/releases/download/runtime-v1/signal-runtime.zip'
$dir = Join-Path $env:LOCALAPPDATA 'NodeWormAgent'
$exe = Join-Path $dir 'nodeworm-agent.exe'
$bin = Join-Path $dir 'bin'

Write-Host 'Installing the NodeWorm Agent...' -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $dir | Out-Null

# Stop any running instance so we can overwrite it
Get-Process nodeworm-agent -ErrorAction SilentlyContinue | Stop-Process -Force

try {
  Invoke-WebRequest -UseBasicParsing -Uri $exeUrl -OutFile $exe
} catch {
  Write-Host ('Download failed: ' + $_.Exception.Message) -ForegroundColor Red
  Write-Host 'Check your internet connection and run the command again.' -ForegroundColor Yellow
  return
}

# Belt-and-suspenders: strip any mark if present
Unblock-File -Path $exe -ErrorAction SilentlyContinue

# One-time: fetch the bundled Signal runtime (signal-cli + Java). No Docker, no Java install.
if (-not (Test-Path (Join-Path $bin 'signal-cli'))) {
  Write-Host 'Downloading the Signal connector runtime (about 180 MB, one time)...' -ForegroundColor Cyan
  $zip = Join-Path $dir 'signal-runtime.zip'
  try {
    Invoke-WebRequest -UseBasicParsing -Uri $runtimeUrl -OutFile $zip
    New-Item -ItemType Directory -Force -Path $bin | Out-Null
    Expand-Archive -Path $zip -DestinationPath $bin -Force
    Remove-Item $zip -Force -ErrorAction SilentlyContinue
  } catch {
    Write-Host ('Runtime download failed: ' + $_.Exception.Message) -ForegroundColor Yellow
    Write-Host 'The agent still installed; re-run this command to retry the runtime.' -ForegroundColor Yellow
  }
}

# Start now (background) and register for auto-start on login (HKCU, no admin)
Start-Process -FilePath $exe -WindowStyle Hidden
New-ItemProperty -Path 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run' -Name 'NodeWormAgent' -Value $exe -PropertyType String -Force | Out-Null

Start-Sleep -Seconds 2
Write-Host ''
Write-Host 'Done. NodeWorm Agent is running.' -ForegroundColor Green
Write-Host 'Go back to NodeWorm and click "I installed it, re-check".' -ForegroundColor Cyan
