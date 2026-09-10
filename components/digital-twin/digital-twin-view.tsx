"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { useTelemetryContext } from "@/lib/telemetry/telemetry-context";
import type { TelemetryFrame } from "@/lib/telemetry/schema";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

/* ═══════════════════════════════════════════════════════════════════════════
   DIGITAL TWIN — Three.js React Component
   Cinematic 3D hex-grid environment with geometric quadruped robot,
   cave wall instancing, and live sensor heatmap from ESP32 WebSocket.
   ═══════════════════════════════════════════════════════════════════════════ */

// ── Sensor thresholds for hex cell danger coloring ──────────────────────
const DANGER_HIGH = { co: 50, ch4: 5.0, pm10: 150, temp: 45 };
const DANGER_MID = { co: 25, ch4: 1.0, pm10: 75, temp: 35 };

// ── Animation constants ────────────────────────────────────────────────
const HEX_RADIUS = 0.2;
const WALK_SPEED = 0.003;
const TURN_SPEED = 0.006;
const ANIM_SPEED = 0.08;
const LIFT = 0.02;
const MAX_WALLS = 10000;

type AnimDir = "stop" | "forward" | "backward" | "left" | "right";

export default function DigitalTwinView() {
  const { frame } = useTelemetryContext();
  const containerRef = useRef<HTMLDivElement>(null);

  // Mutable refs for Three.js objects (never trigger re-render)
  const sceneRef = useRef<ReturnType<typeof createScene> | null>(null);
  const animRef = useRef<AnimDir>("stop");
  const frameRef = useRef<TelemetryFrame | null>(null);
  const rafRef = useRef<number>(0);
  const frameCounterRef = useRef(0);

  // React state for UI overlay
  const [activeAnim, setActiveAnim] = useState<AnimDir>("stop");
  const [tilePopup, setTilePopup] = useState<{
    x: number;
    y: number;
    key: string;
    data: ReturnType<typeof buildSensorSnapshot>;
  } | null>(null);

  // Keep frame ref in sync
  useEffect(() => {
    frameRef.current = frame;
  }, [frame]);

  // Sync anim ref
  useEffect(() => {
    animRef.current = activeAnim;
  }, [activeAnim]);

  // ── Initialize Three.js scene ──────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = createScene(container);
    sceneRef.current = scene;

    // Click handler for hex inspection
    const handleClick = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const mx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const my = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      scene.raycaster.setFromCamera(new THREE.Vector2(mx, my), scene.camera);
      const hexMeshes = Array.from(scene.coloredHexes.values());
      const intersects = scene.raycaster.intersectObjects(hexMeshes);

      if (intersects.length > 0) {
        const hit = intersects[0].object;
        const ud = hit.userData as { cellKey: string; sensorData: ReturnType<typeof buildSensorSnapshot> };
        setTilePopup({
          x: e.clientX - rect.left + 15,
          y: e.clientY - rect.top + 15,
          key: ud.cellKey,
          data: ud.sensorData,
        });
      } else {
        setTilePopup(null);
      }
    };
    container.addEventListener("click", handleClick);

    // Resize handler
    const handleResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      scene.camera.aspect = w / h;
      scene.camera.updateProjectionMatrix();
      scene.renderer.setSize(w, h);
    };
    const ro = new ResizeObserver(handleResize);
    ro.observe(container);

    // ── Animation loop ──────────────────────────────────────────────
    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      const dir = animRef.current;
      const { robotGroup, camera, controls, renderer, hexGrid } = scene;

      // Robot kinematics (simulation mode)
      if (dir !== "stop") {
        const oldX = robotGroup.position.x;
        const oldZ = robotGroup.position.z;

        if (dir === "forward") robotGroup.translateZ(WALK_SPEED);
        if (dir === "backward") robotGroup.translateZ(-WALK_SPEED);
        if (dir === "left") robotGroup.rotation.y += TURN_SPEED;
        if (dir === "right") robotGroup.rotation.y -= TURN_SPEED;

        // Camera follows robot
        camera.position.x += robotGroup.position.x - oldX;
        camera.position.z += robotGroup.position.z - oldZ;

        // Animate leg bobbing
        animateLegs(scene, dir);

        // Color hex cells every 15th frame from live sensor data
        frameCounterRef.current++;
        if (frameCounterRef.current % 15 === 0) {
          const f = frameRef.current;
          if (f) {
            const sensorData = buildSensorSnapshot(f);
            const dangerLevel = computeDangerLevel(sensorData);
            const color =
              dangerLevel === 2
                ? 0xef4444
                : dangerLevel === 1
                ? 0xffea00
                : 0xc7ea47;
            const opacity = dangerLevel > 0 ? 0.9 : 0.4;
            colorHexCell(
              scene,
              robotGroup.position.x,
              robotGroup.position.z,
              color,
              opacity,
              sensorData
            );

            // Plot walls from lidar
            const lidarL = f.lidar?.leftM ?? 0;
            const lidarR = f.lidar?.rightM ?? 0;
            if (lidarL > 0 && lidarL < 2.0)
              plotWall(scene, lidarL, Math.PI / 2, robotGroup);
            if (lidarR > 0 && lidarR < 2.0)
              plotWall(scene, lidarR, -Math.PI / 2, robotGroup);
          }
        }
      }

      // Live pose from ESP32 (if available)
      const f = frameRef.current;
      if (f?.pose) {
        const oldX = robotGroup.position.x;
        const oldZ = robotGroup.position.z;
        robotGroup.position.set(f.pose.x, 0, f.pose.z);
        robotGroup.rotation.y = f.pose.yaw;
        camera.position.x += robotGroup.position.x - oldX;
        camera.position.z += robotGroup.position.z - oldZ;
      }

      // Snap hex grid to robot
      const snapX =
        Math.round(robotGroup.position.x / (HEX_RADIUS * Math.sqrt(3))) *
        (HEX_RADIUS * Math.sqrt(3));
      const snapZ =
        Math.round(robotGroup.position.z / (HEX_RADIUS * 3)) *
        (HEX_RADIUS * 3);
      hexGrid.position.set(snapX, 0, snapZ);

      controls.target.copy(robotGroup.position);
      controls.update();
      renderer.render(scene.scene, camera);
    };
    animate();

    // ── Cleanup ──────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(rafRef.current);
      container.removeEventListener("click", handleClick);
      ro.disconnect();
      scene.renderer.dispose();
      container.removeChild(scene.renderer.domElement);
      sceneRef.current = null;
    };
  }, []);

  // ── Control handlers ──────────────────────────────────────────────
  const play = useCallback((dir: AnimDir) => setActiveAnim(dir), []);

  const dropMarker = useCallback(() => {
    const s = sceneRef.current;
    if (!s) return;
    const markerMat = new THREE.MeshStandardMaterial({
      color: 0xffd43b,
      emissive: 0xd9a514,
      emissiveIntensity: 0.6,
      roughness: 0.15,
    });
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.08, 0.15, 16),
      markerMat
    );
    cone.rotation.x = Math.PI;
    cone.position.y = 0.075;
    cone.castShadow = true;
    const cyl = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.15),
      markerMat
    );
    cyl.position.y = 0.2;
    cyl.castShadow = true;
    const group = new THREE.Group();
    group.add(cone, cyl);
    group.position.set(
      s.robotGroup.position.x,
      0.15,
      s.robotGroup.position.z
    );
    s.envGroup.add(group);
  }, []);

  // ── Sensor readout from context ───────────────────────────────────
  const co = frame?.gas?.coPpm ?? 0;
  const ch4 = frame?.gas?.ch4Ppm ?? 0;
  const pm1 = frame?.air?.pm1 ?? 0;
  const pm25 = frame?.air?.pm25 ?? 0;
  const pm10 = frame?.air?.pm10 ?? 0;
  const temp = frame?.thermal?.ambientC ?? 0;
  const hum = frame?.thermal?.humidityPct ?? 0;
  const lidarL = frame?.lidar?.leftM ?? 0;
  const lidarR = frame?.lidar?.rightM ?? 0;

  return (
    <div className="relative w-full overflow-hidden border border-[var(--color-rule)] bg-[#050B14]" style={{ minHeight: "520px", height: "calc(100vh - 180px)" }}>
      {/* Three.js canvas mount */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* ── Glassmorphism Control Panel ─────────────────────────── */}
      <div className="absolute top-3 left-3 z-20 flex flex-col gap-1.5 rounded-xl border border-white/[0.08] bg-[rgba(15,23,42,0.75)] p-3 shadow-lg backdrop-blur-xl"
        style={{ width: "200px", maxHeight: "calc(100% - 24px)", overflowY: "auto" }}
      >
        <p className="m-0 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8] border-b border-white/5 pb-1">Kinematics</p>
        <button type="button" className="twin-btn" onClick={() => play("forward")}>Walk Forward</button>
        <button type="button" className="twin-btn" onClick={() => play("backward")}>Walk Backward</button>
        <div className="grid grid-cols-2 gap-1">
          <button type="button" className="twin-btn" onClick={() => play("left")}>Turn Left</button>
          <button type="button" className="twin-btn" onClick={() => play("right")}>Turn Right</button>
        </div>
        <button type="button" className="twin-btn" style={{ background: "rgba(239,68,68,0.1)", color: "#FCA5A5", borderColor: "rgba(239,68,68,0.2)" }} onClick={() => play("stop")}>
          Emergency Stop
        </button>
        <button type="button" className="twin-btn" style={{ background: "rgba(250,204,21,0.1)", color: "#FDE047", borderColor: "rgba(250,204,21,0.2)" }} onClick={dropMarker}>
          📍 Drop Marker
        </button>

        <p className="m-0 mt-1 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8] border-b border-white/5 pb-1">Live Telemetry</p>
        <div className="rounded-lg border border-white/5 bg-black/25 p-2 font-mono text-[11px] text-[#CBD5E1] leading-relaxed">
          <TelRow label="ToF" value={`L:${lidarL.toFixed(1)} R:${lidarR.toFixed(1)}`} />
          <div className="my-1 h-px bg-white/5" />
          <TelRow label="CO" value={`${co.toFixed(1)} ppm`} warn={co > 25} />
          <TelRow label="CH4" value={`${ch4.toFixed(2)} ppm`} warn={ch4 > 1} />
          <TelRow label="PM1" value={`${pm1.toFixed(1)}`} />
          <TelRow label="PM2.5" value={`${pm25.toFixed(1)}`} warn={pm25 > 35} />
          <TelRow label="PM10" value={`${pm10.toFixed(0)}`} warn={pm10 > 75} />
          <TelRow label="TEMP" value={`${temp.toFixed(1)} °C`} warn={temp > 35} />
          <TelRow label="HUM" value={`${hum.toFixed(0)} %`} />
        </div>
      </div>

      {/* ── Active animation label ──────────────────────────────── */}
      {activeAnim !== "stop" && (
        <div className="absolute top-3 right-3 z-20 rounded-md border border-[var(--color-accent)]/30 bg-[rgba(15,23,42,0.7)] px-3 py-1 backdrop-blur-lg">
          <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[var(--color-accent)] animate-pulse">
            {activeAnim}
          </span>
        </div>
      )}

      {/* ── Click-to-inspect tile popup ─────────────────────────── */}
      {tilePopup && (
        <div
          className="absolute z-30 min-w-[220px] rounded-xl border border-white/[0.12] bg-[rgba(15,23,42,0.85)] p-3 shadow-2xl backdrop-blur-2xl"
          style={{ left: tilePopup.x, top: tilePopup.y }}
        >
          <div className="mb-2 flex items-center justify-between border-b border-white/10 pb-2">
            <span className="text-[13px] font-semibold text-[#FDE047]">
              Tile [{tilePopup.key}]
            </span>
            <span className="cursor-pointer text-[#94A3B8] hover:text-white" onClick={() => setTilePopup(null)}>
              ×
            </span>
          </div>
          <table className="w-full text-[12px] font-mono">
            <tbody>
              <PopupRow label="CO" value={`${tilePopup.data.co.toFixed(1)} ppm`} warn={tilePopup.data.co > 25} />
              <PopupRow label="CH4" value={`${tilePopup.data.ch4.toFixed(2)} ppm`} warn={tilePopup.data.ch4 > 1} />
              <PopupRow label="PM 1.0" value={`${tilePopup.data.pm1.toFixed(1)} µg/m³`} />
              <PopupRow label="PM 2.5" value={`${tilePopup.data.pm25.toFixed(1)} µg/m³`} />
              <PopupRow label="PM 10" value={`${tilePopup.data.pm10.toFixed(1)} µg/m³`} warn={tilePopup.data.pm10 > 75} />
              <PopupRow label="Temp" value={`${tilePopup.data.temp.toFixed(1)} °C`} warn={tilePopup.data.temp > 35} />
              <PopupRow label="Humidity" value={`${tilePopup.data.hum.toFixed(0)} %`} />
            </tbody>
          </table>
        </div>
      )}

      <style jsx>{`
        .twin-btn {
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.08);
          padding: 7px 10px;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          border-radius: 6px;
          color: #F8FAFC;
          transition: all 0.2s ease;
          letter-spacing: 0.3px;
        }
        .twin-btn:hover {
          background: rgba(255,255,255,0.12);
          border-color: rgba(255,255,255,0.2);
        }
        .twin-btn:active {
          transform: scale(0.97);
        }
      `}</style>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   HELPER COMPONENTS
   ═══════════════════════════════════════════════════════════════════════════ */

function TelRow({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex justify-between" style={{ color: warn ? "#FCA5A5" : undefined }}>
      <span className="text-[#94A3B8]" style={{ fontFamily: "inherit" }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function PopupRow({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <tr style={{ color: warn ? "#FCA5A5" : "#E2E8F0" }}>
      <td className="py-0.5 text-[#94A3B8]">{label}</td>
      <td className="py-0.5 text-right">{value}</td>
    </tr>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   THREE.JS SCENE FACTORY
   Creates the entire 3D scene and returns refs to mutable objects.
   ═══════════════════════════════════════════════════════════════════════════ */

function createScene(container: HTMLElement) {
  const w = container.clientWidth;
  const h = container.clientHeight;

  // ── Scene ──
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050b14);
  scene.fog = new THREE.FogExp2(0x050b14, 0.08);

  // ── Camera ──
  const camera = new THREE.PerspectiveCamera(45, w / h, 0.01, 100);
  camera.position.set(1.5, 1.2, 2.5);

  // ── Renderer ──
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  container.appendChild(renderer.domElement);

  // ── Controls ──
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  // ── Lighting ──
  scene.add(new THREE.AmbientLight(0x1b2a3a, 1.2));

  const mainLight = new THREE.DirectionalLight(0xd7dfe9, 2.0);
  mainLight.position.set(4, 7, 3);
  mainLight.castShadow = true;
  mainLight.shadow.mapSize.set(2048, 2048);
  mainLight.shadow.camera.near = 0.1;
  mainLight.shadow.camera.far = 25;
  mainLight.shadow.bias = -0.0005;
  scene.add(mainLight);

  const rimLight = new THREE.DirectionalLight(0x118bf7, 0.8);
  rimLight.position.set(-4, 2, -4);
  scene.add(rimLight);

  // ── Ground ──
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x050b14,
    roughness: 0.95,
    metalness: 0.05,
  });
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    groundMat
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  ground.receiveShadow = true;
  scene.add(ground);

  // ── Hex Grid ──
  const hexGrid = new THREE.Group();
  const hexGeom = new THREE.CircleGeometry(HEX_RADIUS, 6);
  const hexEdges = new THREE.EdgesGeometry(hexGeom);
  const hexLineMat = new THREE.LineBasicMaterial({
    color: 0x1b344a,
    transparent: true,
    opacity: 0.6,
  });
  for (let q = -25; q <= 25; q++) {
    for (let r = -25; r <= 25; r++) {
      const hex = new THREE.LineSegments(hexEdges, hexLineMat);
      hex.position.set(
        HEX_RADIUS * Math.sqrt(3) * (q + r / 2),
        0,
        HEX_RADIUS * (3 / 2) * r
      );
      hex.rotation.x = -Math.PI / 2;
      hex.rotation.z = Math.PI / 6;
      hexGrid.add(hex);
    }
  }
  scene.add(hexGrid);

  // ── Cave Walls (Instanced) ──
  const envGroup = new THREE.Group();
  scene.add(envGroup);
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x4c546f,
    roughness: 0.7,
    metalness: 0.2,
  });
  const wallInstanced = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.05, 0.2, 0.05),
    wallMat,
    MAX_WALLS
  );
  wallInstanced.castShadow = true;
  wallInstanced.receiveShadow = true;
  wallInstanced.count = 0;
  scene.add(wallInstanced);
  const dummyObj = new THREE.Object3D();

  // ── Geometric Quadruped Robot ──
  const robotGroup = new THREE.Group();
  const robotBody = buildGeometricRobot();
  robotGroup.add(robotBody);
  scene.add(robotGroup);

  // ── State tracking ──
  const coloredHexes = new Map<string, THREE.Mesh>();
  const raycaster = new THREE.Raycaster();
  const legPhase = { index: 0, joints: { FL: 0, FR: 0, BL: 0, BR: 0 } };

  return {
    scene,
    camera,
    renderer,
    controls,
    robotGroup,
    robotBody,
    hexGrid,
    envGroup,
    wallInstanced,
    dummyObj,
    coloredHexes,
    raycaster,
    legPhase,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   GEOMETRIC QUADRUPED ROBOT
   Stylized robotic dog built from Three.js primitives.
   ═══════════════════════════════════════════════════════════════════════════ */

function buildGeometricRobot(): THREE.Group {
  const robot = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0xf1f5f9,
    roughness: 0.25,
    metalness: 0.15,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: 0x3b82f6,
    roughness: 0.3,
    metalness: 0.4,
    emissive: 0x1d4ed8,
    emissiveIntensity: 0.3,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.4,
    metalness: 0.6,
  });

  // Body core
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.06, 0.12),
    bodyMat
  );
  body.position.y = 0.14;
  body.castShadow = true;
  robot.add(body);

  // Sensor dome (top)
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.04, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    accentMat
  );
  dome.position.set(0.06, 0.17, 0);
  dome.castShadow = true;
  robot.add(dome);

  // Head
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.04, 0.08),
    bodyMat
  );
  head.position.set(0.14, 0.15, 0);
  head.castShadow = true;
  robot.add(head);

  // Eye sensors (two small emissive cubes)
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0x22d3ee,
    emissive: 0x22d3ee,
    emissiveIntensity: 1.5,
  });
  const eyeL = new THREE.Mesh(
    new THREE.BoxGeometry(0.008, 0.012, 0.012),
    eyeMat
  );
  eyeL.position.set(0.17, 0.155, 0.02);
  robot.add(eyeL);
  const eyeR = eyeL.clone();
  eyeR.position.z = -0.02;
  robot.add(eyeR);

  // Legs (4 legs, each has upper + lower segment)
  const legPositions = [
    { x: 0.08, z: 0.07, name: "FL" },
    { x: 0.08, z: -0.07, name: "FR" },
    { x: -0.08, z: 0.07, name: "BL" },
    { x: -0.08, z: -0.07, name: "BR" },
  ];

  for (const lp of legPositions) {
    // Upper leg
    const upper = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.06, 0.02),
      darkMat
    );
    upper.position.set(lp.x, 0.1, lp.z);
    upper.castShadow = true;
    upper.name = `leg_upper_${lp.name}`;
    robot.add(upper);

    // Lower leg
    const lower = new THREE.Mesh(
      new THREE.BoxGeometry(0.015, 0.06, 0.015),
      bodyMat
    );
    lower.position.set(lp.x, 0.04, lp.z);
    lower.castShadow = true;
    lower.name = `leg_lower_${lp.name}`;
    robot.add(lower);

    // Foot pad
    const foot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.015, 0.008, 8),
      accentMat
    );
    foot.position.set(lp.x, 0.01, lp.z);
    foot.name = `foot_${lp.name}`;
    robot.add(foot);
  }

  // Tail antenna
  const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.003, 0.003, 0.08, 6),
    darkMat
  );
  antenna.position.set(-0.12, 0.18, 0);
  antenna.rotation.z = -0.3;
  robot.add(antenna);

  const antennaTip = new THREE.Mesh(
    new THREE.SphereGeometry(0.008, 8, 8),
    eyeMat
  );
  antennaTip.position.set(-0.14, 0.215, 0);
  robot.add(antennaTip);

  return robot;
}

/* ═══════════════════════════════════════════════════════════════════════════
   ANIMATION & SENSOR HELPERS
   ═══════════════════════════════════════════════════════════════════════════ */

function animateLegs(
  scene: ReturnType<typeof createScene>,
  dir: AnimDir
) {
  if (dir === "stop") return;
  const { robotBody, legPhase } = scene;

  legPhase.index++;
  const t = legPhase.index * ANIM_SPEED;
  const amplitude = LIFT;

  // Simple sinusoidal walk cycle (diagonal pairs)
  const liftA = Math.abs(Math.sin(t)) * amplitude;
  const liftB = Math.abs(Math.cos(t)) * amplitude;

  const legs = ["FL", "FR", "BL", "BR"];
  for (const name of legs) {
    const upper = robotBody.getObjectByName(`leg_upper_${name}`);
    const lower = robotBody.getObjectByName(`leg_lower_${name}`);
    const foot = robotBody.getObjectByName(`foot_${name}`);
    if (!upper || !lower || !foot) continue;

    const lift = name === "FL" || name === "BR" ? liftA : liftB;
    const baseUpper = 0.1;
    const baseLower = 0.04;
    const baseFoot = 0.01;

    upper.position.y = baseUpper + lift;
    lower.position.y = baseLower + lift * 0.5;
    foot.position.y = baseFoot + lift * 0.3;
  }
}

function buildSensorSnapshot(f: TelemetryFrame) {
  return {
    co: f.gas?.coPpm ?? 0,
    ch4: f.gas?.ch4Ppm ?? 0,
    pm1: f.air?.pm1 ?? 0,
    pm25: f.air?.pm25 ?? 0,
    pm10: f.air?.pm10 ?? 0,
    temp: f.thermal?.ambientC ?? 0,
    hum: f.thermal?.humidityPct ?? 0,
  };
}

function computeDangerLevel(s: ReturnType<typeof buildSensorSnapshot>): number {
  if (
    s.co > DANGER_HIGH.co ||
    s.ch4 > DANGER_HIGH.ch4 ||
    s.pm10 > DANGER_HIGH.pm10 ||
    s.temp > DANGER_HIGH.temp
  )
    return 2;
  if (
    s.co > DANGER_MID.co ||
    s.ch4 > DANGER_MID.ch4 ||
    s.pm10 > DANGER_MID.pm10 ||
    s.temp > DANGER_MID.temp
  )
    return 1;
  return 0;
}

function colorHexCell(
  scene: ReturnType<typeof createScene>,
  px: number,
  pz: number,
  colorHex: number,
  opacity: number,
  sensorData: ReturnType<typeof buildSensorSnapshot>
) {
  const r = Math.round(pz / (HEX_RADIUS * (3 / 2)));
  const q = Math.round(px / (HEX_RADIUS * Math.sqrt(3)) - r / 2);
  const cellKey = `${q},${r}`;

  if (scene.coloredHexes.has(cellKey)) return;

  const x = HEX_RADIUS * Math.sqrt(3) * (q + r / 2);
  const z = HEX_RADIUS * (3 / 2) * r;

  const hexFillMat = new THREE.MeshStandardMaterial({
    color: colorHex,
    emissive: colorHex,
    emissiveIntensity: 0.9,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    roughness: 0.4,
  });

  const hexMesh = new THREE.Mesh(
    new THREE.CircleGeometry(HEX_RADIUS * 0.95, 6),
    hexFillMat
  );
  hexMesh.rotation.x = -Math.PI / 2;
  hexMesh.rotation.z = Math.PI / 6;
  hexMesh.position.set(x, 0.002, z);
  hexMesh.receiveShadow = true;
  hexMesh.userData = { cellKey, sensorData };

  scene.envGroup.add(hexMesh);
  scene.coloredHexes.set(cellKey, hexMesh);
}

function plotWall(
  scene: ReturnType<typeof createScene>,
  distance: number,
  angleOffset: number,
  robotGroup: THREE.Group
) {
  if (scene.wallInstanced.count >= MAX_WALLS) return;
  const absAngle = robotGroup.rotation.y + angleOffset;
  scene.dummyObj.position.set(
    robotGroup.position.x + Math.sin(absAngle) * distance,
    0.1,
    robotGroup.position.z + Math.cos(absAngle) * distance
  );
  scene.dummyObj.rotation.y = robotGroup.rotation.y;
  scene.dummyObj.updateMatrix();
  scene.wallInstanced.setMatrixAt(
    scene.wallInstanced.count,
    scene.dummyObj.matrix
  );
  scene.wallInstanced.instanceMatrix.needsUpdate = true;
  scene.wallInstanced.count++;
}
