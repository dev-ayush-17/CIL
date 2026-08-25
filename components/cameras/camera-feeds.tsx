"use client";

import { useEffect, useRef } from "react";
import { Bezel } from "@/components/ui/bezel";
import { useTelemetryContext } from "@/lib/telemetry/telemetry-context";
import type { CameraMeta } from "@/lib/telemetry/schema";

export function CameraFeeds() {
  const { frame } = useTelemetryContext();
  const vision = frame?.control.vision ?? "rgb";

  return (
    <div className="grid min-w-0 grid-cols-1 gap-[var(--space-sm)] md:grid-cols-2">
      <FeedSlot
        title="Front RGB"
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
  active,
  streamUrl,
}: {
  title: string;
  meta?: CameraMeta;
  mode: "rgb" | "thermal";
  active: boolean;
  streamUrl: string;
}) {
  return (
    <Bezel
      title={title}
      stamp={`${meta?.recording ? "REC" : "STBY"}  ${meta?.fps ?? "—"} FPS  ${meta?.resolution ?? "—"}`}
    >
      <div className="relative aspect-video min-w-0 overflow-hidden border border-[var(--color-rule)] bg-[var(--color-paper)]">
        {streamUrl ? (
          <video className="h-full w-full object-cover" src={streamUrl} autoPlay muted playsInline />
        ) : (
          <MockTunnel mode={mode} fps={meta?.fps ?? 24} />
        )}
        <div className="pointer-events-none absolute inset-0 border border-[transparent] bg-[linear-gradient(180deg,transparent_70%,oklch(12%_0.01_72_/_0.45))]" />
        <p className="absolute left-[var(--space-xs)] top-[var(--space-xs)] label" style={{ color: active ? "var(--color-accent)" : "var(--color-muted)" }}>
          {mode === "rgb" ? "CAM_RGB_FWD" : "CAM_THM_FWD"}
        </p>
        {meta?.recording ? (
          <p className="absolute right-[var(--space-xs)] top-[var(--space-xs)] num text-[length:var(--text-xs)] text-[var(--color-hazard)]">
            REC
          </p>
        ) : null}
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
