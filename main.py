import time
import threading
import webbrowser
from app import app

def open_browser():
    time.sleep(1.5)  # Give Flask a moment to start
    webbrowser.open('http://127.0.0.1:5000')

if __name__ == '__main__':
    # Launch browser in a background thread
    threading.Thread(target=open_browser, daemon=True).start()
    
    # Run Flask server
    app.run(host='127.0.0.1', port=5000, debug=False)