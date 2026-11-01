"""LocalSend-Protokoll v2.x, Empfaengerseite (PLAN.md D7, 4.1, S5).

Sicherheitsmodell: Dateien landen zuerst in einer Quarantaene. Annahme nur nach
Bestaetigung (decider) oder fuer vertraute Geraete. Eingehende Uploads pruefen das vom
LocalSend-v2.2-Client unterstuetzte Client-Zertifikat aktuell nicht, siehe docs/SPIKES.md.
"""

from __future__ import annotations

import asyncio
import hashlib
import ipaddress
import json
import logging
import re
import secrets
import shutil
import socket
import ssl
import time
from collections import defaultdict, deque
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import NameOID
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response

API = "/api/localsend/v2"
PROTOCOL_VERSION = "2.2"
DEFAULT_PORT = 53317
MULTICAST_GROUP = "224.0.0.167"
ANNOUNCEMENT_DELAYS = (0.1, 0.5, 2.0)

log = logging.getLogger(__name__)

ALLOWED_MIME = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
    "image/tiff",
    "application/pdf",
}

_WINDOWS_RESERVED = {
    "CON", "PRN", "AUX", "NUL",
    *(f"COM{i}" for i in range(1, 10)),
    *(f"LPT{i}" for i in range(1, 10)),
}  # fmt: skip


def sniff_mime(head: bytes) -> str | None:
    """Erkennt den Dateityp an den ersten Bytes (der Absender-Angabe wird nicht vertraut)."""
    if head.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if head.startswith(b"%PDF-"):
        return "application/pdf"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp"
    if head[4:8] == b"ftyp" and head[8:12] in (b"heic", b"heix", b"hevc", b"mif1", b"msf1"):
        return "image/heic"
    if head[:4] in (b"II*\x00", b"MM\x00*"):
        return "image/tiff"
    return None


def _mime_family(mime: str) -> str:
    return "image/heic" if mime in ("image/heic", "image/heif") else mime


def multicast_interfaces(port: int = DEFAULT_PORT) -> list[str]:
    """Find active IPv4 interfaces and put the default-route interface first."""
    addresses: list[str] = []
    try:
        resolved = socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET, socket.SOCK_DGRAM)
    except OSError:
        resolved = []
    for item in resolved:
        try:
            ip = ipaddress.ip_address(item[4][0])
        except (IndexError, ValueError):
            continue
        if ip.is_loopback or ip.is_unspecified or ip.is_multicast:
            continue
        value = str(ip)
        if value not in addresses:
            addresses.append(value)

    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
            probe.connect(("1.1.1.1", port))
            ip = ipaddress.ip_address(probe.getsockname()[0])
            preferred = (
                str(ip) if not (ip.is_loopback or ip.is_unspecified or ip.is_multicast) else None
            )
    except (OSError, ValueError):
        preferred = None
    if preferred and preferred not in addresses:
        addresses.insert(0, preferred)
    elif preferred:
        addresses.remove(preferred)
        addresses.insert(0, preferred)
    if not addresses:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
                probe.connect((MULTICAST_GROUP, port))
                ip = ipaddress.ip_address(probe.getsockname()[0])
            if not (ip.is_loopback or ip.is_unspecified or ip.is_multicast):
                addresses.append(str(ip))
        except (OSError, ValueError):
            pass
    return addresses


def create_multicast_socket(port: int, interface: str) -> socket.socket:
    """Create one LocalSend multicast socket bound to a single interface."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
    try:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind(("", port))
        membership = socket.inet_aton(MULTICAST_GROUP) + socket.inet_aton(interface)
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP, membership)
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_IF, socket.inet_aton(interface))
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 1)
        sock.setblocking(False)
    except BaseException:
        sock.close()
        raise
    return sock


def create_multicast_sender_socket(interface: str) -> socket.socket:
    """Create a send-only socket when Windows reserves the LocalSend UDP port."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
    try:
        sock.bind(("", 0))
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_IF, socket.inet_aton(interface))
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 1)
        sock.setblocking(False)
    except BaseException:
        sock.close()
        raise
    return sock


def sanitize_filename(name: str, fallback: str = "datei") -> str:
    name = name.replace("\\", "/").rsplit("/", 1)[-1]
    name = re.sub(r'[<>:"|?*\x00-\x1f]', "_", name).strip(" .")
    stem, dot, ext = name.rpartition(".")
    if not dot:
        stem, ext = name, ""
    if stem.upper() in _WINDOWS_RESERVED:
        stem = "_" + stem
    stem = stem[:80] or fallback
    ext = re.sub(r"[^A-Za-z0-9]", "", ext)[:8]
    return f"{stem}.{ext}" if ext else stem


@dataclass
class DeviceInfo:
    alias: str
    fingerprint: str
    ip: str
    device_model: str | None = None
    device_type: str | None = None


@dataclass
class IncomingFile:
    id: str
    file_name: str
    size: int
    mime: str
    sha256: str | None = None


@dataclass
class ReceivedFile:
    id: str
    original_name: str
    path: Path
    size: int
    sha256: str
    mime: str


@dataclass
class Batch:
    session_id: str
    device: DeviceInfo
    received_at: str
    files: list[ReceivedFile] = field(default_factory=list)


# Entscheidet ueber eine Anfrage. Rueckgabe: Menge der angenommenen Datei-IDs (leer = ablehnen).
Decider = Callable[[DeviceInfo, list[IncomingFile]], Awaitable[set[str]]]
OnBatch = Callable[[Batch], Awaitable[None] | None]


async def reject_all(device: DeviceInfo, files: list[IncomingFile]) -> set[str]:
    return set()


@dataclass
class _Session:
    id: str
    device: DeviceInfo
    tokens: dict[str, str]  # file_id -> token
    incoming: dict[str, IncomingFile]
    dir: Path
    batch: Batch
    last_activity: float
    done: set[str] = field(default_factory=set)
    busy: set[str] = field(default_factory=set)


class Receiver:
    def __init__(
        self,
        quarantine_dir: Path,
        *,
        alias: str = "Save Your Documents",
        fingerprint: str | None = None,
        tls_identity: tuple[Path, Path] | None = None,
        protocol: str = "https",
        port: int = DEFAULT_PORT,
        decider: Decider = reject_all,
        on_batch: OnBatch | None = None,
        trusted_fingerprints: set[str] | None = None,
        pin: str | None = None,
        max_file_size: int = 100 * 1024 * 1024,
        max_files: int = 100,
        session_timeout: float = 600.0,
        decision_timeout: float = 120.0,
        max_requests_per_minute: int = 20,
    ):
        self.quarantine_dir = Path(quarantine_dir)
        self.quarantine_dir.mkdir(parents=True, exist_ok=True)
        self.alias = alias
        self.fingerprint = fingerprint or secrets.token_hex(16)
        self.tls_identity = tls_identity
        self.protocol = protocol
        self.port = port
        self.decider = decider
        self.on_batch = on_batch
        self.trusted = set(trusted_fingerprints or ())
        self.pin = pin
        self.max_file_size = max_file_size
        self.max_files = max_files
        self.session_timeout = session_timeout
        self.decision_timeout = decision_timeout
        self.max_requests_per_minute = max_requests_per_minute
        self.session: _Session | None = None
        self._pending = False
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self.known_devices: dict[str, DeviceInfo] = {}

    def info(self) -> dict:
        return {
            "alias": self.alias,
            "version": PROTOCOL_VERSION,
            "deviceModel": "Windows",
            "deviceType": "desktop",
            "fingerprint": self.fingerprint,
            "port": self.port,
            "protocol": self.protocol,
            "download": False,
        }

    # --- interne Helfer -------------------------------------------------------

    def _rate_limited(self, ip: str) -> bool:
        now = time.monotonic()
        hits = self._hits[ip]
        while hits and now - hits[0] > 60:
            hits.popleft()
        if len(hits) >= self.max_requests_per_minute:
            return True
        hits.append(now)
        return False

    def _expire_session(self) -> None:
        s = self.session
        if s and time.monotonic() - s.last_activity > self.session_timeout:
            self._discard(s)

    def _discard(self, s: _Session) -> None:
        shutil.rmtree(s.dir, ignore_errors=True)
        if self.session is s:
            self.session = None

    def _check_token(self, session_id: str, file_id: str, token: str, ip: str):
        s = self.session
        if (
            not s
            or not secrets.compare_digest(s.id, session_id)
            or file_id not in s.tokens
            or not secrets.compare_digest(s.tokens[file_id], token)
            or s.device.ip != ip
        ):
            return None
        return s

    # --- Protokoll-Operationen ------------------------------------------------

    async def prepare_upload(self, body: dict, ip: str, pin: str | None) -> tuple[int, dict | None]:
        if self._rate_limited(ip):
            return 429, {"message": "Too many requests"}
        try:
            info = body["info"]
            raw_files = body["files"]
            device = DeviceInfo(
                alias=str(info["alias"])[:64],
                fingerprint=str(info.get("fingerprint", ""))[:128],
                ip=ip,
                device_model=info.get("deviceModel"),
                device_type=info.get("deviceType"),
            )
            incoming = [
                IncomingFile(
                    id=str(f["id"]),
                    file_name=sanitize_filename(str(f["fileName"])),
                    size=int(f["size"]),
                    mime=str(f.get("fileType", "")),
                    sha256=(str(f["sha256"]).lower() if f.get("sha256") else None),
                )
                for f in raw_files.values()
            ]
            if not incoming or len(incoming) > self.max_files:
                raise ValueError
            if len({f.id for f in incoming}) != len(incoming):
                raise ValueError
            if any(f.size < 0 for f in incoming):
                raise ValueError
        except (KeyError, TypeError, ValueError, AttributeError):
            return 400, {"message": "Invalid body"}

        if self.pin is not None and not (pin and secrets.compare_digest(self.pin, pin)):
            return 401, {"message": "PIN required / Invalid PIN"}

        self._expire_session()
        if self.session or self._pending:
            return 409, {"message": "Blocked by another session"}

        eligible = [
            f
            for f in incoming
            if _mime_family(f.mime) in ALLOWED_MIME and f.size <= self.max_file_size
        ]
        if not eligible:
            return 403, {"message": "Rejected"}

        self._pending = True
        try:
            if device.fingerprint in self.trusted:
                accepted = {f.id for f in eligible}
            else:
                try:
                    accepted = await asyncio.wait_for(
                        self.decider(device, eligible), self.decision_timeout
                    )
                except TimeoutError:
                    accepted = set()
            accepted &= {f.id for f in eligible}
            if not accepted:
                return 403, {"message": "Rejected"}

            session_id = secrets.token_urlsafe(16)
            sdir = self.quarantine_dir / session_id
            sdir.mkdir(parents=True)
            self.session = _Session(
                id=session_id,
                device=device,
                tokens={fid: secrets.token_urlsafe(16) for fid in accepted},
                incoming={f.id: f for f in eligible if f.id in accepted},
                dir=sdir,
                batch=Batch(session_id, device, datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")),
                last_activity=time.monotonic(),
            )
            self.known_devices[device.fingerprint] = device
            return 200, {"sessionId": session_id, "files": dict(self.session.tokens)}
        finally:
            self._pending = False

    async def receive_file(
        self, session_id: str, file_id: str, token: str, ip: str, stream
    ) -> tuple[int, dict | None]:
        s = self._check_token(session_id, file_id, token, ip)
        if s is None:
            return 403, {"message": "Invalid token or IP address"}
        if file_id in s.done or file_id in s.busy:
            return 409, {"message": "Blocked by another session"}
        s.busy.add(file_id)
        meta = s.incoming[file_id]
        seq = list(s.incoming).index(file_id) + 1
        target = s.dir / f"{seq:03d}-{meta.file_name}"
        digest = hashlib.sha256()
        size = 0
        head = b""
        status: tuple[int, dict | None] = (200, None)
        try:
            with target.open("wb") as out:
                async for chunk in stream:
                    size += len(chunk)
                    if size > min(self.max_file_size, meta.size):
                        status = (400, {"message": "Invalid body"})
                        break
                    if len(head) < 16:
                        head += chunk[: 16 - len(head)]
                    digest.update(chunk)
                    out.write(chunk)
            if status[0] == 200:
                sniffed = sniff_mime(head)
                if size != meta.size:
                    status = (400, {"message": "Invalid body"})
                elif sniffed is None or sniffed != _mime_family(meta.mime):
                    status = (422, {"message": "File type not allowed"})
                elif meta.sha256 and digest.hexdigest() != meta.sha256:
                    status = (422, {"message": "Checksum mismatch (sha256)"})
        except Exception:
            target.unlink(missing_ok=True)
            s.busy.discard(file_id)
            raise
        s.busy.discard(file_id)
        s.last_activity = time.monotonic()
        if status[0] != 200:
            target.unlink(missing_ok=True)
            return status
        s.done.add(file_id)
        s.batch.files.append(
            ReceivedFile(file_id, meta.file_name, target, size, digest.hexdigest(), sniffed)
        )
        if s.done == set(s.tokens):
            await self._complete(s)
        return 200, None

    async def _complete(self, s: _Session) -> None:
        batch = s.batch
        if self.session is s:
            self.session = (
                None  # Dateien bleiben in der Quarantaene, bis der Stapel uebernommen ist
            )
        if self.on_batch:
            result = self.on_batch(batch)
            if asyncio.iscoroutine(result):
                await result

    def cancel(self, session_id: str, ip: str) -> bool:
        s = self.session
        if not s or not secrets.compare_digest(s.id, session_id) or s.device.ip != ip:
            return False
        self._discard(s)
        return True


def create_app(receiver: Receiver) -> FastAPI:
    app = FastAPI(title="LocalSend-Empfaenger", docs_url=None, redoc_url=None, openapi_url=None)

    def respond(result: tuple[int, dict | None]) -> Response:
        status, payload = result
        if payload is None:
            return Response(status_code=status)
        return JSONResponse(payload, status_code=status)

    def peer(request: Request) -> str:
        return request.client.host if request.client else ""

    @app.get(f"{API}/info")
    async def info():
        return receiver.info()

    @app.post(f"{API}/register")
    async def register(request: Request):
        try:
            data = await request.json()
            device = DeviceInfo(
                alias=str(data["alias"])[:64],
                fingerprint=str(data.get("fingerprint", ""))[:128],
                ip=peer(request),
                device_model=data.get("deviceModel"),
                device_type=data.get("deviceType"),
            )
        except (ValueError, KeyError, TypeError):
            return JSONResponse({"message": "Invalid body"}, status_code=400)
        receiver.known_devices.setdefault(device.fingerprint, device)
        return receiver.info()

    @app.post(f"{API}/prepare-upload")
    async def prepare_upload(request: Request, pin: str | None = None):
        try:
            body = json.loads(await request.body())
            if not isinstance(body, dict):
                raise ValueError
        except ValueError:
            return JSONResponse({"message": "Invalid body"}, status_code=400)
        return respond(await receiver.prepare_upload(body, peer(request), pin))

    @app.post(f"{API}/upload")
    async def upload(
        request: Request,
        sessionId: str | None = None,
        fileId: str | None = None,
        token: str | None = None,
    ):
        if not (sessionId and fileId and token):
            return JSONResponse({"message": "Missing parameters"}, status_code=400)
        return respond(
            await receiver.receive_file(sessionId, fileId, token, peer(request), request.stream())
        )

    @app.post(f"{API}/cancel")
    async def cancel(request: Request, sessionId: str | None = None):
        if not sessionId:
            return JSONResponse({"message": "Missing parameters"}, status_code=400)
        receiver.cancel(sessionId, peer(request))
        return Response(status_code=200)

    return app


# --- Zertifikat (HTTPS-Modus: Fingerabdruck = SHA-256 des Zertifikats) ------------


def make_self_signed_cert(
    directory: Path, common_name: str = "Save Your Documents"
) -> tuple[Path, Path, str]:
    directory.mkdir(parents=True, exist_ok=True)
    cert_path, key_path = directory / "cert.pem", directory / "key.pem"
    if cert_path.exists() and key_path.exists():
        cert = x509.load_pem_x509_certificate(cert_path.read_bytes())
        return cert_path, key_path, certificate_fingerprint(cert)
    key = ec.generate_private_key(ec.SECP256R1())
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, common_name)])
    now = datetime.now(UTC)
    cert = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(days=1))
        .not_valid_after(now + timedelta(days=3650))
        .sign(key, hashes.SHA256())
    )
    key_path.write_bytes(
        key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )
    )
    key_path.chmod(0o600)
    cert_path.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    return cert_path, key_path, certificate_fingerprint(cert)


def certificate_fingerprint(cert: x509.Certificate) -> str:
    return hashlib.sha256(cert.public_bytes(serialization.Encoding.DER)).hexdigest()


# --- Erkennung per Multicast ----------------------------------------------------


def announcement(receiver: Receiver, announce: bool = True) -> bytes:
    return json.dumps({**receiver.info(), "announce": announce}).encode()


def parse_announcement(data: bytes) -> dict | None:
    try:
        msg = json.loads(data)
        if not isinstance(msg, dict) or "alias" not in msg or "fingerprint" not in msg:
            return None
        return msg
    except (ValueError, UnicodeDecodeError):
        return None


Registrar = Callable[[str, dict], Awaitable[None]]


class MulticastListener(asyncio.DatagramProtocol):
    """Antwortet auf Ankuendigungen anderer Geraete per HTTP-register (Abschnitt 3.1)."""

    def __init__(self, receiver: Receiver, registrar: Registrar):
        self.receiver = receiver
        self.registrar = registrar
        self.transport: asyncio.DatagramTransport | None = None
        self._tasks: set[asyncio.Task] = set()
        self._announcement_task: asyncio.Task | None = None

    def connection_made(self, transport: asyncio.DatagramTransport) -> None:
        self.transport = transport
        self._announcement_task = asyncio.create_task(self._announce())

    async def _announce(self) -> None:
        payload = announcement(self.receiver)
        for delay in ANNOUNCEMENT_DELAYS:
            await asyncio.sleep(delay)
            if self.transport is None:
                return
            self.transport.sendto(payload, (MULTICAST_GROUP, self.receiver.port))

    def connection_lost(self, exc: Exception | None) -> None:
        self.transport = None
        if self._announcement_task and not self._announcement_task.done():
            self._announcement_task.cancel()

    def datagram_received(self, data: bytes, addr) -> None:
        msg = parse_announcement(data)
        if (
            msg is None
            or msg["fingerprint"] == self.receiver.fingerprint
            or not msg.get("announce")
        ):
            return
        try:
            ipaddress.ip_address(addr[0])
        except ValueError:
            return
        task = asyncio.create_task(self.registrar(addr[0], msg))
        self._tasks.add(task)
        task.add_done_callback(self._registration_done)

    def _registration_done(self, task: asyncio.Task) -> None:
        self._tasks.discard(task)
        if task.cancelled():
            return
        error = task.exception()
        if error is not None:
            log.debug("localsend_register_failed type=%s", type(error).__name__)


class MulticastTransports:
    def __init__(self, transports: list[asyncio.DatagramTransport]):
        self.transports = transports

    def close(self) -> None:
        for transport in self.transports:
            transport.close()


async def register_via_http(receiver: Receiver, ip: str, msg: dict) -> None:
    import httpx

    port = int(msg.get("port", DEFAULT_PORT))
    proto = msg.get("protocol", "https")
    if proto not in ("http", "https"):
        return
    verify: ssl.SSLContext | bool = False
    if proto == "https":
        if receiver.tls_identity is None:
            raise ValueError("LocalSend HTTPS registration requires a TLS client identity")
        verify = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        verify.check_hostname = False
        verify.verify_mode = ssl.CERT_NONE
        verify.load_cert_chain(
            certfile=str(receiver.tls_identity[0]),
            keyfile=str(receiver.tls_identity[1]),
        )
    async with httpx.AsyncClient(verify=verify, timeout=5, trust_env=False) as client:  # noqa: S501
        response = await client.post(f"{proto}://{ip}:{port}{API}/register", json=receiver.info())
        response.raise_for_status()


async def start_multicast(
    receiver: Receiver, registrar: Registrar | None = None
) -> MulticastTransports:
    """Join and announce over one multicast socket per active IPv4 interface."""
    loop = asyncio.get_running_loop()
    active_registrar = registrar
    if active_registrar is None:
        async def default_registrar(ip: str, msg: dict) -> None:
            await register_via_http(receiver, ip, msg)

        active_registrar = default_registrar

    transports = []
    last_error = None
    try:
        interfaces = multicast_interfaces(receiver.port)
        for interface in interfaces:
            for send_only in (False, True):
                sock = None
                try:
                    if send_only:
                        sock = create_multicast_sender_socket(interface)
                    else:
                        sock = create_multicast_socket(receiver.port, interface)
                    transport, _ = await loop.create_datagram_endpoint(
                        lambda: MulticastListener(receiver, active_registrar), sock=sock
                    )
                except OSError as exc:
                    last_error = exc
                    if sock is not None:
                        sock.close()
                    event = (
                        "localsend_multicast_send_failed"
                        if send_only
                        else "localsend_multicast_listener_unavailable"
                    )
                    log.warning(
                        "%s interface=%s errno=%s winerror=%s",
                        event,
                        interface,
                        exc.errno if exc.errno is not None else "none",
                        getattr(exc, "winerror", None) or "none",
                    )
                    if send_only:
                        break
                    continue
                transports.append(transport)
                break
        if not transports:
            raise OSError("No IPv4 interface could send a LocalSend announcement") from last_error
    except BaseException:
        for transport in transports:
            transport.close()
        raise
    return MulticastTransports(transports)
