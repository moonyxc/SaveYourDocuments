"""Windows-Firewall-Regeln fuer den LocalSend-Empfang (nur im lokalen Netz)."""

from __future__ import annotations

import base64
import subprocess
import sys

RULE_NAME = "Save Your Documents (LocalSend TCP)"
DISCOVERY_RULE_NAME = "Save Your Documents (LocalSend UDP)"
_NO_WINDOW = 0x08000000


def supported() -> bool:
    return sys.platform == "win32"


def _named_rule_exists(name: str) -> bool | None:
    try:
        out = subprocess.run(
            ["netsh", "advfirewall", "firewall", "show", "rule", f"name={name}"],
            capture_output=True,
            text=True,
            timeout=10,
            creationflags=_NO_WINDOW,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    return out.returncode == 0


def rule_exists() -> bool | None:
    if not supported():
        return None
    rules = (_named_rule_exists(RULE_NAME), _named_rule_exists(DISCOVERY_RULE_NAME))
    if None in rules:
        return None
    return all(rules)


def add_rule_args(port: int) -> list[str]:
    return [
        "advfirewall", "firewall", "add", "rule", f"name={RULE_NAME}",
        "dir=in", "action=allow", "protocol=TCP", f"localport={port}",
        "profile=any", "remoteip=localsubnet",
    ]  # fmt: skip


def discovery_rule_args(port: int) -> list[str]:
    return [
        "advfirewall", "firewall", "add", "rule", f"name={DISCOVERY_RULE_NAME}",
        "dir=in", "action=allow", "protocol=UDP", f"localport={port}",
        "profile=any", "remoteip=localsubnet",
    ]  # fmt: skip


def add_rule(port: int) -> dict:
    """Fordert per UAC Administratorrechte an und legt die Regel an."""
    if not supported():
        return {"ok": False, "error": "nur_windows"}
    commands = []
    for args in (add_rule_args(port), discovery_rule_args(port)):
        command = " ".join("'" + arg.replace("'", "''") + "'" for arg in args)
        commands.extend((f"& netsh {command}", "if ($LASTEXITCODE -ne 0) { $ruleErrors++ }"))
    commands.insert(0, "$ruleErrors = 0")
    commands.append("exit $ruleErrors")
    encoded = base64.b64encode("\n".join(commands).encode("utf-16le")).decode("ascii")
    ps = (
        "$process = Start-Process -FilePath powershell "
        f"-ArgumentList '-NoProfile -EncodedCommand {encoded}' -Verb RunAs -Wait -PassThru; "
        "exit $process.ExitCode"
    )
    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-Command", ps],
            timeout=120,
            creationflags=_NO_WINDOW,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return {"ok": False, "error": "nicht_gestartet"}
    if result.returncode != 0:
        return {"ok": False, "error": "regel_fehlgeschlagen"}
    return {"ok": bool(rule_exists())}
