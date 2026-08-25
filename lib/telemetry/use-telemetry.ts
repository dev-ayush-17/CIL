"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { mapInboundPayload } from "./mapper";
import type { ControlAck, ControlCommand, TelemetryFrame } from "./schema";

const DEFAULT_URL = "ws://127.0.0.1:8765";
const HISTORY_CAP = 48;

export type LinkState = "connecting" | "online" | "offline";

export function useTelemetry() {
  const url = process.env.NEXT_PUBLIC_TELEMETRY_WS_URL ?? DEFAULT_URL;
  const [frame, setFrame] = useState<TelemetryFrame | null>(null);
  const [history, setHistory] = useState<TelemetryFrame[]>([]);
  const [link, setLink] = useState<LinkState>("connecting");
  const [lastAck, setLastAck] = useState<ControlAck | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(800);

  const sendCommand = useCallback((command: ControlCommand) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "command", command }));
  }, []);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      if (stopped) return;
      setLink("connecting");
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        backoffRef.current = 800;
        setLink("online");
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as {
            type?: string;
            frame?: unknown;
            ok?: boolean;
            command?: ControlCommand;
            at?: string;
          };
          if (msg.type === "frame" && msg.frame) {
            const next = mapInboundPayload(msg.frame);
            setFrame(next);
            setHistory((h) => [...h.slice(-(HISTORY_CAP - 1)), next]);
          }
          if (msg.type === "ack" && msg.ok && msg.command && msg.at) {
            setLastAck({ ok: true, type: "ack", command: msg.command, at: msg.at });
          }
        } catch {
          /* drop malformed frames */
        }
      };

      ws.onclose = () => {
        setLink("offline");
        wsRef.current = null;
        if (stopped) return;
        const wait = backoffRef.current;
        backoffRef.current = Math.min(wait * 1.7, 8000);
        timer = setTimeout(connect, wait);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      wsRef.current?.close();
    };
  }, [url]);

  return { frame, history, link, sendCommand, lastAck, url };
}
