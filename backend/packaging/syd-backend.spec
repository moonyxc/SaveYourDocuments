# PyInstaller-Spezifikation fuer das Backend (Sidecar der Tauri-Huelle).
# Aufruf (aus backend/): pyinstaller packaging/syd-backend.spec --noconfirm --clean
# Voraussetzungen: frontend/dist ist gebaut, packaging/tesseract/ ist gefuellt
# (scripts/fetch-tesseract.ps1). Ergebnis: dist/syd-backend/ (onedir, kein Entpacken beim Start).
from pathlib import Path

from PyInstaller.utils.hooks import collect_all

root = Path(SPECPATH).parent
repo = root.parent

datas, binaries, hiddenimports = [], [], []
for pkg in ("sqlcipher3", "pypdfium2", "pypdfium2_raw", "pillow_heif", "uvicorn", "websockets"):
    try:
        d, b, h = collect_all(pkg)
    except Exception:
        continue
    datas += d
    binaries += b
    hiddenimports += h

ui = repo / "frontend" / "dist"
if not (ui / "index.html").exists():
    raise SystemExit("frontend/dist fehlt: zuerst die Oberflaeche bauen (npm run build).")
datas.append((str(ui), "ui"))

tess = root / "packaging" / "tesseract"
if not (tess / "tessdata" / "deu.traineddata").exists():
    raise SystemExit("packaging/tesseract/tessdata/deu.traineddata fehlt: scripts/fetch-tesseract.ps1 ausfuehren.")
datas.append((str(tess), "tesseract"))

a = Analysis(
    [str(root / "packaging" / "syd_entry.py")],
    pathex=[str(root)],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports + ["syd", "syd.extract"],
    excludes=["tkinter", "pytest"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="syd-backend",
    console=True,  # wird von der Huelle ohne Fenster gestartet
    upx=False,
)
coll = COLLECT(exe, a.binaries, a.datas, name="syd-backend", upx=False)
