#!/usr/bin/env python3
"""VaultFS Turnkey Cross-Platform Launcher.

Boots both the FastAPI backend and Vite React frontend, verifies dependencies,
and automatically opens the visual workbench in your default web browser.

Works on Windows, macOS, and Linux without external orchestration tools.
"""

import os
import sys
import time
import subprocess
import webbrowser
import signal

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(BASE_DIR, "backend")
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")

BACKEND_HOST = "127.0.0.1"
BACKEND_PORT = 8000
FRONTEND_PORT = 5173


def print_banner():
    print("=" * 70)
    print("  VAULTFS: Industry-Grade Virtual File System & Telemetry Workbench")
    print("  Binary Persistence (disk.img) • 16x16 Matrix • Real-Time WebSockets")
    print("=" * 70)


def check_python_environment():
    print("[1/4] Checking Python environment...")
    required = ["fastapi", "uvicorn", "pydantic", "websockets"]
    missing = []
    for pkg in required:
        try:
            __import__(pkg)
        except ImportError:
            missing.append(pkg)

    if missing:
        print(f"[!] Missing required Python packages: {missing}")
        print("    Installing via backend/requirements.txt...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", os.path.join(BACKEND_DIR, "requirements.txt")])
    print("    Python backend environment ready.")


def check_node_environment():
    print("[2/4] Checking Node.js and npm environment...")
    try:
        subprocess.run(["node", "--version"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"
        subprocess.run([npm_cmd, "--version"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
    except Exception:
        print("[!] Error: Node.js and npm must be installed and on PATH.")
        sys.exit(1)

    node_modules = os.path.join(FRONTEND_DIR, "node_modules")
    if not os.path.exists(node_modules):
        print("    Installing frontend npm packages (first-time boot)...")
        npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"
        subprocess.check_call([npm_cmd, "install"], cwd=FRONTEND_DIR)
    print("    Frontend environment ready.")


def main():
    print_banner()
    check_python_environment()
    check_node_environment()

    print("[3/4] Starting FastAPI REST & WebSocket Backend...")
    env = os.environ.copy()
    env["PYTHONPATH"] = BACKEND_DIR

    backend_proc = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "main:app",
            "--host",
            BACKEND_HOST,
            "--port",
            str(BACKEND_PORT),
        ],
        cwd=BACKEND_DIR,
        env=env,
    )

    time.sleep(1.5)
    if backend_proc.poll() is not None:
        print("[!] Backend failed to start. Please check logs.")
        sys.exit(1)
    print(f"    Backend running at http://{BACKEND_HOST}:{BACKEND_PORT}")

    print("[4/4] Starting Vite React Visual Workbench...")
    npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"
    frontend_proc = subprocess.Popen(
        [npm_cmd, "run", "dev", "--", "--port", str(FRONTEND_PORT)],
        cwd=FRONTEND_DIR,
    )

    workbench_url = f"http://localhost:{FRONTEND_PORT}"
    print("\n" + "=" * 70)
    print(f"  VAULTFS WORKBENCH ACTIVE: {workbench_url}")
    print("  Press Ctrl+C at any time to shut down both servers cleanly.")
    print("=" * 70 + "\n")

    time.sleep(2)
    try:
        webbrowser.open(workbench_url)
    except Exception:
        pass

    def cleanup(signum=None, frame=None):
        print("\n[Shutting down VaultFS...]")
        try:
            frontend_proc.terminate()
            backend_proc.terminate()
            if sys.platform == "win32":
                subprocess.run(["taskkill", "/F", "/T", "/PID", str(frontend_proc.pid)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                subprocess.run(["taskkill", "/F", "/T", "/PID", str(backend_proc.pid)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception:
            pass
        print("VaultFS terminated safely.")
        sys.exit(0)

    signal.signal(signal.SIGINT, cleanup)
    signal.signal(signal.SIGTERM, cleanup)

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        cleanup()


if __name__ == "__main__":
    main()

