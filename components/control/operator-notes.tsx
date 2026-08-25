"use client";

import { useState } from "react";
import { Bezel } from "@/components/ui/bezel";
import { useTelemetryContext } from "@/lib/telemetry/telemetry-context";

export function OperatorNotes() {
  const { sendCommand, lastAck, link } = useTelemetryContext();
  const [text, setText] = useState("");

  return (
    <Bezel title="Operator note" stamp={lastAck?.command.type === "mission_note" ? "ACK" : undefined}>
      <form
        className="flex flex-col gap-[var(--space-xs)] sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          const next = text.trim();
          if (!next) return;
          sendCommand({ type: "mission_note", text: next });
          setText("");
        }}
      >
        <label className="sr-only" htmlFor="mission-note">
          Mission log entry
        </label>
        <input
          id="mission-note"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={link !== "online"}
          placeholder="Stamp a note into the sys log"
          className="num min-w-0 flex-1 border border-[var(--color-rule)] bg-[var(--color-paper)] px-[var(--space-sm)] py-[var(--space-xs)] text-[length:var(--text-sm)] text-[var(--color-ink)]"
        />
        <button type="submit" className="latch" disabled={link !== "online" || !text.trim()}>
          Stamp log
        </button>
      </form>
    </Bezel>
  );
}
