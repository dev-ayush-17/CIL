"use client";

import { useMemo } from "react";

export default function DigitalTwinView() {
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

  return (
    <div className="w-full h-full min-h-[calc(100vh-140px)] rounded-lg overflow-hidden border border-[var(--color-rule)] bg-[#050B14] relative">
      <iframe
        src={iframeSrc}
        className="w-full h-full border-0 min-h-[750px]"
        title="Digital Twin 3D View"
      />
    </div>
  );
}

export { DigitalTwinView };
