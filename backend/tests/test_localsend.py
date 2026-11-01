import asyncio
import hashlib
import json
import socket
import ssl
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import httpx
import pytest
import uvicorn
from fastapi.testclient import TestClient

from syd.localsend import (
    API,
    MulticastListener,
    Receiver,
    announcement,
    create_app,
    make_self_signed_cert,
    multicast_interfaces,
    parse_announcement,
    register_via_http,
    sanitize_filename,
    sniff_mime,
    start_multicast,
)

JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 200
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 50
PDF = b"%PDF-1.7\n" + b"x" * 50

INFO = {
    "alias": "Nice Orange",
    "version": "2.0",
    "deviceModel": "Samsung",
    "deviceType": "mobile",
    "fingerprint": "handy-fp",
    "port": 53317,
    "protocol": "https",
}


def file_meta(fid, name, data, mime="image/jpeg", sha=True):
    return {
        "id": fid,
        "fileName": name,
        "size": len(data),
        "fileType": mime,
        "sha256": hashlib.sha256(data).hexdigest() if sha else None,
    }


def prepare_body(*items):
    return {"info": INFO, "files": {m["id"]: m for m, _ in items}}


def make(tmp_path, accept=True, **kw):
    batches = []

    async def decider(device, files):
        return {f.id for f in files} if accept else set()

    r = Receiver(tmp_path / "q", decider=decider, on_batch=batches.append, **kw)
    return r, TestClient(create_app(r)), batches


def upload(client, session, fid, token, data):
    return client.post(
        f"{API}/upload",
        params={"sessionId": session, "fileId": fid, "token": token},
        content=data,
    )


def test_info_and_register(tmp_path):
    r, c, _ = make(tmp_path)
    assert c.get(f"{API}/info").json()["alias"] == "Save Your Documents"
    assert r.info()["version"] == "2.2"
    resp = c.post(f"{API}/register", json=INFO)
    assert resp.status_code == 200 and resp.json()["fingerprint"] == r.fingerprint
    assert c.post(f"{API}/register", content=b"kaputt").status_code == 400


def test_multi_photo_batch_arrives_as_one_batch(tmp_path):
    r, c, batches = make(tmp_path)
    items = [
        (file_meta("a", "IMG_1.jpg", JPEG), JPEG),
        (file_meta("b", "IMG_2.png", PNG, "image/png"), PNG),
        (file_meta("c", "brief.pdf", PDF, "application/pdf"), PDF),
    ]
    resp = c.post(f"{API}/prepare-upload", json=prepare_body(*items))
    assert resp.status_code == 200
    sid, tokens = resp.json()["sessionId"], resp.json()["files"]
    for meta, data in items[:2]:
        assert upload(c, sid, meta["id"], tokens[meta["id"]], data).status_code == 200
        assert batches == []
    assert upload(c, sid, "c", tokens["c"], PDF).status_code == 200
    assert len(batches) == 1
    batch = batches[0]
    assert [f.original_name for f in batch.files] == ["IMG_1.jpg", "IMG_2.png", "brief.pdf"]
    assert all(f.path.exists() and f.path.parent.parent == r.quarantine_dir for f in batch.files)
    assert batch.files[0].path.read_bytes() == JPEG
    assert batch.device.alias == "Nice Orange" and r.session is None


def test_unknown_device_rejected_by_default(tmp_path):
    batches = []
    r = Receiver(tmp_path / "q", on_batch=batches.append)  # Standard-Decider lehnt ab
    c = TestClient(create_app(r))
    meta = file_meta("a", "x.jpg", JPEG)
    resp = c.post(f"{API}/prepare-upload", json=prepare_body((meta, JPEG)))
    assert resp.status_code == 403
    assert r.session is None and list((tmp_path / "q").iterdir()) == []


def test_trusted_device_skips_prompt(tmp_path):
    r = Receiver(tmp_path / "q", trusted_fingerprints={"handy-fp"})
    c = TestClient(create_app(r))
    resp = c.post(f"{API}/prepare-upload", json=prepare_body((file_meta("a", "x.jpg", JPEG), JPEG)))
    assert resp.status_code == 200


def test_partial_accept_and_disallowed_types(tmp_path):
    async def decider(device, files):
        return {"a"}

    r = Receiver(tmp_path / "q", decider=decider)
    c = TestClient(create_app(r))
    items = [
        (file_meta("a", "x.jpg", JPEG), JPEG),
        (file_meta("b", "y.jpg", JPEG), JPEG),
        (file_meta("e", "virus.exe", b"MZ", "application/x-msdownload"), b"MZ"),
    ]
    resp = c.post(f"{API}/prepare-upload", json=prepare_body(*items))
    assert list(resp.json()["files"]) == ["a"]
    only_exe = prepare_body((file_meta("e", "v.exe", b"MZ", "application/x-msdownload"), b"MZ"))
    r.session = None
    assert c.post(f"{API}/prepare-upload", json=only_exe).status_code == 403


def test_second_session_blocked_then_cancel_cleans_up(tmp_path):
    r, c, batches = make(tmp_path)
    body = prepare_body(
        (file_meta("a", "x.jpg", JPEG), JPEG), (file_meta("b", "y.jpg", JPEG), JPEG)
    )
    first = c.post(f"{API}/prepare-upload", json=body).json()
    assert c.post(f"{API}/prepare-upload", json=body).status_code == 409
    upload(c, first["sessionId"], "a", first["files"]["a"], JPEG)
    assert c.post(f"{API}/cancel", params={"sessionId": first["sessionId"]}).status_code == 200
    assert r.session is None and batches == []
    assert list((tmp_path / "q").iterdir()) == []
    assert c.post(f"{API}/prepare-upload", json=body).status_code == 200


def test_stale_session_expires(tmp_path):
    r, c, _ = make(tmp_path, session_timeout=0.05)
    body = prepare_body((file_meta("a", "x.jpg", JPEG), JPEG))
    assert c.post(f"{API}/prepare-upload", json=body).status_code == 200
    time.sleep(0.1)
    assert c.post(f"{API}/prepare-upload", json=body).status_code == 200


def test_pin(tmp_path):
    r, c, _ = make(tmp_path, pin="123456")
    body = prepare_body((file_meta("a", "x.jpg", JPEG), JPEG))
    assert c.post(f"{API}/prepare-upload", json=body).status_code == 401
    assert c.post(f"{API}/prepare-upload?pin=000000", json=body).status_code == 401
    assert c.post(f"{API}/prepare-upload?pin=123456", json=body).status_code == 200


def test_upload_validation(tmp_path):
    r, c, batches = make(tmp_path)
    good = file_meta("a", "x.jpg", JPEG)
    bad_sha = {**file_meta("b", "y.jpg", JPEG), "sha256": "0" * 64}
    fake = file_meta("d", "z.jpg", PDF)  # behauptet JPEG, ist PDF
    fake["fileType"] = "image/jpeg"
    resp = c.post(
        f"{API}/prepare-upload",
        json={"info": INFO, "files": {"a": good, "b": bad_sha, "d": fake}},
    ).json()
    sid, tok = resp["sessionId"], resp["files"]
    assert upload(c, sid, "a", "falsch", JPEG).status_code == 403
    assert upload(c, sid, "b", tok["b"], JPEG).status_code == 422
    assert upload(c, sid, "d", tok["d"], PDF).status_code == 422
    assert upload(c, sid, "a", tok["a"], JPEG + b"mehr").status_code == 400  # Groesse stimmt nicht
    assert c.post(f"{API}/upload", params={"sessionId": sid}).status_code == 400
    assert upload(c, sid, "a", tok["a"], JPEG).status_code == 200
    assert upload(c, sid, "a", tok["a"], JPEG).status_code in (403, 409)
    assert batches == []  # b und d fehlen noch
    leftovers = list((tmp_path / "q" / sid).iterdir())
    assert [p.name for p in leftovers] == ["001-x.jpg"]


def test_size_limit_and_bad_bodies(tmp_path):
    r, c, _ = make(tmp_path, max_file_size=100)
    big = file_meta("a", "x.jpg", JPEG)  # 204 Byte > 100
    assert c.post(f"{API}/prepare-upload", json=prepare_body((big, JPEG))).status_code == 403
    assert c.post(f"{API}/prepare-upload", content=b"nope").status_code == 400
    assert c.post(f"{API}/prepare-upload", json={"info": INFO, "files": {}}).status_code == 400
    assert c.post(f"{API}/prepare-upload", json={"info": {}, "files": {"a": {}}}).status_code == 400
    assert c.post(f"{API}/prepare-upload", json=[1]).status_code == 400


def test_rate_limit(tmp_path):
    r, c, _ = make(tmp_path, accept=False, max_requests_per_minute=3)
    body = prepare_body((file_meta("a", "x.jpg", JPEG), JPEG))
    codes = [c.post(f"{API}/prepare-upload", json=body).status_code for _ in range(5)]
    assert codes == [403, 403, 403, 429, 429]


def test_decision_timeout_means_reject(tmp_path):
    async def slow(device, files):
        await asyncio.sleep(5)
        return {f.id for f in files}

    r = Receiver(tmp_path / "q", decider=slow, decision_timeout=0.05)
    c = TestClient(create_app(r))
    body = prepare_body((file_meta("a", "x.jpg", JPEG), JPEG))
    assert c.post(f"{API}/prepare-upload", json=body).status_code == 403
    assert r.session is None


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("../../Windows/system32/evil.jpg", "evil.jpg"),
        ("C:\\Users\\x\\foto.JPG", "foto.JPG"),
        ("a<b>:c|d?.jpg", "a_b__c_d_.jpg"),
        ("CON.jpg", "_CON.jpg"),
        ("", "datei"),
        ("...", "datei"),
        ("x" * 300 + ".pdf", "x" * 80 + ".pdf"),
    ],
)
def test_sanitize_filename(raw, expected):
    assert sanitize_filename(raw) == expected


def test_sniff_mime():
    assert sniff_mime(JPEG[:16]) == "image/jpeg"
    assert sniff_mime(PDF[:16]) == "application/pdf"
    assert sniff_mime(b"RIFF\x00\x00\x00\x00WEBPVP8 ") == "image/webp"
    assert sniff_mime(b"\x00\x00\x00\x18ftypheic") == "image/heic"
    assert sniff_mime(b"MZ\x90\x00") is None


def test_announcement_and_multicast_response(tmp_path):
    r, _, _ = make(tmp_path, fingerprint="meine-fp")
    msg = parse_announcement(announcement(r))
    assert msg["announce"] is True and msg["fingerprint"] == "meine-fp"
    assert parse_announcement(b"\xff\xfe") is None and parse_announcement(b"[]") is None

    async def run():
        seen = []

        async def registrar(ip, m):
            seen.append((ip, m["alias"]))

        listener = MulticastListener(r, registrar)
        other = {**INFO, "announce": True}
        listener.datagram_received(json.dumps(other).encode(), ("192.168.1.20", 53317))
        listener.datagram_received(announcement(r), ("192.168.1.5", 53317))  # eigene Meldung
        listener.datagram_received(
            json.dumps({**INFO, "announce": False}).encode(), ("10.0.0.2", 1)
        )
        listener.datagram_received(b"muell", ("10.0.0.3", 1))
        await asyncio.sleep(0.05)
        return seen

    assert asyncio.run(run()) == [("192.168.1.20", "Nice Orange")]


def test_multicast_interfaces_prioritize_default_route(monkeypatch):
    class FakeSocket:
        def __enter__(self):
            return self

        def __exit__(self, *_):
            return None

        def connect(self, address):
            assert address == ("1.1.1.1", 53317)

        def getsockname(self):
            return ("192.168.178.103", 53317)

    monkeypatch.setattr("syd.localsend.socket.socket", lambda *_: FakeSocket())
    monkeypatch.setattr(
        "syd.localsend.socket.getaddrinfo",
        lambda *_: [
            (socket.AF_INET, socket.SOCK_DGRAM, 0, "", ("192.168.56.1", 0)),
            (socket.AF_INET, socket.SOCK_DGRAM, 0, "", ("192.168.178.41", 0)),
            (socket.AF_INET, socket.SOCK_DGRAM, 0, "", ("127.0.0.1", 0)),
        ],
    )
    assert multicast_interfaces(53317) == ["192.168.178.103", "192.168.56.1", "192.168.178.41"]


def test_multicast_uses_a_socket_and_announcement_burst_per_interface(monkeypatch, tmp_path):
    r, _, _ = make(tmp_path)
    interfaces = ["192.168.178.103", "192.168.178.41"]
    created = []

    class FakeSocket:
        def __init__(self):
            self.options = []
            self.bound = None
            self.blocking = None
            self.closed = False

        def setsockopt(self, level, option, value):
            self.options.append((level, option, value))

        def bind(self, address):
            self.bound = address

        def setblocking(self, value):
            self.blocking = value

        def close(self):
            self.closed = True

    class FakeTransport:
        def __init__(self):
            self.sent = []
            self.protocol = None
            self.closed = False

        def sendto(self, payload, address):
            self.sent.append((payload, address))

        def close(self):
            self.closed = True
            self.protocol.connection_lost(None)

    async def create_endpoint(loop, protocol_factory, *, sock):
        transport = FakeTransport()
        protocol = protocol_factory()
        transport.protocol = protocol
        protocol.connection_made(transport)
        created.append((sock, transport))
        return transport, protocol

    async def registrar(_ip, _message):
        return None

    monkeypatch.setattr(
        "asyncio.BaseEventLoop.create_datagram_endpoint", create_endpoint
    )
    monkeypatch.setattr("syd.localsend.multicast_interfaces", lambda _port: interfaces)
    monkeypatch.setattr("syd.localsend.ANNOUNCEMENT_DELAYS", (0, 0, 0))

    async def run():
        monkeypatch.setattr("syd.localsend.socket.socket", lambda *_: FakeSocket())
        transports = await start_multicast(r, registrar)
        await asyncio.sleep(0.01)
        assert len(created) == len(interfaces)
        for (sock, transport), interface in zip(created, interfaces, strict=True):
            assert sock.bound == ("", r.port) and sock.blocking is False
            memberships = [value for _, opt, value in sock.options if opt == socket.IP_ADD_MEMBERSHIP]
            outgoing = [value for _, opt, value in sock.options if opt == socket.IP_MULTICAST_IF]
            assert memberships == [
                socket.inet_aton("224.0.0.167") + socket.inet_aton(interface)
            ]
            assert outgoing == [socket.inet_aton(interface)]
            assert len(transport.sent) == 3
            assert all(
                address == ("224.0.0.167", r.port)
                and parse_announcement(payload)["announce"]
                for payload, address in transport.sent
            )
        transports.close()
        await asyncio.sleep(0)
        assert all(transport.closed for _, transport in created)

    asyncio.run(run())


def test_multicast_falls_back_to_send_only_when_port_is_reserved(monkeypatch, tmp_path):
    r, _, _ = make(tmp_path)
    interfaces = ["192.168.178.103", "192.168.178.41"]
    senders = []
    transports_created = []

    class FakeSocket:
        def close(self):
            return None

    class FakeTransport:
        def __init__(self):
            self.sent = []
            self.protocol = None

        def sendto(self, payload, address):
            self.sent.append((payload, address))

        def close(self):
            self.protocol.connection_lost(None)

    def reserved_port(port, interface):
        assert port == r.port
        raise PermissionError(13, "reserved UDP port", None, 10013)

    def sender_socket(interface):
        senders.append(interface)
        return FakeSocket()

    async def create_endpoint(loop, protocol_factory, *, sock):
        assert isinstance(sock, FakeSocket)
        transport = FakeTransport()
        protocol = protocol_factory()
        transport.protocol = protocol
        protocol.connection_made(transport)
        transports_created.append(transport)
        return transport, protocol

    async def registrar(_ip, _message):
        return None

    monkeypatch.setattr("asyncio.BaseEventLoop.create_datagram_endpoint", create_endpoint)
    monkeypatch.setattr("syd.localsend.multicast_interfaces", lambda _port: interfaces)
    monkeypatch.setattr("syd.localsend.create_multicast_socket", reserved_port)
    monkeypatch.setattr("syd.localsend.create_multicast_sender_socket", sender_socket)
    monkeypatch.setattr("syd.localsend.ANNOUNCEMENT_DELAYS", (0,))

    async def run():
        transports = await start_multicast(r, registrar)
        await asyncio.sleep(0.01)
        assert senders == interfaces
        assert len(transports_created) == len(interfaces)
        assert all(len(transport.sent) == 1 for transport in transports_created)
        transports.close()

    asyncio.run(run())


def test_register_via_http_sends_client_certificate(tmp_path):
    cert, key, fingerprint = make_self_signed_cert(tmp_path / "identity")
    received = {}

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            size = int(self.headers["Content-Length"])
            received["info"] = json.loads(self.rfile.read(size))
            received["client_cert"] = self.connection.getpeercert(binary_form=True)
            self.send_response(200)
            self.send_header("Content-Length", "0")
            self.end_headers()

        def log_message(self, _format, *_args):
            return None

    tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    tls.load_cert_chain(str(cert), str(key))
    tls.load_verify_locations(cafile=str(cert))
    tls.verify_mode = ssl.CERT_REQUIRED
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    server.socket = tls.wrap_socket(server.socket, server_side=True)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    receiver = Receiver(
        tmp_path / "q",
        fingerprint=fingerprint,
        tls_identity=(cert, key),
    )
    try:
        asyncio.run(
            register_via_http(
                receiver,
                "127.0.0.1",
                {"protocol": "https", "port": server.server_address[1]},
            )
        )
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)

    assert hashlib.sha256(received["client_cert"]).hexdigest() == fingerprint
    assert received["info"]["version"] == "2.2"


def test_real_https_server_end_to_end(tmp_path):
    cert, key, fp = make_self_signed_cert(tmp_path / "tls")
    assert len(fp) == 64 and make_self_signed_cert(tmp_path / "tls")[2] == fp  # stabil
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    batches = []
    r = Receiver(
        tmp_path / "q",
        fingerprint=fp,
        port=port,
        trusted_fingerprints={"handy-fp"},
        on_batch=batches.append,
    )
    server = uvicorn.Server(
        uvicorn.Config(
            create_app(r),
            host="127.0.0.1",
            port=port,
            ssl_certfile=str(cert),
            ssl_keyfile=str(key),
            log_level="warning",
        )
    )
    t = threading.Thread(target=server.run, daemon=True)
    t.start()
    try:
        for _ in range(100):
            if server.started:
                break
            time.sleep(0.05)
        assert server.started
        base = f"https://127.0.0.1:{port}{API}"
        with httpx.Client(verify=False) as c:  # Selbstsigniert, Pruefung ueber Fingerabdruck
            assert c.get(f"{base}/info").json()["fingerprint"] == fp
            data = JPEG * 5000
            prep = c.post(
                f"{base}/prepare-upload", json=prepare_body((file_meta("a", "g.jpg", data), data))
            ).json()
            resp = c.post(
                f"{base}/upload",
                params={"sessionId": prep["sessionId"], "fileId": "a", "token": prep["files"]["a"]},
                content=data,
            )
            assert resp.status_code == 200
        assert len(batches) == 1 and batches[0].files[0].size == len(data)
    finally:
        server.should_exit = True
        t.join(timeout=5)
