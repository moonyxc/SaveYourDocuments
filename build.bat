@echo off
chcp 65001 >nul
echo SaveYourDocuments - Build Script
echo ================================
echo.

echo Installing dependencies...
npm ci
if errorlevel 1 (
    echo FEHLER: npm ci fehlgeschlagen!
    exit /b 1
)

echo.
echo Building application...
npm run build
if errorlevel 1 (
    echo FEHLER: Build fehlgeschlagen!
    exit /b 1
)

echo.
echo Building Electron app...
npm run electron:build
if errorlevel 1 (
    echo FEHLER: Electron-Build fehlgeschlagen!
    exit /b 1
)

echo.
echo ================================
echo Build erfolgreich abgeschlossen!
echo ================================
pause
