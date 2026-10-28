"""Technische Diagnose-Logs als Tagesdatei. Nur Ereignisnamen, IDs und Fehlercodes (D10)."""

from __future__ import annotations

import logging
import re
from logging.handlers import TimedRotatingFileHandler
from pathlib import Path

_SAFE = re.compile(r"^[a-z][a-z0-9_.]*(?: [a-z_]+=[A-Za-z0-9_.\-]{0,40})*$")


class SafeFormatter(logging.Formatter):
    """Verwirft Meldungen, die nicht dem Muster `ereignis key=wert` entsprechen (keine Inhalte)."""

    def format(self, record: logging.LogRecord) -> str:
        msg = record.getMessage()
        if not _SAFE.match(msg):
            msg = "meldung_verworfen"
        return (
            f"{self.formatTime(record, '%Y-%m-%dT%H:%M:%S')} {record.levelname} {record.name} {msg}"
        )


def setup(log_dir: Path, level: int = logging.INFO) -> None:
    log_dir.mkdir(parents=True, exist_ok=True)
    root = logging.getLogger("syd")
    if any(isinstance(h, TimedRotatingFileHandler) for h in root.handlers):
        return
    handler = TimedRotatingFileHandler(
        log_dir / "diagnose.log", when="midnight", backupCount=30, encoding="utf-8", delay=True
    )
    handler.setFormatter(SafeFormatter())
    root.addHandler(handler)
    root.setLevel(level)


def list_logs(log_dir: Path) -> list[dict]:
    return [
        {"name": p.name, "size": p.stat().st_size}
        for p in sorted(log_dir.glob("diagnose.log*"), reverse=True)
    ]


def read_log(log_dir: Path, name: str, max_bytes: int = 200_000) -> str:
    if not re.fullmatch(r"diagnose\.log(\.\d{4}-\d{2}-\d{2})?", name):
        raise ValueError(name)
    p = log_dir / name
    data = p.read_bytes()[-max_bytes:]
    return data.decode("utf-8", "replace")
