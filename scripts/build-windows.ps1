# Baut den Windows-Installer komplett (PowerShell, im Repo-Wurzelordner ausfuehren).
# Voraussetzungen: Python 3.11+, Node 20+, Rust (stable), Visual Studio Build Tools, NSIS.
# Bei fehlenden Adminrechten wird das Skript per UAC neu gestartet.
param([switch]$PauseOnError)

$ErrorActionPreference = "Stop"
trap {
    $errorDetails = ($_ | Format-List * -Force | Out-String).TrimEnd()
    Write-Host $errorDetails -ForegroundColor Red
    if ($PauseOnError -and [Environment]::UserInteractive -and -not [Console]::IsInputRedirected) {
        Read-Host "Eingabetaste druecken, um das Fenster offen zu halten" | Out-Null
    }
    exit 1
}

$root = (Resolve-Path "$PSScriptRoot\..").Path

$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object -TypeName System.Security.Principal.WindowsPrincipal -ArgumentList $identity
if (-not $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)) {
    $powerShellExecutable = Join-Path $PSHOME "powershell.exe"
    if ($PSVersionTable.PSEdition -eq "Core") {
        $powerShellExecutable = Join-Path $PSHOME "pwsh.exe"
    }
    $arguments = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$PSCommandPath`"")
    if ($PauseOnError) { $arguments += "-PauseOnError" }
    $elevatedProcess = Start-Process -FilePath $powerShellExecutable -ArgumentList $arguments -Verb RunAs -WorkingDirectory $root -Wait -PassThru
    exit $elevatedProcess.ExitCode
}

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
$env:PIP_CACHE_DIR = Join-Path $env:TEMP "save-your-documents-pip-cache"
$env:CONAN_HOME = Join-Path $env:LOCALAPPDATA "save-your-documents-conan"
$vsWhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
if (-not (Test-Path -LiteralPath $vsWhere)) {
    throw "Visual Studio Installer (vswhere.exe) wurde nicht gefunden."
}
$vsInstallPath = & $vsWhere -latest -prerelease -products "*" -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($vsInstallPath)) {
    throw "Visual Studio C++ Build Tools wurden nicht gefunden."
}
$vcvarsPath = Join-Path $vsInstallPath "VC\Auxiliary\Build\vcvarsall.bat"
if (-not (Test-Path -LiteralPath $vcvarsPath)) {
    throw "Visual Studio C++ Build Tools fehlen vcvarsall.bat: $vcvarsPath"
}
New-Item -ItemType Directory -Path $env:CONAN_HOME -Force | Out-Null
"tools.microsoft.msbuild:installation_path = $vsInstallPath" |
    Set-Content -LiteralPath (Join-Path $env:CONAN_HOME "global.conf") -Encoding ASCII
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
