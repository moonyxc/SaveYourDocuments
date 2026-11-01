# Baut den Windows-Installer komplett (PowerShell, im Repo-Wurzelordner ausfuehren).
# Voraussetzungen: Python 3.11+, Node 20+, Rust (stable), Visual Studio Build Tools, NSIS.
$ErrorActionPreference = "Stop"
$root = Resolve-Path "$PSScriptRoot\.."
Set-Location $root

Write-Host "0/5 Version aus version.txt uebernehmen"
python "$PSScriptRoot\sync-version.py"
if ($LASTEXITCODE -ne 0) { throw "Die Version in version.txt ist ungueltig." }

Write-Host "1/5 Oberflaeche bauen"
Push-Location frontend; npm ci; npm run build; Pop-Location

Write-Host "2/5 Tesseract bereitstellen"
& "$PSScriptRoot\fetch-tesseract.ps1"

Write-Host "3/5 Backend einfrieren"
Push-Location backend
python -m venv .venv-build
& .\.venv-build\Scripts\python -m pip install --upgrade pip
& .\.venv-build\Scripts\python -m pip install ".[build]"
& .\.venv-build\Scripts\pyinstaller packaging\syd-backend.spec --noconfirm --clean
Pop-Location

Write-Host "4/5 Backend pruefen (Start, Handshake, Beenden)"
python "$PSScriptRoot\smoke-backend.py" "backend\dist\syd-backend\syd-backend.exe"

Write-Host "5/5 Installer bauen"
& "frontend\node_modules\.bin\tauri.cmd" build
Write-Host "Fertig: src-tauri\target\release\bundle\nsis\"
