"""Sicherungen, Speicherplatz und Wechseldatentraeger-Warnung."""

from __future__ import annotations

import os
import secrets
import shutil
import sys
from datetime import datetime
from pathlib import Path

from .vault import Vault

BACKUP_PREFIX = "archiv-"
BACKUP_SUFFIX = ".syd.bak"


def make_backup(vault: Vault, dest_dir: Path, keep: int = 7) -> Path:
    """Konsistente Kopie per SQLite-Backup-Funktion, danach aelteste Kopien rotieren."""
    dest_dir.mkdir(parents=True, exist_ok=True)
    name = f"{BACKUP_PREFIX}{datetime.now():%Y%m%d-%H%M%S}{BACKUP_SUFFIX}"
    target = dest_dir / name
    tmp = target.with_name(f".{target.name}.{secrets.token_hex(8)}.part")
    try:
        vault.backup_to(tmp)
        os.replace(tmp, target)
        vault.audit("backup.created")
        rotate(dest_dir, keep)
        return target
    finally:
        tmp.unlink(missing_ok=True)


def list_backups(dest_dir: Path) -> list[dict]:
    items = []
    for p in sorted(dest_dir.glob(f"{BACKUP_PREFIX}*{BACKUP_SUFFIX}"), reverse=True):
        st = p.stat()
        items.append(
            {
                "name": p.name,
                "size": st.st_size,
                "created": datetime.fromtimestamp(st.st_mtime).isoformat(timespec="seconds"),
            }
        )
    return items


def rotate(dest_dir: Path, keep: int) -> None:
    files = sorted(dest_dir.glob(f"{BACKUP_PREFIX}*{BACKUP_SUFFIX}"), reverse=True)
    for old in files[max(keep, 1) :]:
        old.unlink(missing_ok=True)


def is_removable(path: Path) -> bool:
    """Liegt der Pfad auf einem Wechseldatentraeger (USB-Stick)? Nur unter Windows sicher erkennbar."""
    if sys.platform == "win32":
        import ctypes

        drive = os.path.splitdrive(os.path.abspath(path))[0]
        if not drive:
            return False
        return ctypes.windll.kernel32.GetDriveTypeW(drive + "\\") == 2  # DRIVE_REMOVABLE
    return False


def storage_info(vault_path: Path, backup_dir: Path) -> dict:
    size = vault_path.stat().st_size if vault_path.exists() else 0
    probe = vault_path.parent if vault_path.parent.exists() else Path.home()
    free = shutil.disk_usage(probe).free
    warnings: list[str] = []
    if is_removable(vault_path):
        warnings.append(
            "Das Archiv liegt auf einem Wechseldatenträger. Wird der Stick während des Speicherns"
            " abgezogen, kann die Datei beschädigt werden. Bitte nur zum Sichern verwenden."
        )
    if free < max(1 << 30, size * 2):
        warnings.append("Auf dem Laufwerk ist nur noch wenig Speicherplatz frei.")
    return {
        "vault_path": str(vault_path),
        "vault_bytes": size,
        "free_bytes": free,
        "backup_dir": str(backup_dir),
        "removable": is_removable(vault_path),
        "warnings": warnings,
    }
