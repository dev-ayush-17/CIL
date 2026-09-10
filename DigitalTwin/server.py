import asyncio
import websockets
import os
import http.server
import socketserver
import threading
import json

os.makedirs("logs", exist_ok=True)
LOG_FILE = "logs/telemetry.jsonl"
connected_clients = set()

async def ws_handler(websocket):
    connected_clients.add(websocket)
    print(f"Client connected. Total clients: {len(connected_clients)}")
    try:
        async for message in websocket:
            # 1. Ensure the ESP32 data is valid JSON
            try:
                data = json.loads(message)
                
                # 2. Append to permanent log file
                with open(LOG_FILE, "a") as f:
                    f.write(json.dumps(data) + "\n")
                
                # 3. Broadcast to all other connected clients (like the browser)
                for client in connected_clients:
                    if client != websocket:
                        await client.send(message)
                        
            except json.JSONDecodeError:
                print("Received invalid JSON from ESP32")
                
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        connected_clients.remove(websocket)
        print("Client disconnected.")

def start_http_server():
    os.chdir("public") # Make sure your index.html and STLs are in the 'public' folder
    handler = http.server.SimpleHTTPRequestHandler
    with socketserver.TCPServer(("", 8000), handler) as httpd:
        print("HTTP Dashboard running at http://localhost:8000")
        httpd.serve_forever()

if __name__ == "__main__":
    threading.Thread(target=start_http_server, daemon=True).start()
    
    async def main():
        async with websockets.serve(ws_handler, "0.0.0.0", 8765):
            print("WebSocket Server listening for ESP32 on ws://0.0.0.0:8765")
            await asyncio.Future()
            
    asyncio.run(main())