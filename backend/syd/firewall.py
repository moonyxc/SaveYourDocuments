"""Windows-Firewall-Regel fuer den LocalSend-Empfang (nur im lokalen Netz)."""

from __future__ import annotations

import subprocess
import sys

RULE_NAME = "Save Your Documents (LocalSend)"
_NO_WINDOW = 0x08000000


def supported() -> bool:
    return sys.platform == "win32"


def rule_exists() -> bool | None:
    if not supported():
        return None
    try:
        out = subprocess.run(
            ["netsh", "advfirewall", "firewall", "show", "rule", f"name={RULE_NAME}"],
            capture_output=True,
            text=True,
            timeout=10,
            creationflags=_NO_WINDOW,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    return out.returncode == 0


def add_rule_args(port: int) -> list[str]:
    return [
        "advfirewall", "firewall", "add", "rule", f"name={RULE_NAME}",
        "dir=in", "action=allow", "protocol=TCP", f"localport={port}",
        "profile=private", "remoteip=localsubnet",
    ]  # fmt: skip


def add_rule(port: int) -> dict:
    """Fordert per UAC Administratorrechte an und legt die Regel an."""
    if not supported():
        return {"ok": False, "error": "nur_windows"}
    args = " ".join(f'"{a}"' if " " in a else a for a in add_rule_args(port))
    ps = f"Start-Process -FilePath netsh -ArgumentList '{args}' -Verb RunAs -Wait"
    try:
        subprocess.run(
            ["powershell", "-NoProfile", "-Command", ps],
            timeout=120,
            creationflags=_NO_WINDOW,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return {"ok": False, "error": "nicht_gestartet"}
    return {"ok": bool(rule_exists())}
