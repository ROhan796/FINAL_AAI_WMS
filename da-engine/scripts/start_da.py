"""Launch DA Engine with logging to file."""
import subprocess, sys, os, time

log_path = os.path.join(os.path.dirname(__file__), "..", "da_engine.log")
log_path = os.path.abspath(log_path)

print(f"Starting DA Engine, logs -> {log_path}")

proc = subprocess.Popen(
    [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"],
    cwd=os.path.join(os.path.dirname(__file__), ".."),
    stdout=open(log_path, "w"),
    stderr=subprocess.STDOUT,
    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
)

print(f"DA Engine started (PID={proc.pid})")
print("Waiting 15s for startup + seed...")
time.sleep(15)

if proc.poll() is not None:
    print(f"Process exited with code {proc.returncode}")
    with open(log_path) as f:
        print(f.read())
else:
    print("Process is running.")
    with open(log_path) as f:
        content = f.read()
        print("=== Log output ===")
        print(content[-3000:] if len(content) > 3000 else content)
