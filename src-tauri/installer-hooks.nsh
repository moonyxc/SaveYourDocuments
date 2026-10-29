; Vor Installation und Deinstallation: laufende Prozesse beenden und den alten Dienst entfernen,
; sonst bleibt bei einer Neuinstallation derselben Version der alte Dienst liegen
; (siehe tauri-apps/tauri#15134). Die Archivdatei im Datenordner wird NIE angefasst.
!macro NSIS_HOOK_PREINSTALL
  nsExec::Exec 'taskkill /F /T /IM syd-backend.exe'
  nsExec::Exec 'taskkill /F /T /IM save-your-documents.exe'
  Sleep 800
  RMDir /r "$INSTDIR\backend"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  nsExec::Exec 'taskkill /F /T /IM syd-backend.exe'
  nsExec::Exec 'taskkill /F /T /IM save-your-documents.exe'
  Sleep 800
!macroend
