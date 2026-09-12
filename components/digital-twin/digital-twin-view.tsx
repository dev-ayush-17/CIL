"use client";

import { useMemo } from "react";
import { useTelemetryContext } from "@/lib/telemetry/telemetry-context";

export default function DigitalTwinView() {
  const { sendCommand } = useTelemetryContext();

  const iframeSrc = useMemo(() => {
    const cmdWs = process.env.NEXT_PUBLIC_COMMAND_WS_URL || process.env.NEXT_PUBLIC_TELEMETRY_WS_URL || "";
    const tofWs = process.env.NEXT_PUBLIC_TOF_WS_URL || "";
    const cameraWs = process.env.NEXT_PUBLIC_CAMERA_WS_URL || "";
    
    const params = new URLSearchParams();
    if (cmdWs) params.set("cmdWs", cmdWs);
    if (tofWs) params.set("tofWs", tofWs);
    if (cameraWs) params.set("cameraWs", cameraWs);

    const query = params.toString();
    return `/digital-twin/index.html${query ? `?${query}` : ""}`;
  }, []);

  const handleIframeLoad = (e: React.SyntheticEvent<HTMLIFrameElement>) => {
    try {
      const doc = e.currentTarget.contentDocument;
      if (!doc) return;

      const handleBtnClick = (ev: MouseEvent) => {
        const target = ev.target as HTMLElement | null;
        if (!target) return;
        const btn = target.closest("button");
        if (!btn) return;

        const id = btn.id;
        if (id === "btn-fwd") sendCommand({ type: "walk", dir: "fwd" });
        else if (id === "btn-bwd") sendCommand({ type: "walk", dir: "back" });
        else if (id === "btn-left") sendCommand({ type: "walk", dir: "left" });
        else if (id === "btn-right") sendCommand({ type: "walk", dir: "right" });
        else if (id === "btn-stop") sendCommand({ type: "walk", dir: "stop" });
        else if (id === "btn-mode-walk") sendCommand({ type: "set_mode", mode: "walk" });
        else if (id === "btn-mode-drive") sendCommand({ type: "set_mode", mode: "drive" });
      };

      doc.addEventListener("click", handleBtnClick);
    } catch (err) {
      console.warn("Could not attach click sync listener to iframe:", err);
    }
  };

  return (
    <div className="w-full h-full min-h-[calc(100vh-140px)] rounded-lg overflow-hidden border border-[var(--color-rule)] bg-[#050B14] relative">
      <iframe
        src={iframeSrc}
        onLoad={handleIframeLoad}
        className="w-full h-full border-0 min-h-[750px]"
        title="Digital Twin 3D View"
      />
    </div>
  );
}

export { DigitalTwinView };
