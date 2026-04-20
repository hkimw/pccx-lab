import os
import signal
import subprocess
import time
from pathlib import Path

import pytest
from selenium import webdriver

UI_ROOT = Path(__file__).resolve().parents[1]
APP_BIN = UI_ROOT / "src-tauri" / "target" / "debug" / "srcui"


@pytest.fixture(scope="session")
def vite_dev():
    proc = subprocess.Popen(
        ["npm", "run", "dev"],
        cwd=str(UI_ROOT),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        preexec_fn=os.setsid,
    )
    deadline = time.time() + 60
    while time.time() < deadline:
        line = proc.stdout.readline()
        if not line:
            break
        if b"localhost:1420" in line:
            break
    else:
        os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
        pytest.fail("Vite did not reach ready state within 60s")

    yield proc

    os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        os.killpg(os.getpgid(proc.pid), signal.SIGKILL)


@pytest.fixture(scope="session")
def tauri_driver(vite_dev):
    if not APP_BIN.exists():
        pytest.fail(
            f"App binary not found: {APP_BIN}. "
            "Run `npm run tauri dev` once to produce the debug binary."
        )
    proc = subprocess.Popen(
        ["tauri-driver", "--native-driver", "/usr/bin/WebKitWebDriver"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    time.sleep(1.5)
    if proc.poll() is not None:
        err = proc.stderr.read().decode(errors="replace")
        pytest.fail(f"tauri-driver exited early:\n{err}")

    yield proc

    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()


@pytest.fixture
def driver(tauri_driver):
    options = webdriver.ChromeOptions()
    options.set_capability("browserName", "wry")
    options.set_capability("tauri:options", {"application": str(APP_BIN)})
    drv = webdriver.Remote(
        command_executor="http://127.0.0.1:4444",
        options=options,
    )
    drv.implicitly_wait(5)
    yield drv
    drv.quit()
