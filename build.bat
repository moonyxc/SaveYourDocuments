@echo off
setlocal
cd /d "%~dp0"

:menu
echo ============================================
echo   Save Your Documents - Build Menu
echo ============================================
echo   1) Install requirements (npm install)
echo   2) Clean (dist, release, out)
echo   3) Build app (TypeScript)
echo   4) Package app (electron-builder)
echo   5) All: install + clean + build + package
echo   6) Start app (dev)
echo   0) Exit
echo ============================================
set /p choice=Auswahl: 

if "%choice%"=="1" goto install
if "%choice%"=="2" goto clean
if "%choice%"=="3" goto build
if "%choice%"=="4" goto package
if "%choice%"=="5" goto all
if "%choice%"=="6" goto dev
if "%choice%"=="0" goto end
echo Ungueltige Auswahl.
goto menu

:install
echo [build] Installiere Abhaengigkeiten...
call npm install
goto done

:clean
echo [build] Raeume auf...
call npm run clean
goto done

:build
echo [build] Baue App...
call npm run build
goto done

:package
echo [build] Paketiere App...
call npm run dist
goto done

:all
echo [build] Installiere Abhaengigkeiten...
call npm install || goto fail
echo [build] Raeume auf...
call npm run clean || goto fail
echo [build] Baue App...
call npm run build || goto fail
echo [build] Paketiere App...
call npm run dist || goto fail
goto done

:dev
call npm start
goto done

:fail
echo [build] FEHLER!
exit /b 1

:done
echo [build] Fertig.
pause
goto menu

:end
endlocal
