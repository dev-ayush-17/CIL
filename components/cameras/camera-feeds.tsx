"use client";

import { useEffect, useRef, useState } from "react";
import { Bezel } from "@/components/ui/bezel";
import { useTelemetryContext } from "@/lib/telemetry/telemetry-context";
import type { CameraMeta } from "@/lib/telemetry/schema";

export function CameraFeeds() {
  const { frame } = useTelemetryContext();
  const vision = frame?.control.vision ?? "rgb";

  return (
    <div className="flex min-w-0 flex-col gap-[var(--space-sm)] w-full">
      <FeedSlot
        title="Front RGB (ESP32-CAM)"
        meta={frame?.cameras.rgb}
        mode="rgb"
        active={vision === "rgb"}
        streamUrl={frame?.cameras.rgb.streamUrl ?? ""}
      />
      <FeedSlot
        title="Thermal"
        meta={frame?.cameras.thermal}
        mode="thermal"
        active={vision === "thermal" || vision === "ir"}
        streamUrl={frame?.cameras.thermal.streamUrl ?? ""}
      />
    </div>
  );
}

function FeedSlot({
  title,
  meta,
  mode,
  active: _active,
  streamUrl,
}: {
  title: string;
  meta?: CameraMeta;
  mode: "rgb" | "thermal";
  active: boolean;
  streamUrl: string;
}) {
  const [camIp, setCamIp] = useState<string>("10.232.110.215");
  const [isWsConnected, setIsWsConnected] = useState<boolean>(false);
  const [wsFps, setWsFps] = useState<number>(0);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // WebSocket Live Stream Connection for ESP32-CAM (Port 8765)
  useEffect(() => {
    if (mode !== "rgb") return;

    let ws: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let frameCount = 0;
    let lastFpsTime = Date.now();

    const candidateUrls = [
      `ws://${camIp}:8765/ws`,
      `ws://${camIp}:8765`,
      "ws://10.232.110.215:8765/ws",
      "ws://192.168.4.1:8765/ws",
    ];
    let urlIdx = 0;

    const connectWs = () => {
      const activeWsUrl = candidateUrls[urlIdx % candidateUrls.length];
      console.log(`📷 [ESP32-CAM WS] Attempting connection to: ${activeWsUrl}`);

      try {
        ws = new WebSocket(activeWsUrl);
        ws.binaryType = "blob";

        ws.onopen = () => {
          console.log(`✅ [ESP32-CAM WS] Connected to: ${activeWsUrl}`);
          setIsWsConnected(true);
        };

        ws.onmessage = (ev) => {
          setIsWsConnected(true);
          if (ev.data instanceof Blob) {
            const nextUrl = URL.createObjectURL(ev.data);
            setBlobUrl((prev) => {
              if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
              return nextUrl;
            });

            frameCount++;
            const now = Date.now();
            if (now - lastFpsTime >= 1000) {
              setWsFps(Math.round((frameCount * 1000) / (now - lastFpsTime)));
              frameCount = 0;
              lastFpsTime = now;
            }
          }
        };

        ws.onclose = () => {
          setIsWsConnected(false);
          urlIdx++;
          timer = setTimeout(connectWs, 2000);
        };

        ws.onerror = () => {
          setIsWsConnected(false);
          ws?.close();
        };
      } catch (_err) {
        setIsWsConnected(false);
        urlIdx++;
        timer = setTimeout(connectWs, 3000);
      }
    };

    connectWs();

    return () => {
      if (timer) clearTimeout(timer);
      ws?.close();
    };
  }, [mode, camIp]);

  const fallbackHttpUrl = `http://${camIp}:81/stream`;
  const activeUrl = blobUrl || streamUrl || (mode === "rgb" ? fallbackHttpUrl : "");

  return (
    <Bezel
      title={title}
      stamp={`${isWsConnected ? `WS 8765 LIVE (${wsFps || 24} FPS)` : meta?.recording ? "REC" : "STBY"}  ${meta?.resolution ?? "VGA"}`}
    >
      <div className="relative aspect-video min-w-0 min-h-[380px] sm:min-h-[480px] lg:min-h-[360px] overflow-hidden border border-[var(--color-rule)] bg-[var(--color-paper)] w-full">
        {mode === "rgb" && activeUrl ? (
          <img
            ref={imgRef}
            className="h-full w-full object-cover"
            src={activeUrl}
            alt={`${title} live stream feed`}
            onError={(e) => {
              // If stream fails, fallback to canvas mockup
              e.currentTarget.style.display = "none";
            }}
          />
        ) : mode === "rgb" && isWsConnected && blobUrl ? (
          <img className="h-full w-full object-cover" src={blobUrl} alt="ESP32-CAM WS Feed" />
        ) : (
          <MockTunnel mode={mode} fps={wsFps || meta?.fps || 24} />
        )}
        <div className="pointer-events-none absolute inset-0 border border-[transparent] bg-[linear-gradient(180deg,transparent_70%,oklch(12%_0.01_72_/_0.45))]" />
        
        {/* Status Badge */}
        <div className="absolute left-[var(--space-xs)] top-[var(--space-xs)] flex items-center gap-1.5 font-mono text-[10px]">
          {mode === "rgb" ? (
            <span className={`px-1.5 py-0.5 rounded font-bold ${isWsConnected ? "bg-emerald-950 text-emerald-400 border border-emerald-600" : "bg-amber-950 text-amber-400 border border-amber-600"}`}>
              {isWsConnected ? `🟢 ESP32-CAM WS: ${camIp}:8765` : `🟡 ESP32-CAM WS: CONNECTING (${camIp})`}
            </span>
          ) : (
            <span className="text-[var(--color-muted)]">CAM_THM_FWD</span>
          )}
        </div>

        {/* IP Quick Input Field for ESP32 Camera */}
        {mode === "rgb" && (
          <div className="absolute right-[var(--space-xs)] bottom-[var(--space-xs)] flex items-center gap-1 bg-black/75 px-1.5 py-1 rounded border border-slate-700">
            <span className="text-[9px] font-mono text-slate-400">CAM IP:</span>
            <input
              type="text"
              className="w-24 bg-slate-900 text-cyan-300 font-mono text-[10px] px-1 rounded border border-slate-600 focus:outline-none focus:border-cyan-400"
              value={camIp}
              onChange={(e) => setCamIp(e.target.value)}
              placeholder="10.232.110.215"
            />
          </div>
        )}
      </div>
    </Bezel>
  );
}

function MockTunnel({ mode, fps }: { mode: "rgb" | "thermal"; fps: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let t = 0;
    const draw = () => {
      const { width: w, height: h } = canvas;
      t += 1 / Math.max(12, fps);
      ctx.fillStyle = mode === "rgb" ? "#1a1814" : "#041018";
      ctx.fillRect(0, 0, w, h);
      for (let i = 12; i >= 1; i--) {
        const s = i / 12;
        const x = w / 2;
        const y = h * 0.46;
        const rw = w * 0.92 * s;
        const rh = h * 0.72 * s;
        ctx.strokeStyle = mode === "rgb" ? `rgba(180,160,110,${0.12 + (1 - s) * 0.35})` : `rgba(${40 + i * 18},${80 + i * 8},${200 - i * 10},0.55)`;
        ctx.strokeRect(x - rw / 2, y - rh / 2 + Math.sin(t + i) * 2, rw, rh);
      }
      ctx.strokeStyle = mode === "rgb" ? "rgba(210,180,90,0.45)" : "rgba(255,90,40,0.7)";
      ctx.beginPath();
      ctx.moveTo(w / 2, 8);
      ctx.lineTo(w / 2, h - 8);
      ctx.moveTo(8, h / 2);
      ctx.lineTo(w - 8, h / 2);
      ctx.stroke();
      raf = requestAnimationFrame(draw);
    };
    const resize = () => {
      canvas.width = canvas.clientWidth * devicePixelRatio;
      canvas.height = canvas.clientHeight * devicePixelRatio;
    };
    resize();
    draw();
    return () => cancelAnimationFrame(raf);
  }, [fps, mode]);

  return <canvas ref={ref} className="h-full w-full" />;
}

