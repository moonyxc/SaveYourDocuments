"""Startet das eingefrorene Backend und prueft Handshake, Status und sauberes Beenden.

Aufruf: python scripts/smoke-backend.py <pfad-zu-syd-backend[.exe]>
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.request


def main() -> int:
    exe = sys.argv[1]
    token = "smoke-token"
    with tempfile.TemporaryDirectory() as data:
        env = dict(os.environ, SYD_TOKEN=token, SYD_DATA_DIR=data)
        proc = subprocess.Popen(
            [exe, "--no-browser", "--no-multicast", "--localsend-port", "0"],
            stdout=subprocess.PIPE,
            env=env,
            text=True,
        )
        try:
            port = None
            deadline = time.time() + 90
            while time.time() < deadline:
                line = proc.stdout.readline()
                if line.startswith("SYD_READY "):
                    port = json.loads(line[len("SYD_READY ") :])["port"]
                    break
                if proc.poll() is not None:
                    break
            if port is None:
                print("FEHLER: kein SYD_READY")
                return 1

            def call(path: str, method: str = "GET", auth: bool = True):
                req = urllib.request.Request(f"http://127.0.0.1:{port}{path}", method=method)
                if auth:
                    req.add_header("X-SYD-Token", token)
                if method == "POST":
                    req.data = b"{}"
                    req.add_header("Content-Type", "application/json")
                return urllib.request.urlopen(req, timeout=10)

            status = json.load(call("/api/status"))
            assert status["state"] == "setup", status
            html = call("/", auth=False).read().decode()
            assert "<div id=\"root\">" in html, "Oberflaeche wird nicht ausgeliefert"
            try:
                call("/api/status", auth=False)
                print("FEHLER: API ohne Token erreichbar")
                return 1
            except urllib.error.HTTPError as exc:
                assert exc.code == 401
            call("/api/shutdown", "POST")
            proc.wait(timeout=20)
            print("OK: Backend startet, liefert die Oberflaeche aus und beendet sich sauber.")
            return 0
        finally:
            if proc.poll() is None:
                proc.kill()


if __name__ == "__main__":
    sys.exit(main())
