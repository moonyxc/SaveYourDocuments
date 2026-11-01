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


def parent_alive(pid: int) -> bool:
    """Prueft, ob der Elternprozess (die Tauri-Huelle) noch laeuft."""
    if sys.platform == "win32":
        import ctypes

        kernel32 = ctypes.windll.kernel32
        handle = kernel32.OpenProcess(0x00100000, False, pid)  # SYNCHRONIZE
        if not handle:
            return False
        try:
            return kernel32.WaitForSingleObject(handle, 0) == 0x102  # WAIT_TIMEOUT
        finally:
            kernel32.CloseHandle(handle)
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


async def watch_parent(pid: int, server: uvicorn.Server) -> None:
    while not server.should_exit:
        if not await asyncio.to_thread(parent_alive, pid):
            server.should_exit = True
            return
        await asyncio.sleep(2)


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
        app,
        host="127.0.0.1",
        port=port,
        log_config=None,
        access_log=False,
        lifespan="on",
        timeout_graceful_shutdown=5,
    )
    server = uvicorn.Server(config)
    holder["server"] = server
    task = asyncio.create_task(server.serve())
    watcher = (
        asyncio.create_task(watch_parent(args.parent_pid, server)) if args.parent_pid else None
    )
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
    if watcher:
        watcher.cancel()


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(prog="syd")
    p.add_argument("--port", type=int, default=0, help="Port (0 = frei wählen)")
    p.add_argument("--data-dir", help="Datenordner (Standard: AppData)")
    p.add_argument("--ui-dir", help="Ordner der gebauten Oberfläche")
    p.add_argument("--localsend-port", type=int, default=None)
    p.add_argument("--no-multicast", action="store_true")
    p.add_argument("--no-browser", action="store_true")
    p.add_argument(
        "--parent-pid", type=int, default=0, help="Beendet sich, wenn dieser Prozess endet"
    )
    args = p.parse_args(argv)
    logging.getLogger("uvicorn.error").setLevel(logging.WARNING)
    try:
        asyncio.run(serve(args))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
