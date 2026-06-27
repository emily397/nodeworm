; NodeWorm Setup installer script
; Compiled by GitHub Actions (see .github/workflows/build-installer.yml)
; Requires: NSIS 3.x, nodeworm-agent.exe in ./installer/

Unicode True

!define PRODUCT_NAME       "NodeWorm"
!define PRODUCT_VERSION    "1.0.0"
!define PRODUCT_PUBLISHER  "NodeWorm"
!define PRODUCT_URL        "https://abie-three.vercel.app"
!define INST_DIR           "$LOCALAPPDATA\NodeWormAgent"
!define AGENT_EXE          "nodeworm-agent.exe"
!define HOST_NAME          "com.nodeworm.executor"
!define EXT_ID             "lflebkjggclmnaokfmfnjgbdpfdkajpj"
!define UPDATE_URL         "https://abie-three.vercel.app/agent/updates.xml"

Name "${PRODUCT_NAME} Setup"
OutFile "NodeWorm-Setup.exe"
InstallDir "${INST_DIR}"
RequestExecutionLevel user
ShowInstDetails nevershow
SetCompressor /SOLID lzma

!include "MUI2.nsh"
!include "WinMessages.nsh"
!include "LogicLib.nsh"

; Installer pages: welcome -> install -> finish
!define MUI_WELCOMEPAGE_TITLE "Install NodeWorm"
!define MUI_WELCOMEPAGE_TEXT "NodeWorm connects your apps automatically. This installs the NodeWorm Agent (seconds, no admin), registers the NodeWorm Helper browser extension, and opens NodeWorm in your browser so you can sign in.$\r$\n$\r$\nClick Install to continue."

!define MUI_FINISHPAGE_TITLE "NodeWorm is ready"
!define MUI_FINISHPAGE_TEXT "Your browser will open NodeWorm now. The NodeWorm Helper extension installs itself the next time you restart Chrome or Edge.$\r$\n$\r$\nSign in to connect your first app."
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "Open NodeWorm"
!define MUI_FINISHPAGE_RUN_FUNCTION OpenNodeWorm

!define MUI_PAGE_CUSTOMFUNCTION_PRE WelcomePagePre
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_LANGUAGE "English"

; ---------------------------------------------------------------
; Helpers
; ---------------------------------------------------------------

Function WelcomePagePre
  GetDlgItem $0 $HWNDPARENT 1
  SendMessage $0 ${WM_SETTEXT} 0 "STR:Install"
FunctionEnd

Function OpenNodeWorm
  ExecShell "open" "${PRODUCT_URL}"
FunctionEnd

; ---------------------------------------------------------------
; Main install section
; ---------------------------------------------------------------

Section "NodeWorm Agent" SEC_MAIN
  SetOutPath "${INST_DIR}"
  DetailPrint "Installing NodeWorm Agent..."
  File "nodeworm-agent.exe"

  ; Write native-messaging host manifest via PowerShell (handles backslash escaping in JSON).
  DetailPrint "Registering native messaging host..."
  nsExec::ExecToLog 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "$p=Join-Path $env:LOCALAPPDATA \"NodeWormAgent\NodeWorm-agent.exe\"; $j=[ordered]@{name=\"${HOST_NAME}\";description=\"NodeWorm Agent\";path=$p;type=\"stdio\";allowed_origins=@(\"chrome-extension://${EXT_ID}/\")}; $j|ConvertTo-Json|Set-Content (Join-Path $env:LOCALAPPDATA \"NodeWormAgent\${HOST_NAME}.json\") -Encoding UTF8"'

  ; Chrome and Edge native messaging host registry keys
  WriteRegStr HKCU "Software\Google\Chrome\NativeMessagingHosts\${HOST_NAME}" "" "$INSTDIR\${HOST_NAME}.json"
  WriteRegStr HKCU "Software\Microsoft\Edge\NativeMessagingHosts\${HOST_NAME}" "" "$INSTDIR\${HOST_NAME}.json"

  ; Chrome and Edge ExtensionInstallForcelist: auto-installs NodeWorm Helper on next browser restart
  DetailPrint "Registering NodeWorm Helper extension..."
  WriteRegStr HKCU "SOFTWARE\Policies\Google\Chrome\ExtensionInstallForcelist" "1" "${EXT_ID};${UPDATE_URL}"
  WriteRegStr HKCU "SOFTWARE\Policies\Microsoft\Edge\ExtensionInstallForcelist" "1" "${EXT_ID};${UPDATE_URL}"

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

; ---------------------------------------------------------------
; Uninstaller
; ---------------------------------------------------------------

Section "Uninstall"
  DeleteRegKey HKCU "Software\Google\Chrome\NativeMessagingHosts\${HOST_NAME}"
  DeleteRegKey HKCU "Software\Microsoft\Edge\NativeMessagingHosts\${HOST_NAME}"

  ; Only remove our entry from ExtensionInstallForcelist, not the whole key
  nsExec::ExecToLog 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "foreach($r in @(\"HKCU:\SOFTWARE\Policies\Google\Chrome\ExtensionInstallForcelist\",\"HKCU:\SOFTWARE\Policies\Microsoft\Edge\ExtensionInstallForcelist\")){ try { $v=Get-ItemProperty $r -Name 1 -EA Stop; if($v.1 -like \"*nodeworm*\"){ Remove-ItemProperty $r -Name 1 -Force } } catch {} }"'

  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NodeWorm"
  Delete "$INSTDIR\${AGENT_EXE}"
  Delete "$INSTDIR\${HOST_NAME}.json"
  Delete "$INSTDIR\uninstall.exe"
  RMDir "$INSTDIR"
SectionEnd
