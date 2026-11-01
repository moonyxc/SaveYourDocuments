import base64
from subprocess import CompletedProcess

from syd import firewall


def test_firewall_status_requires_tcp_and_udp_rules(monkeypatch):
    monkeypatch.setattr(firewall, "supported", lambda: True)
    existing = {firewall.RULE_NAME, firewall.DISCOVERY_RULE_NAME}

    def run(args, **_):
        name = args[-1].removeprefix("name=")
        return CompletedProcess(args, 0 if name in existing else 1)

    monkeypatch.setattr(firewall.subprocess, "run", run)
    assert firewall.rule_exists() is True
    existing.remove(firewall.DISCOVERY_RULE_NAME)
    assert firewall.rule_exists() is False


def test_firewall_rules_allow_tcp_transfers_and_udp_discovery():
    tcp = firewall.add_rule_args(53317)
    udp = firewall.discovery_rule_args(53317)

    assert "protocol=TCP" in tcp and "localport=53317" in tcp
    assert "protocol=UDP" in udp and "localport=53317" in udp
    assert "profile=any" in tcp and "profile=any" in udp
    assert "remoteip=localsubnet" in tcp and "remoteip=localsubnet" in udp


def test_add_rule_runs_both_rules_in_one_elevated_process(monkeypatch):
    calls = []
    monkeypatch.setattr(firewall, "supported", lambda: True)
    monkeypatch.setattr(firewall, "rule_exists", lambda: True)
    monkeypatch.setattr(
        firewall.subprocess,
        "run",
        lambda args, **_: calls.append(args) or CompletedProcess(args, 0),
    )

    assert firewall.add_rule(53317) == {"ok": True}
    assert len(calls) == 1
    command = calls[0][-1]
    encoded = command.split("-EncodedCommand ", 1)[1].split("'", 1)[0]
    script = base64.b64decode(encoded).decode("utf-16le")
    assert "protocol=TCP" in script and "protocol=UDP" in script
    assert script.count("& netsh") == 2
    assert "-PassThru" in command and "exit $process.ExitCode" in command


def test_add_rule_reports_elevated_process_failure(monkeypatch):
    monkeypatch.setattr(firewall, "supported", lambda: True)
    monkeypatch.setattr(
        firewall.subprocess,
        "run",
        lambda args, **_: CompletedProcess(args, 1),
    )

    assert firewall.add_rule(53317) == {"ok": False, "error": "regel_fehlgeschlagen"}
