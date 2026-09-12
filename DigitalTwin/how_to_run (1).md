1. One-Time Setup (You only do this once)
Since Windows blocks scripts by default, you just need to bypass that security and create the isolated environment.

Open your terminal inside your robot_twin_final folder.

Allow scripts to run:
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
(Type Y and hit Enter if it asks to confirm).

Create the virtual environment:
py -m venv venv



2. Running the Server (Do this every time you code)
Whenever you sit down to work on the project, this is your standard startup routine.

Open your terminal inside robot_twin_final.

Activate the virtual environment:
.\venv\Scripts\activate
(You will know it worked when you see (venv) at the start of your command line).

Install your dependencies (you only really need to do this the very first time, but it doesn't hurt to run it if you forget):
pip install websockets

Launch the Python server:
python server.py



3. Viewing the Dashboard
Once the server is running, the terminal will confirm that the HTTP server (serving `public1`) and WebSocket server are active.

Open Chrome, Edge, or any web browser.

Type http://localhost:8000 into the address bar and hit Enter.

Your 3D environment will load.

4. Locomotion Modes & Controls
- **Walk Mode (🚶)**:
  - Default mode. The robot's legs perform the full walking gait (lifting, sliding, and pivoting joints) to traverse the environment.
  - Manual buttons: Walk Forward, Walk Backward, Turn Left, Turn Right, Emergency Stop.
- **Drive Mode (🚗)**:
  - The legs lock into flat driving stance and all 4 wheels (`FrontRwheel`, `BackRwheel`, `FrontLwheel`, `BackLwheel`) rotate according to differential drive kinematics to roll the rover across the cave floor.
  - Manual buttons: Drive Forward, Drive Backward, Turn Left, Turn Right, Emergency Stop.

5. Data Modes & Logging
- **To test manually (Dummy Data)**: Keep the "Live ESP32 Data" switch toggled OFF. Click Walk/Drive buttons to navigate, generate real-time dummy sensor streams, plot ToF wall obstacles, and drop Rescue Markers. Dummy simulation data is processed locally for the dashboard visualization and is **never written to `logs/telemetry.jsonl`**.
- **To test with the robot (Real Telemetry)**: Toggle "Live ESP32 Data" ON. The UI locks manual controls and streams real-time pose and sensor data from ws://localhost:8765. Movement in space automatically drives wheel rotation in Drive Mode or steps the walking gait in Walk Mode. **Only real ESP32 hardware telemetry is recorded into `logs/telemetry.jsonl`**.