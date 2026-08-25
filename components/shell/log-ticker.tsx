"use client";

import { useTelemetryContext } from "@/lib/telemetry/telemetry-context";

export function LogTicker() {
  const { frame } = useTelemetryContext();
  const entries = frame?.log ?? [];
  const line = entries.map((e) => `[${e.ts}] [${e.source}] ${e.message}`).join("   ·   ");
  const text = line || "Waiting for telemetry bus…";

  return (
    <footer className="z-[var(--z-ticker)] border-t border-[var(--color-rule)] bg-[var(--color-paper-2)]">
      <div className="flex items-stretch">
        <p className="label m-0 flex shrink-0 items-center border-r border-[var(--color-rule)] px-[var(--space-sm)]">
          Sys log
        </p>
        <div className="min-w-0 flex-1 overflow-hidden py-[var(--space-xs)]">
          <div className="ticker-track num text-[length:var(--text-xs)] text-[var(--color-nominal)]">
            <span className="px-[var(--space-md)]">{text}</span>
            <span className="px-[var(--space-md)]" aria-hidden>
              {text}
            </span>
          </div>
        </div>
      </div>
      <p className="m-0 border-t border-[var(--color-rule-2)] px-[var(--page-gutter)] py-[var(--space-2xs)] text-[length:var(--text-xs)] text-[var(--color-muted)]">
        Coal India Ltd — Autonomous Tunneling Division 2026
      </p>
    </footer>
  );
}
