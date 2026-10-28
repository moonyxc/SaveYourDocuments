"""Startpunkt des Backends (Sidecar der Tauri-Huelle oder eigenstaendig im Browser)."""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import secrets
import socket
import sys
import webbrowser
from pathlib import Path

import uvicorn

from . import logs
from .api import create_app
from .config import Paths
from .state import AppState


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def default_ui_dir() -> Path | None:
    candidates = []
    if getattr(sys, "_MEIPASS", None):
        candidates.append(Path(sys._MEIPASS) / "ui")
    candidates += [
        Path(__file__).resolve().parent / "ui",
        Path(__file__).resolve().parents[2] / "frontend" / "dist",
    ]
    return next((c for c in candidates if (c / "index.html").exists()), None)


async def serve(args: argparse.Namespace) -> None:
    paths = Paths(Path(args.data_dir) if args.data_dir else None)
    logs.setup(paths.logs)
    state = AppState(paths, localsend_port=args.localsend_port, multicast=not args.no_multicast)
    shell_token = os.environ.get("SYD_TOKEN")
    token = shell_token or secrets.token_urlsafe(32)
    port = args.port or _free_port()
    holder: dict = {}
    app = create_app(
        state,
        token,
        ui_dir=Path(args.ui_dir) if args.ui_dir else default_ui_dir(),
        request_exit=lambda: setattr(holder["server"], "should_exit", True),
    )
    config = uvicorn.Config(
        app, host="127.0.0.1", port=port, log_config=None, access_log=False, lifespan="on"
    )
    server = uvicorn.Server(config)
    holder["server"] = server
    task = asyncio.create_task(server.serve())
    while not server.started and not task.done():
        await asyncio.sleep(0.05)
    if task.done():
        await task
        return
    print("SYD_READY " + json.dumps({"port": port}), flush=True)
    if not shell_token:
        url = f"http://127.0.0.1:{port}/#token={token}"
        print(f"Save Your Documents läuft: {url}", flush=True)
        if not args.no_browser:
            webbrowser.open(url)
    await task


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(prog="syd")
    p.add_argument("--port", type=int, default=0, help="Port (0 = frei wählen)")
    p.add_argument("--data-dir", help="Datenordner (Standard: AppData)")
    p.add_argument("--ui-dir", help="Ordner der gebauten Oberfläche")
    p.add_argument("--localsend-port", type=int, default=None)
    p.add_argument("--no-multicast", action="store_true")
    p.add_argument("--no-browser", action="store_true")
    args = p.parse_args(argv)
    logging.getLogger("uvicorn.error").setLevel(logging.WARNING)
    try:
        asyncio.run(serve(args))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
