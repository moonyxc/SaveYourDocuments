@echo off
setlocal enabledelayedexpansion

echo ===============================================
echo    SaveYourData Build Script
echo ===============================================
echo [1] Requirements installieren
echo     - pnpm install
echo     - Prueft Node.js 20+
echo [2] App starten (dev mode)
echo     - pnpm dev
echo [3] App bauen
echo     - pnpm build
echo     - electron-builder
echo [4] Beides (1 + 3)
echo [5] Beenden
echo ===============================================
echo.

set /p choice="Auswahl (1-5): "

if "%choice%"=="1" goto install
if "%choice%"=="2" goto start
if "%choice%"=="3" goto build
if "%choice%"=="4" goto all
if "%choice%"=="5" goto end
echo Ungueltige Auswahl.
goto end

:install
echo.
echo Pruefe Node.js Version...
node -v 2>nul
if %errorlevel% neq 0 (
    echo FEHLER: Node.js ist nicht installiert.
    goto end
)
for /f "tokens=1 delims=v." %%a in ('node -v') do set NODE_MAJOR=%%a
if %NODE_MAJOR% LSS 20 (
    echo FEHLER: Node.js 20+ ist erforderlich. Aktuelle Version:
    node -v
    goto end
)
echo Node.js Version OK.
echo.
echo Installiere Abhaengigkeiten...
call pnpm install
if %errorlevel% neq 0 (
    echo FEHLER: pnpm install fehlgeschlagen.
    goto end
)
echo Abhaengigkeiten erfolgreich installiert.
echo.
echo Rebuild native modules for Electron...
call pnpm build:electron
if %errorlevel% neq 0 (
    echo WARNUNG: electron-rebuild fehlgeschlagen, build wird trotzdem fortgesetzt.
)
if "%choice%"=="1" goto end

:start
echo.
echo Starte App im Dev-Modus...
echo Bitte f├╝hre in einem separaten Terminal aus:
echo   pnpm start
echo (nachdem der Vite-Dev-Server l├ñuft)
echo.
start "" cmd /c "pnpm dev"
goto end

:build
echo.
echo Baue Anwendung...
call pnpm build:all
if %errorlevel% neq 0 (
    echo FEHLER: Build fehlgeschlagen.
    goto end
)
echo Build erfolgreich.
echo.
echo Erstelle Installer mit electron-builder...
call pnpm dist
if %errorlevel% neq 0 (
    echo FEHLER: electron-builder fehlgeschlagen.
    goto end
)
echo Installer erfolgreich erstellt.
goto end

:all
set choice=1
goto install

:end
echo.
pause