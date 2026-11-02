@echo off
setlocal
cd /d "%~dp0"
rem Baut den Windows-Installer und legt ihn hier im Projektordner ab.
rem Voraussetzungen: Python 3.11+, Node 20+, Rust, Visual Studio Build Tools, NSIS.
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"

powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\build-windows.ps1" -PauseOnError
if errorlevel 1 (
  echo.
  echo FEHLER: Der Build ist fehlgeschlagen.
  exit /b 1
)

set "FOUND="
for %%F in ("src-tauri\target\release\bundle\nsis\*-setup.exe") do (
  if exist "%%~fF" (
    copy /Y "%%~fF" "%~dp0" >nul
    if errorlevel 1 (
      echo FEHLER: Der Installer konnte nicht kopiert werden.
      exit /b 1
    )
    echo Installer: "%~dp0%%~nxF"
    set "FOUND=1"
  )
)
if not defined FOUND (
  echo FEHLER: Es wurde kein Installer gefunden.
  exit /b 1
)
exit /b 0
