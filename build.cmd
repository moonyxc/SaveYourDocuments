@echo off
setlocal
cd /d "%~dp0"
rem Baut den Windows-Installer und legt ihn hier im Projektordner ab.
rem Voraussetzungen: Python 3.11+, Node 20+, Rust, Visual Studio Build Tools, NSIS.
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"

powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\build-windows.ps1"
if errorlevel 1 (
  echo.
  echo FEHLER: Der Build ist fehlgeschlagen.
  exit /b 1
)

set "FOUND="
for %%F in ("src-tauri\target\release\bundle\nsis\*-setup.exe") do (
  copy /Y "%%F" "%~dp0" >nul
  echo Installer: %~dp0%%~nxF
  set "FOUND=1"
)
if not defined FOUND (
  echo FEHLER: Es wurde kein Installer gefunden.
  exit /b 1
)
exit /b 0
