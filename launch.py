import os
import sys
import subprocess
import time
import webbrowser

# Fix: Only reconfigure stdout/stderr if they are attached (non-None)
if sys.stdout is not None:
    sys.stdout.reconfigure(line_buffering=True)
if sys.stderr is not None:
    sys.stderr.reconfigure(line_buffering=True)

from app import app

def main():
    os.environ["OMP_NUM_THREADS"] = "1"
    os.environ["MKL_NUM_THREADS"] = "1"
    
    url = "http://127.0.0.1:5000"

    # Open UI in Edge Application window mode
    try:
        edge_path = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
        if os.path.exists(edge_path):
            subprocess.Popen([edge_path, f"--app={url}"])
        else:
            webbrowser.open(url)
    except Exception:
        webbrowser.open(url)

    # Start Flask Server
    app.run(host='127.0.0.1', port=5000, debug=False)

if __name__ == '__main__':
    main()