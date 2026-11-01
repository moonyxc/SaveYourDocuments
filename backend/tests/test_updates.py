from __future__ import annotations

import httpx
import pytest

from syd import updates
from syd.updates import parse_version, select_update


def rel(tag, pre=False, draft=False):
    return {
        "tag_name": tag,
        "prerelease": pre,
        "draft": draft,
        "html_url": f"https://github.com/moonyxc/SaveYourDocuments/releases/tag/{tag}",
    }


def test_semver_ordering():
    v = lambda s: parse_version(s)  # noqa: E731
    assert v("2.0.0") > v("1.10.0")
    assert v("2.0.0") > v("2.0.0-beta.1")
    assert v("2.0.0-beta.10") > v("2.0.0-beta.2")
    assert v("1.0.0-alpha") < v("1.0.0-alpha.1") < v("1.0.0-beta")
    assert v("1.0.0+build5") == v("1.0.0")
    assert v("v1.2.3") == v("1.2.3")
    assert parse_version("neu") is None and parse_version("1.2") is None


def test_select_update_rules():
    rels = [
        rel("v1.0.0"),
        rel("v1.10.0"),
        rel("v2.0.0-beta.1", pre=True),
        rel("v3.0.0", draft=True),
        rel("foo"),
    ]
    r = select_update("1.0.0", rels)
    assert r["status"] == "update" and r["latest"] == "v1.10.0" and r["prerelease"] is False
    assert select_update("1.10.0", rels)["status"] == "aktuell"
    assert select_update("2.0.0", rels)["status"] == "aktuell"
    assert select_update("1.0.0", rels, include_prerelease=True)["latest"] == "v2.0.0-beta.1"
    assert select_update("1.0.0", [rel("foo")])["status"] == "kein_release"
    assert select_update("1.0.0", [])["status"] == "kein_release"
    assert select_update("kaputt", rels)["status"] == "fehler"


def client(handler):
    return httpx.Client(transport=httpx.MockTransport(handler))


def test_check_follows_pages_and_ignores_order():
    def handler(req: httpx.Request):
        if "page=2" in str(req.url):
            return httpx.Response(200, json=[rel("v9.0.0")])
        return httpx.Response(
            200,
            json=[rel("v1.0.0")],
            headers={"link": '<https://api.github.com/x?page=2>; rel="next"'},
        )

    r = updates.check("1.0.0", client=client(handler))
    assert r["status"] == "update" and r["latest"] == "v9.0.0" and r["current"] == "1.0.0"


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(
            403, headers={"x-ratelimit-remaining": "0", "x-ratelimit-reset": "9999999999"}
        ),
        httpx.Response(429, headers={"retry-after": "30"}),
        httpx.Response(404),
        httpx.Response(500),
        httpx.Response(200, json={"nicht": "liste"}),
    ],
)
def test_check_failures_are_reported(response):
    r = updates.check("1.0.0", client=client(lambda req: response))
    assert r["status"] == "fehler" and r["message"]


def test_check_network_error():
    def boom(req):
        raise httpx.ConnectError("offline")

    r = updates.check("1.0.0", client=client(boom))
    assert r["status"] == "fehler"


def test_version_is_consistent_everywhere():
    import json
    import re
    import tomllib
    from pathlib import Path

    from syd import __version__

    root = Path(__file__).resolve().parents[2]
    assert parse_version(__version__) is not None
    assert (
        tomllib.loads((root / "backend/pyproject.toml").read_text())["project"]["version"]
        == __version__
    )
    assert (
        tomllib.loads((root / "src-tauri/Cargo.toml").read_text())["package"]["version"]
        == __version__
    )
    assert json.loads((root / "src-tauri/tauri.conf.json").read_text())["version"] == __version__
    assert re.search(
        rf'"version": "{re.escape(__version__)}"', (root / "frontend/package.json").read_text()
    )


def test_foreign_release_url_is_replaced():
    r = select_update("1.0.0", [{"tag_name": "v2.0.0", "html_url": "https://evil.example/x"}])
    assert r["url"] == "https://github.com/moonyxc/SaveYourDocuments/releases"
