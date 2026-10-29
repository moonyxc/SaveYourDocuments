# Holt Tesseract (Windows, UB Mannheim) samt deutschen Sprachdaten nach backend/packaging/tesseract.
# Laeuft in der CI und lokal (PowerShell). Voraussetzung: Chocolatey ODER ein vorhandenes Tesseract.
$ErrorActionPreference = "Stop"
$dest = Join-Path $PSScriptRoot "..\backend\packaging\tesseract"
$src = "C:\Program Files\Tesseract-OCR"
if (-not (Test-Path "$src\tesseract.exe")) {
    choco install tesseract --no-progress -y
}
if (-not (Test-Path "$src\tesseract.exe")) { throw "Tesseract wurde nicht gefunden." }
if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
New-Item -ItemType Directory -Path "$dest\tessdata" | Out-Null
Copy-Item "$src\tesseract.exe" $dest
Copy-Item "$src\*.dll" $dest
foreach ($lang in "deu", "eng", "osd") {
    $target = "$dest\tessdata\$lang.traineddata"
    if (Test-Path "$src\tessdata\$lang.traineddata") {
        Copy-Item "$src\tessdata\$lang.traineddata" $target
    } else {
        Invoke-WebRequest "https://github.com/tesseract-ocr/tessdata_fast/raw/main/$lang.traineddata" -OutFile $target
    }
}
Copy-Item "$src\tessdata\configs" "$dest\tessdata\configs" -Recurse -ErrorAction SilentlyContinue
Copy-Item "$src\tessdata\tessconfigs" "$dest\tessdata\tessconfigs" -Recurse -ErrorAction SilentlyContinue
Write-Host "Tesseract bereit: $dest"
