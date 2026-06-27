import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Serves the NodeWorm Agent installer with an explicit Content-Disposition filename.
// Static-asset downloads were landing with a GUID and NO extension (the browser
// ignores the <a download> name for static files / treats .cmd as risky), so the
// file could not be double-clicked to run. Forcing the header guarantees it saves as
// "NodeWorm-Agent-Installer.cmd". String.raw keeps the registry-path backslashes;
// \n is converted to CRLF for a valid Windows batch file.
const TEMPLATE = String.raw`@echo off
title NodeWorm Agent installer
echo Installing the NodeWorm Agent (current user, no admin needed)...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $base='__BASE__'; $dir=Join-Path $env:LOCALAPPDATA 'NodeWormAgent'; New-Item -ItemType Directory -Force -Path $dir | Out-Null; Invoke-WebRequest -UseBasicParsing -Uri ($base+'/agent/nodeworm-agent.js') -OutFile (Join-Path $dir 'nodeworm-agent.js'); $js=Join-Path $dir 'nodeworm-agent.js'; $bat='@echo off'+[char]13+[char]10+'node '+[char]34+$js+[char]34+[char]13+[char]10; Set-Content -Path (Join-Path $dir 'nodeworm-agent.bat') -Value $bat -Encoding ascii -NoNewline; $m=[ordered]@{name='com.nodeworm.executor';description='NodeWorm Agent native messaging host';path=(Join-Path $dir 'nodeworm-agent.bat');type='stdio';allowed_origins=@('chrome-extension://dalghcagdbckejfmdgfheoaaecmbpnog/')}; ($m | ConvertTo-Json) | Set-Content -Path (Join-Path $dir 'com.nodeworm.executor.json') -Encoding UTF8; foreach($r in @('HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.nodeworm.executor','HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.nodeworm.executor')){ New-Item -Path $r -Force | Out-Null; Set-ItemProperty -Path $r -Name '(Default)' -Value (Join-Path $dir 'com.nodeworm.executor.json') }; if(-not (Get-Command node -ErrorAction SilentlyContinue)){ Write-Host 'WARNING: Node.js was not found on PATH. Install Node.js (nodejs.org), then run this again.' -ForegroundColor Yellow }; Write-Host ('NodeWorm Agent installed to '+$dir) -ForegroundColor Green"
echo.
echo Done. Restart your browser, then click "I installed it, re-check" in NodeWorm.
echo.
pause
`;

export function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const body = TEMPLATE.replace("__BASE__", origin).replace(/\n/g, "\r\n");
  return new NextResponse(body, {
    headers: {
      "content-type": "application/octet-stream",
      "content-disposition": 'attachment; filename="NodeWorm-Agent-Installer.cmd"',
      "cache-control": "no-store",
    },
  });
}
