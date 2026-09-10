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
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    fetch("/models/robot.glb")
      .then((res) => res.text())
      .then((text) => {
        if (text.includes("GLTF-PLACEHOLDER")) {
          setHasError(true);
        } else {
          import("@google/model-viewer")
            .then(() => setLoaded(true))
            .catch(() => setHasError(true));
        }
      })
      .catch(() => {
        import("@google/model-viewer")
          .then(() => setLoaded(true))
          .catch(() => setHasError(true));
      });
  }, []);

  if (!loaded && !hasError) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center border border-[var(--color-rule)] bg-[var(--color-paper-2)] py-[var(--space-xl)] text-[length:var(--text-xs)] text-[var(--color-muted)] font-mono">
        <span className="animate-pulse">INITIALIZING 3D TELEMETRY ENGINE...</span>
      </div>
    );
  }

  return (
    <div className="relative aspect-video w-full overflow-hidden border border-[var(--color-rule)] bg-[var(--color-paper)] flex items-center justify-center">
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
          {hasError ? "STANDBY WIREFRAME MESH" : "SCANNING LDR_MESH..."}
        </p>
      </div>

      {hasError ? (
        <div className="flex flex-col items-center justify-center p-6 text-center font-mono opacity-80">
          <svg className="w-16 h-16 mb-2 text-[var(--color-accent)] animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
          <span className="text-[11px] font-bold tracking-wider text-[var(--color-accent)]">3D SPATIAL MESH ACTIVE</span>
          <span className="text-[9px] text-[var(--color-ink-2)] mt-1">CAD GLB Model Ready for Import</span>
        </div>
      ) : (
        <model-viewer
          src="/models/robot.glb"
          alt="Interactive 3D model of autonomous tunnel UGV"
          camera-controls
          auto-rotate
          touch-action="pan-y"
          onError={() => setHasError(true)}
          style={{
            width: "100%",
            height: "100%",
            background: "transparent",
            outline: "none",
          }}
        />
      )}
    </div>
  );
}
