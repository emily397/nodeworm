; NodeWorm Setup installer script
; Compiled by GitHub Actions (see .github/workflows/build-installer.yml)
; Requires: NSIS 3.x, nodeworm-agent.exe in ./installer/

Unicode True

!define PRODUCT_NAME       "NodeWorm"
!define PRODUCT_VERSION    "2.0.0"
!define PRODUCT_PUBLISHER  "NodeWorm"
!define PRODUCT_URL        "https://abie-three.vercel.app"
!define INST_DIR           "$LOCALAPPDATA\NodeWormAgent"
!define AGENT_EXE          "nodeworm-agent.exe"
!define RUN_KEY            "SOFTWARE\Microsoft\Windows\CurrentVersion\Run"

Name "${PRODUCT_NAME} Setup"
OutFile "NodeWorm-Setup.exe"
InstallDir "${INST_DIR}"
RequestExecutionLevel user
ShowInstDetails nevershow
SetCompressor /SOLID lzma

!include "MUI2.nsh"
!include "WinMessages.nsh"
!include "LogicLib.nsh"

!define MUI_WELCOMEPAGE_TITLE "Install NodeWorm"
!define MUI_WELCOMEPAGE_TEXT "NodeWorm connects your apps automatically.$\r$\n$\r$\nThis installs the NodeWorm Agent (no admin, no browser extension needed). The agent runs as a background service and starts automatically when you log in.$\r$\n$\r$\nClick Install to continue."

!define MUI_FINISHPAGE_TITLE "NodeWorm is ready"
!define MUI_FINISHPAGE_TEXT "The NodeWorm Agent is running in the background.$\r$\n$\r$\nSign in to NodeWorm to connect your first app."
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "Open NodeWorm"
!define MUI_FINISHPAGE_RUN_FUNCTION OpenNodeWorm

!define MUI_PAGE_CUSTOMFUNCTION_PRE WelcomePagePre
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_LANGUAGE "English"

Function WelcomePagePre
  GetDlgItem $0 $HWNDPARENT 1
  SendMessage $0 ${WM_SETTEXT} 0 "STR:Install"
FunctionEnd

Function OpenNodeWorm
  ExecShell "open" "${PRODUCT_URL}"
FunctionEnd

Section "NodeWorm Agent" SEC_MAIN
  SetOutPath "${INST_DIR}"
  DetailPrint "Installing NodeWorm Agent..."
  File "nodeworm-agent.exe"

  ; Start the agent immediately as a background process
  DetailPrint "Starting NodeWorm Agent..."
  nsExec::ExecToLog 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "Unblock-File -Path (Join-Path $env:LOCALAPPDATA \"NodeWormAgent\nodeworm-agent.exe\"); Start-Process -FilePath (Join-Path $env:LOCALAPPDATA \"NodeWormAgent\nodeworm-agent.exe\") -WindowStyle Hidden"'

  ; Register agent to start on login (HKCU, no admin)
  WriteRegStr HKCU "${RUN_KEY}" "NodeWormAgent" "$INSTDIR\${AGENT_EXE}"

  ; Add/Remove Programs entry
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NodeWorm" "DisplayName" "${PRODUCT_NAME}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NodeWorm" "DisplayVersion" "${PRODUCT_VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NodeWorm" "Publisher" "${PRODUCT_PUBLISHER}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NodeWorm" "URLInfoAbout" "${PRODUCT_URL}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NodeWorm" "UninstallString" "$INSTDIR\uninstall.exe"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NodeWorm" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NodeWorm" "NoRepair" 1

  WriteUninstaller "$INSTDIR\uninstall.exe"
  DetailPrint "Done."
SectionEnd

Section "Uninstall"
  ; Stop the agent if running
  nsExec::ExecToLog 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "Get-Process -Name nodeworm-agent -ErrorAction SilentlyContinue | Stop-Process -Force"'

  ; Remove startup key
  DeleteRegValue HKCU "${RUN_KEY}" "NodeWormAgent"

  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NodeWorm"
  Delete "$INSTDIR\${AGENT_EXE}"
  Delete "$INSTDIR\uninstall.exe"
  RMDir "$INSTDIR"
SectionEnd
