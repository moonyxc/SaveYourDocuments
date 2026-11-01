# Baut den Windows-Installer komplett (PowerShell, im Repo-Wurzelordner ausfuehren).
# Voraussetzungen: Python 3.11+, Node 20+, Rust (stable), Visual Studio Build Tools, NSIS.
$ErrorActionPreference = "Stop"
$root = Resolve-Path "$PSScriptRoot\.."
Set-Location $root

function Assert-LastExitCode {
    param([string]$Step)
    if ($LASTEXITCODE -ne 0) { throw "$Step fehlgeschlagen (Exitcode $LASTEXITCODE)." }
}

Write-Host "0/5 Version aus version.txt uebernehmen"
python "$PSScriptRoot\sync-version.py"
if ($LASTEXITCODE -ne 0) { throw "Die Version in version.txt ist ungueltig." }

Write-Host "1/5 Oberflaeche bauen"
Push-Location frontend
npm ci
Assert-LastExitCode "npm ci"
npm run build
Assert-LastExitCode "npm run build"
Pop-Location

Write-Host "2/5 Tesseract bereitstellen"
& "$PSScriptRoot\fetch-tesseract.ps1"

Write-Host "3/5 Backend einfrieren"
Push-Location backend
python -m venv .venv-build
Assert-LastExitCode "Python-Umgebung erstellen"
& .\.venv-build\Scripts\python -m pip install --upgrade pip
Assert-LastExitCode "pip aktualisieren"
& .\.venv-build\Scripts\python -m pip install ".[build]"
Assert-LastExitCode "Backend-Abhängigkeiten installieren"
& .\.venv-build\Scripts\pyinstaller packaging\syd-backend.spec --noconfirm --clean
Assert-LastExitCode "Backend einfrieren"
Pop-Location

Write-Host "4/5 Backend pruefen (Start, Handshake, Beenden)"
python "$PSScriptRoot\smoke-backend.py" "backend\dist\syd-backend\syd-backend.exe"
Assert-LastExitCode "Backend-Smoke-Test"

Write-Host "5/5 Installer bauen"
& "frontend\node_modules\.bin\tauri.cmd" build
Assert-LastExitCode "Tauri-Installer bauen"
Write-Host "Fertig: src-tauri\target\release\bundle\nsis\"
