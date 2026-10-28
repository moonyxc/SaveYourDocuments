"""S2-Messung: BLOB-Verhalten der verschluesselten Einzeldatei.

Aufruf: python scripts/bench_blobs.py [anzahl] [mb_pro_foto]
Zufallsdaten sind nicht komprimierbar und entsprechen damit JPEG-Fotos. Fuer die Abnahme
von S2 mit echten Scans auf der Zielhardware (Windows) wiederholen.
"""

import os
import sys
import tempfile
import time
from pathlib import Path

from syd.vault import Vault, generate_key


def main() -> None:
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 100
    mb = float(sys.argv[2]) if len(sys.argv) > 2 else 4.0
    size = int(mb * 1024 * 1024)
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "bench.syd"
        key = generate_key()
        photos = [os.urandom(size) for _ in range(min(count, 5))]
        with Vault.open(path, key, create=True) as v:
            t = time.perf_counter()
            ids = []
            for i in range(count):
                data = photos[i % len(photos)] + i.to_bytes(4, "big")  # eindeutig fuer Dedup
                ids.append(v.add_document(f"foto{i}.jpg", "image/jpeg", [data])[0])
            write = time.perf_counter() - t
            t = time.perf_counter()
            total = sum(len(c) for i in ids for c in v.stream_page(i, 1))
            read = time.perf_counter() - t
            t = time.perf_counter()
            v.backup_to(Path(tmp) / "kopie.syd")
            backup = time.perf_counter() - t
            t = time.perf_counter()
            ok = v.integrity_check()
            check = time.perf_counter() - t
        file_size = path.stat().st_size
        print(f"{count} Fotos a {mb} MB = {total / 1e6:.0f} MB Nutzdaten")
        print(f"Dateigroesse: {file_size / 1e6:.0f} MB (Overhead {file_size / total - 1:+.2%})")
        print(f"Schreiben: {total / 1e6 / write:.0f} MB/s, Lesen: {total / 1e6 / read:.0f} MB/s")
        print(f"Backup: {backup:.1f} s, Integritaet: {check:.1f} s ({'ok' if ok else 'FEHLER'})")


if __name__ == "__main__":
    main()
