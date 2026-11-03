import json
import os
import shutil
import subprocess
import sys
import venv
from pathlib import Path

import pytest

pytestmark = pytest.mark.skipif(sys.platform != "win32", reason="run.cmd requires Windows")


@pytest.fixture
def launcher(tmp_path, request):
    root = Path(__file__).resolve().parents[2]
    shutil.copyfile(root / "run.cmd", tmp_path / "run.cmd")
    (tmp_path / "backend").mkdir()
    if getattr(request, "param", True):
        venv.create(tmp_path / "backend" / ".venv", with_pip=False)

    frontend = tmp_path / "frontend"
    vite = frontend / "node_modules" / ".bin" / "vite.cmd"
    vite.parent.mkdir(parents=True)
    vite.touch()

    fakebin = tmp_path / "bin"
    fakebin.mkdir()
    (fakebin / "npm.cmd").write_text("@echo off\nexit /b 0\n", encoding="utf-8")
    modules = tmp_path / "modules"
    modules.mkdir()
    (modules / "pip.py").write_text(
        """\
import json
import os
import sys
from pathlib import Path

state = Path(os.environ["LAUNCH_TEST_STATE"])
with (state / "calls.jsonl").open("a", encoding="utf-8") as calls:
    calls.write(json.dumps([
        sys.argv[1:], os.environ.get("PIP_NO_CACHE_DIR"), os.environ.get("CONAN_HOME")
    ]) + "\\n")

action = sys.argv[1]
if action == "show":
    sys.exit(not (state / "installed").exists())
if action == "check":
    sys.exit((state / "broken").exists())
if action == "install":
    if (state / "fail").exists():
        sys.exit(1)
    (state / "installed").touch()
    (state / "broken").unlink(missing_ok=True)
""",
        encoding="utf-8",
    )
    (modules / "syd").mkdir()
    (modules / "syd" / "__init__.py").touch()
    (modules / "syd" / "main.py").write_text(
        """\
import json
import os
import sys
from pathlib import Path
Path(os.environ["LAUNCH_TEST_STATE"], "started").write_text(json.dumps([
   sys.argv[1:], os.environ.get("PIP_NO_CACHE_DIR"), os.environ.get("CONAN_HOME")
]))
""",
        encoding="utf-8",
    )

    env = os.environ.copy()
    env.pop("CONAN_HOME", None)
    env.pop("PIP_NO_CACHE_DIR", None)
    env.update(
        PATH=os.pathsep.join([str(fakebin), str(Path(sys._base_executable).parent), env["PATH"]]),
        PYTHONPATH=str(modules),
        LAUNCH_TEST_STATE=str(tmp_path),
    )

    def run(extra_env=None):
        run_env = env.copy()
        if extra_env:
            run_env.update(extra_env)
        return subprocess.run(
            [env["COMSPEC"], "/d", "/c", str(tmp_path / "run.cmd"), "--no-browser"],
            cwd=tmp_path,
            env=run_env,
            capture_output=True,
            text=True,
            timeout=30,
        )

    return tmp_path, run


def test_run_retries_failed_install_without_pip_cache(launcher):
    state, run = launcher
    (state / "fail").touch()

    assert run().returncode == 1
    assert not (state / "started").exists()

    (state / "fail").unlink()
    assert run().returncode == 0
    started = json.loads((state / "started").read_text())
    assert "--no-browser" in started[0]
    assert started[1:] == [None, None]
    assert run().returncode == 0

    calls = [json.loads(line) for line in (state / "calls.jsonl").read_text().splitlines()]
    installs = [call for call in calls if call[0][0] == "install"]
    assert len(installs) == 2
    assert all(call[1] == "1" for call in installs)
    assert all(Path(call[2]) == state / "backend" / ".venv" / "conan" for call in installs)


def test_run_repairs_missing_dependencies(launcher):
    state, run = launcher
    (state / "installed").touch()
    (state / "broken").touch()

    assert run().returncode == 0
    assert (state / "started").exists()
    calls = [json.loads(line) for line in (state / "calls.jsonl").read_text().splitlines()]
    assert [call[0][0] for call in calls] == ["show", "check", "install"]
    assert calls[-1][1] == "1"


def test_run_preserves_explicit_conan_home(launcher):
    state, run = launcher
    conan_home = state / "custom-conan"

    assert run({"CONAN_HOME": str(conan_home)}).returncode == 0
    calls = [json.loads(line) for line in (state / "calls.jsonl").read_text().splitlines()]
    assert calls[-1][2] == str(conan_home)


def test_run_configures_detected_visual_studio(launcher):
    vswhere = (
        Path(os.environ["ProgramFiles(x86)"])
        / "Microsoft Visual Studio"
        / "Installer"
        / "vswhere.exe"
    )
    if not vswhere.exists():
        pytest.skip("Visual Studio Installer is not available")
    detected = subprocess.run(
        [
            str(vswhere),
            "-latest",
            "-prerelease",
            "-products",
            "*",
            "-requires",
            "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
            "-property",
            "installationPath",
        ],
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()
    if not detected:
        pytest.skip("Visual Studio C++ Build Tools are not available")

    state, run = launcher
    config = state / "backend" / ".venv" / "conan" / "global.conf"
    config.parent.mkdir()
    config.write_text("# existing Conan configuration\n")
    assert run().returncode == 0
    assert config.read_text().splitlines() == [
        "# existing Conan configuration",
        f"tools.microsoft.msbuild:installation_path = {detected}",
    ]


def test_run_preserves_existing_conan_configuration(launcher):
    state, run = launcher
    config = state / "backend" / ".venv" / "conan" / "global.conf"
    config.parent.mkdir()
    config.write_text("tools.microsoft.msbuild:installation_path = custom\n")

    assert run().returncode == 0
    assert config.read_text() == "tools.microsoft.msbuild:installation_path = custom\n"


def test_run_does_not_require_visual_studio_for_binary_packages(launcher):
    state, run = launcher
    assert run({"ProgramFiles(x86)": str(state / "missing")}).returncode == 0
    assert (state / "started").exists()


@pytest.mark.parametrize("launcher", [False], indirect=True)
def test_run_creates_environment_on_first_start(launcher):
    state, run = launcher

    assert run().returncode == 0
    assert (state / "backend" / ".venv" / "Scripts" / "python.exe").exists()
    assert (state / "started").exists()
