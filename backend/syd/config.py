"""Datenordner und lokale Programmkonfiguration (ohne Geheimnisse)."""

from __future__ import annotations

import json
import os
import sys
import tempfile
from dataclasses import asdict, dataclass
from pathlib import Path

APP_DIR_NAME = "SaveYourDocuments"
VAULT_NAME = "archiv.syd"


def data_dir() -> Path:
    env = os.environ.get("SYD_DATA_DIR")
    if env:
        p = Path(env)
    elif sys.platform == "win32":
        p = Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming")) / APP_DIR_NAME
    else:
        p = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share")) / APP_DIR_NAME
    p.mkdir(parents=True, exist_ok=True)
    return p


@dataclass
class AppConfig:
    mode: str | None = None  # "key" | "password"
    setup_done: bool = False
    vault_path: str | None = None
    backup_dir: str | None = None
    backup_keep: int = 7
    last_backup: str | None = None
    last_integrity_check: str | None = None
    firewall_prompted: bool = False

    @classmethod
    def load(cls, root: Path) -> AppConfig:
        f = root / "config.json"
        if not f.exists():
            return cls()
        try:
            raw = json.loads(f.read_text("utf-8"))
        except (OSError, json.JSONDecodeError):
            return cls()
        known = {k: v for k, v in raw.items() if k in cls.__dataclass_fields__}
        return cls(**known)

    def save(self, root: Path) -> None:
        root.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=root, prefix=".config-", suffix=".tmp")
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(asdict(self), fh, indent=2)
        os.replace(tmp, root / "config.json")


class Paths:
    def __init__(self, root: Path | None = None):
        self.root = root or data_dir()
        self.root.mkdir(parents=True, exist_ok=True)
        self.logs = self.root / "logs"
        self.staging = self.root / "eingang"
        self.certs = self.root / "zertifikate"
        self.key_file = self.root / "schluessel.json"
        for d in (self.logs, self.staging, self.certs):
            d.mkdir(parents=True, exist_ok=True)

    def vault(self, cfg: AppConfig) -> Path:
        return Path(cfg.vault_path) if cfg.vault_path else self.root / VAULT_NAME

    def backups(self, cfg: AppConfig) -> Path:
        d = Path(cfg.backup_dir) if cfg.backup_dir else self.root / "sicherungen"
        d.mkdir(parents=True, exist_ok=True)
        return d
