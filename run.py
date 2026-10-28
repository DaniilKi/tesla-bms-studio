"""Cross-platform first-run launcher; never installs drivers or touches CAN."""
import hashlib
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
import urllib.request
import venv
import webbrowser


def main():
    if sys.version_info < (3, 10):
        raise SystemExit("Python 3.10+ required / Нужен Python 3.10+")
    root = Path(__file__).resolve().parent
    environment = root / ".venv"
    interpreter = environment / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    if not interpreter.exists():
        print("Preparing local Python environment / Подготовка окружения…", flush=True)
        venv.EnvBuilder(with_pip=True).create(environment)
    digest = hashlib.sha256((root / "requirements.txt").read_bytes()).hexdigest()
    receipt = environment / "studio-requirements.sha256"
    if not receipt.exists() or receipt.read_text() != digest:
        subprocess.run([str(interpreter), "-m", "pip", "install", "-r", str(root / "requirements.txt")], check=True, cwd=root)
        receipt.write_text(digest)
    port = 8080
    with socket.socket() as probe:
        try:
            probe.bind(("127.0.0.1", port))
        except OSError:
            raise SystemExit("Port 8080 is busy. Stop the existing app or use python -m studio.app --port 8081.")
    url = f"http://127.0.0.1:{port}/"
    process = subprocess.Popen([str(interpreter), "-m", "studio.app", "--port", str(port)], cwd=root)
    try:
        for _ in range(100):
            if process.poll() is not None:
                raise SystemExit(process.returncode)
            try:
                with urllib.request.urlopen(url + "api/state", timeout=0.3) as response:
                    if response.status == 200:
                        print("Local app / Локальное приложение: " + url, flush=True)
                        webbrowser.open(url)
                        break
            except OSError:
                time.sleep(0.1)
        process.wait()
    except KeyboardInterrupt:
        print("Stopping / Остановка…")
    finally:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()


if __name__ == "__main__":
    main()
