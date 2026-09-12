import asyncio
import websockets
import os
import http.server
import socketserver
import threading
import json

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_DIR = os.path.join(BASE_DIR, "logs")
os.makedirs(LOG_DIR, exist_ok=True)
LOG_FILE = os.path.join(LOG_DIR, "telemetry.jsonl")
connected_clients = set()

async def ws_handler(websocket):
    connected_clients.add(websocket)
    
    # Identify whether client is a web browser or ESP32 hardware
    origin = None
    if hasattr(websocket, "request") and websocket.request:
        origin = websocket.request.headers.get("Origin")
    elif hasattr(websocket, "request_headers") and websocket.request_headers:
        origin = websocket.request_headers.get("Origin")
    elif hasattr(websocket, "origin"):
        origin = websocket.origin
    
    is_browser = bool(origin)
    client_label = f"Browser ({origin})" if is_browser else "ESP32/Hardware"
    print(f"Client connected: {client_label}. Total clients: {len(connected_clients)}")
    
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                
                # Filter out dummy/simulation data so ONLY real ESP32 data is logged
                is_dummy = (
                    is_browser or 
                    data.get("dummy", False) or 
                    data.get("is_dummy", False) or 
                    data.get("source") == "dummy"
                )
                
                if not is_dummy:
                    # Append ONLY real data to permanent log file
                    with open(LOG_FILE, "a") as f:
                        f.write(json.dumps(data) + "\n")
                
                # Broadcast to other connected clients (e.g. browser dashboard)
                for client in connected_clients:
                    if client != websocket:
                        await client.send(message)
                        
            except json.JSONDecodeError:
                print("Received invalid JSON")
                
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        connected_clients.remove(websocket)
        print(f"Client disconnected: {client_label}.")

class NoCacheHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True

def start_http_server():
    public1_dir = os.path.join(BASE_DIR, "public1")
    os.chdir(public1_dir)
    handler = NoCacheHTTPRequestHandler
    with ThreadedHTTPServer(("", 8000), handler) as httpd:
        print("HTTP Dashboard running at http://localhost:8000")
        httpd.serve_forever()

if __name__ == "__main__":
    threading.Thread(target=start_http_server, daemon=True).start()
    
    async def main():
        async with websockets.serve(ws_handler, "0.0.0.0", 8765):
            print("WebSocket Server listening for ESP32 on ws://0.0.0.0:8765")
            await asyncio.Future()
            
    asyncio.run(main())