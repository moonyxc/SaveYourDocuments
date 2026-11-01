"""Update-Pruefung ueber GitHub Releases (docs/github-api-version-check.md).

Nur Pruefung, kein Download und keine Installation. Es wird nichts ausser der
oeffentlichen Release-Liste abgefragt; es gehen keine Daten des Archivs ins Netz.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import UTC, datetime

import httpx

from . import __version__

OWNER = "moonyxc"
REPO = "SaveYourDocuments"
API = "https://api.github.com"
RELEASE_PREFIX = f"https://github.com/{OWNER}/{REPO}/"
MAX_PAGES = 5
TIMEOUT = 8.0

_SEMVER = re.compile(
    r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)"
    r"(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z.-]+)?$"
)


@dataclass(frozen=True)
class SemVer:
    major: int
    minor: int
    patch: int
    pre: tuple[str, ...] = ()

    @property
    def is_pre(self) -> bool:
        return bool(self.pre)

    def key(self):
        # Stabile Version steht ueber jeder Vorabversion gleicher Nummer.
        pre = (
            (1,)
            if not self.pre
            else (0, *((0, int(p), "") if p.isdigit() else (1, 0, p) for p in self.pre))
        )
        return (self.major, self.minor, self.patch, pre)

    def __lt__(self, other: SemVer) -> bool:
        return self.key() < other.key()

    def __eq__(self, other: object) -> bool:
        return isinstance(other, SemVer) and self.key() == other.key()

    def __hash__(self) -> int:
        return hash(self.key())


def parse_version(tag: str) -> SemVer | None:
    m = _SEMVER.match(tag.strip().removeprefix("v").removeprefix("V"))
    if not m:
        return None
    pre = tuple(m.group(4).split(".")) if m.group(4) else ()
    return SemVer(int(m.group(1)), int(m.group(2)), int(m.group(3)), pre)


def select_update(current: str, releases: list[dict], include_prerelease: bool = False) -> dict:
    """Bestimmt das Ergebnis aus Release-Liste und aktueller Version."""
    cur = parse_version(current)
    if cur is None:
        return {"status": "fehler", "message": "Die installierte Version ist nicht lesbar."}
    best: tuple[SemVer, dict] | None = None
    for rel in releases:
        if not isinstance(rel, dict) or rel.get("draft"):
            continue
        tag = rel.get("tag_name")
        v = parse_version(tag) if isinstance(tag, str) else None
        if v is None:
            continue
        if rel.get("prerelease") and not include_prerelease:
            continue
        if best is None or best[0] < v:
            best = (v, rel)
    if best is None:
        return {"status": "kein_release"}
    v, rel = best
    if not cur < v:
        return {"status": "aktuell", "latest": rel["tag_name"]}
    return {
        "status": "update",
        "latest": rel["tag_name"],
        "prerelease": bool(rel.get("prerelease")),
        "url": _release_url(rel),
    }


def _release_url(rel: dict) -> str:
    url = rel.get("html_url")
    if isinstance(url, str) and url.startswith(RELEASE_PREFIX):
        return url
    return f"{RELEASE_PREFIX}releases"


def _next_url(link: str | None) -> str | None:
    for part in (link or "").split(","):
        m = re.match(r'\s*<([^>]+)>\s*;\s*rel="next"', part)
        if m:
            return m.group(1)
    return None


def _failed(message: str, **extra) -> dict:
    return {"status": "fehler", "message": message, **extra}


def fetch_releases(client: httpx.Client) -> list[dict]:
    url: str | None = f"{API}/repos/{OWNER}/{REPO}/releases?per_page=100"
    out: list[dict] = []
    for _ in range(MAX_PAGES):
        if not url:
            break
        r = client.get(url)
        if r.status_code != 200:
            raise _HttpFail(r)
        data = r.json()
        if not isinstance(data, list):
            raise ValueError("Antwort ist keine Liste")
        out.extend(data)
        url = _next_url(r.headers.get("link"))
    return out


class _HttpFail(Exception):
    def __init__(self, response: httpx.Response):
        self.response = response


def _http_message(r: httpx.Response) -> dict:
    code = r.status_code
    if code in (403, 429):
        retry = None
        if r.headers.get("retry-after", "").isdigit():
            retry = int(r.headers["retry-after"])
        elif r.headers.get("x-ratelimit-remaining") == "0":
            reset = r.headers.get("x-ratelimit-reset", "")
            if reset.isdigit():
                retry = max(0, int(reset) - int(datetime.now(UTC).timestamp()))
        if retry is not None or code == 429:
            return _failed(
                "GitHub begrenzt gerade die Anfragen. Bitte versuche es später noch einmal.",
                retry_after=retry,
            )
        return _failed("GitHub hat die Anfrage abgelehnt. Bitte versuche es später noch einmal.")
    if code == 404:
        return _failed("Die Release-Seite wurde bei GitHub nicht gefunden.")
    return _failed(f"GitHub antwortet mit Fehler {code}. Bitte versuche es später noch einmal.")


def check(
    current: str = __version__,
    include_prerelease: bool = False,
    client: httpx.Client | None = None,
) -> dict:
    """Fragt GitHub ab. Liefert immer ein Ergebnis, wirft nie wegen Netzwerkfehlern."""
    own = client is None
    if client is None:
        client = httpx.Client(
            timeout=TIMEOUT,
            headers={
                "User-Agent": f"SaveYourDocuments/{current}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
        )
    try:
        releases = fetch_releases(client)
        result = select_update(current, releases, include_prerelease)
    except _HttpFail as e:
        result = _http_message(e.response)
    except httpx.HTTPError:
        result = _failed(
            "Keine Verbindung zu GitHub. Das ist kein Hinweis darauf, dass das Programm aktuell ist."
        )
    except ValueError:
        result = _failed("GitHub hat eine unerwartete Antwort geschickt.")
    finally:
        if own:
            client.close()
    result["current"] = current
    result["checked_at"] = datetime.now(UTC).isoformat(timespec="seconds")
    return result
