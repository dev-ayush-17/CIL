"use client";

import { useEffect, useState } from "react";

/* eslint-disable @typescript-eslint/no-namespace */
declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string;
          alt?: string;
          ar?: boolean;
          "camera-controls"?: boolean;
          "auto-rotate"?: boolean;
          "shadow-intensity"?: string;
          "touch-action"?: string;
          "data-js-focus-visible"?: boolean;
        },
        HTMLElement
      >;
    }
  }
}

export function ModelViewerPanel() {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    import("@google/model-viewer")
      .then(() => {
        setLoaded(true);
      })
      .catch((err) => {
        console.error("Failed to load model-viewer element:", err);
      });
  }, []);

  if (!loaded) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center border border-[var(--color-rule)] bg-[var(--color-paper-2)] py-[var(--space-xl)] text-[length:var(--text-xs)] text-[var(--color-muted)] font-mono">
        <span className="animate-pulse">INITIALIZING 3D TELEMETRY ENGINE...</span>
      </div>
    );
  }

  return (
    <div className="relative aspect-video w-full overflow-hidden border border-[var(--color-rule)] bg-[var(--color-paper)]">
      {/* Schematic overlays to look like an operator console widget */}
      <div className="absolute inset-0 pointer-events-none z-10 border border-[transparent] bg-[linear-gradient(180deg,transparent_75%,oklch(12%_0.01_72_/_0.3))]">
        {/* Crosshair calibrations */}
        <div className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 opacity-25">
          <div className="absolute top-1/2 left-0 h-[1px] w-full bg-[var(--color-accent)]" />
          <div className="absolute left-1/2 top-0 h-full w-[1px] bg-[var(--color-accent)]" />
          <div className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[var(--color-accent)]" />
        </div>

        {/* Framing screw rivets in corners */}
        <div className="absolute top-1.5 left-1.5 w-1 h-1 rounded-full bg-[var(--color-rule)] opacity-40" />
        <div className="absolute top-1.5 right-1.5 w-1 h-1 rounded-full bg-[var(--color-rule)] opacity-40" />
        <div className="absolute bottom-1.5 left-1.5 w-1 h-1 rounded-full bg-[var(--color-rule)] opacity-40" />
        <div className="absolute bottom-1.5 right-1.5 w-1 h-1 rounded-full bg-[var(--color-rule)] opacity-40" />

        {/* Dynamic labels */}
        <p className="absolute bottom-2 left-3 label select-none opacity-50 m-0 leading-none">
          SYS.MODEL_VIEWER_SYS [REF: UGV-CONSOLE-3D]
        </p>
        <div className="absolute bottom-2 right-3 flex gap-4 text-right opacity-50 font-mono text-[9px]">
          <div>X: +0.00m</div>
          <div>Y: +0.00m</div>
          <div>Z: +0.00m</div>
        </div>
        <p className="absolute top-2 left-3 label select-none opacity-50 m-0 leading-none">
          SCANNING LDR_MESH...
        </p>
      </div>

      <model-viewer
        src="/models/robot.glb"
        alt="Interactive 3D model of autonomous tunnel UGV"
        camera-controls
        auto-rotate
        touch-action="pan-y"
        style={{
          width: "100%",
          height: "100%",
          background: "transparent",
          outline: "none",
        }}
      />
    </div>
  );
}
