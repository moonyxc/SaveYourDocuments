@echo off
setlocal
cd /d "%~dp0"
rem Startet das Programm direkt aus dem Quellcode (ohne Installer).
rem Beim ersten Mal wird die Umgebung eingerichtet. Weitere Optionen werden durchgereicht,
rem z. B.: run.cmd --data-dir C:\Temp\syd-test --no-browser

if not exist "backend\.venv\Scripts\python.exe" (
  echo Richte Python-Umgebung ein ...
  python -m venv backend\.venv || goto :fail
)
backend\.venv\Scripts\python.exe -m pip show save-your-documents >nul 2>&1
if not errorlevel 1 backend\.venv\Scripts\python.exe -m pip check >nul 2>&1
if errorlevel 1 (
  echo Installiere Python-Abhaengigkeiten ...
  echo Falls SQLCipher aus Quelltext gebaut werden muss, kann dies mehrere Minuten dauern.
  rem Auch isolierte Build-Prozesse duerfen den eventuell unlesbaren pip-Cache nicht verwenden.
  setlocal
  set "PIP_NO_CACHE_DIR=1"
  if not defined CONAN_HOME (
    set "CONAN_HOME=%CD%\backend\.venv\conan"
    call :configure_conan || goto :fail
  )
  backend\.venv\Scripts\python.exe -m pip install -q -e "backend[dev]" || goto :fail
  endlocal
)
if not exist "frontend\node_modules\.bin\vite.cmd" (
  echo Richte Frontend-Umgebung ein ...
  pushd frontend
  call npm ci || (popd & goto :fail)
  popd
)
echo Baue Oberflaeche ...
pushd frontend
call npm run build || (popd & goto :fail)
popd

pushd backend
.\.venv\Scripts\python.exe -m syd.main --ui-dir ..\frontend\dist %*
popd
exit /b 0

:fail
echo FEHLER: Die Einrichtung ist fehlgeschlagen.
exit /b 1

:configure_conan
set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if not exist "%VSWHERE%" exit /b 0
if exist "%CONAN_HOME%\global.conf" (
  findstr /b /c:"tools.microsoft.msbuild:installation_path" "%CONAN_HOME%\global.conf" >nul
  if not errorlevel 1 exit /b 0
)
if not exist "%CONAN_HOME%" mkdir "%CONAN_HOME%" || exit /b 1
for /f "usebackq delims=" %%I in (`"%VSWHERE%" -latest -prerelease -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do (
  >>"%CONAN_HOME%\global.conf" echo tools.microsoft.msbuild:installation_path = %%I|| exit /b 1
)
exit /b 0
