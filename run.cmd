@echo off
setlocal
cd /d "%~dp0"
rem Startet das Programm direkt aus dem Quellcode (ohne Installer).
rem Beim ersten Mal wird die Umgebung eingerichtet. Weitere Optionen werden durchgereicht,
rem z. B.: run.cmd --data-dir C:\Temp\syd-test --no-browser

if not exist "backend\.venv\Scripts\python.exe" (
  echo Richte Python-Umgebung ein ...
  python -m venv backend\.venv || goto :fail
  backend\.venv\Scripts\python.exe -m pip install -q -e "backend[dev]" || goto :fail
)
if not exist "frontend\dist\index.html" (
  echo Baue Oberflaeche ...
  pushd frontend
  call npm ci || (popd & goto :fail)
  call npm run build || (popd & goto :fail)
  popd
)

pushd backend
.\.venv\Scripts\python.exe -m syd.main --ui-dir ..\frontend\dist %*
popd
exit /b 0

:fail
echo FEHLER: Die Einrichtung ist fehlgeschlagen.
exit /b 1
