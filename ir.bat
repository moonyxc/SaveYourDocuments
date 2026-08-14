@echo off
chcp 65001 >nul
echo SaveYourDocuments - Install Requirements
echo =========================================
echo.

echo Prüfe Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo FEHLER: Node.js ist nicht installiert!
    echo Bitte installiere Node.js von https://nodejs.org/
    pause
    exit /b 1
)
echo Node.js gefunden:
node --version

echo.
echo Prüfe npm...
npm --version >nul 2>&1
if errorlevel 1 (
    echo FEHLER: npm ist nicht verfügbar!
    pause
    exit /b 1
)
echo npm gefunden:
npm --version

echo.
echo Installiere Dependencies...
npm ci

if errorlevel 1 (
    echo.
    echo FEHLER: Installation fehlgeschlagen!
    pause
    exit /b 1
)

echo.
echo =========================================
echo Alle Requirements erfolgreich installiert!
echo =========================================
pause
