"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { mapInboundPayload } from "./mapper";
import type { ControlAck, ControlCommand, TelemetryFrame, WsInbound, WsOutbound } from "./schema";

const DEFAULT_URL = "ws://127.0.0.1:8765";
const HISTORY_CAP = 48;

export type LinkState = "connecting" | "online" | "stale" | "offline" | "reconnecting";

const generateId = () => Math.random().toString(36).slice(2, 11);

export function useTelemetry() {
  const rawUrl = process.env.NEXT_PUBLIC_TELEMETRY_WS_URL ?? DEFAULT_URL;
  const url = rawUrl.trim().replace(/^["']|["']$/g, "");
  const [frame, setFrame] = useState<TelemetryFrame | null>(null);
  const [history, setHistory] = useState<TelemetryFrame[]>([]);
  const [link, setLink] = useState<LinkState>("connecting");
  const [lastAck, setLastAck] = useState<ControlAck | null>(null);
  const [pendingCommands, setPendingCommands] = useState<
    Record<string, { command: ControlCommand; timestamp: number; unconfirmed: boolean; error?: string }>
  >({});
  
  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(800);
  const lastReceivedRef = useRef<number>(0);

  const sendCommand = useCallback((command: ControlCommand) => {
    const ws = wsRef.current;
    
    console.log("🔥 sendCommand called with:", command);
    console.log("🔥 current ws object:", ws, "readyState:", ws?.readyState);

    // Forward drive and mode commands directly to Digital Twin iframe for zero-latency 3D locomotion
    if (typeof window !== "undefined") {
      const twinIframe = document.querySelector("iframe[title='Digital Twin 3D View']") as HTMLIFrameElement;
      if (twinIframe && twinIframe.contentWindow) {
        if (command.type === "set_mode") {
          twinIframe.contentWindow.postMessage({ type: "SET_LOCOMOTION_MODE", mode: command.mode }, "*");
        } else if (command.type === "drive" || command.type === "walk") {
          let dir: "forward" | "backward" | "left" | "right" | "stop" = "stop";
          if (command.dir === "fwd") dir = "forward";
          else if (command.dir === "back") dir = "backward";
          else if (command.dir === "left") dir = "left";
          else if (command.dir === "right") dir = "right";
          twinIframe.contentWindow.postMessage({ type: "DRIVE_COMMAND", dir }, "*");
        }
      }
    }

    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.warn("⚠️ sendCommand sent to Digital Twin iframe, but WS is not OPEN (simulating local movement).");
      return null;
    }
    
    const commandId = generateId();
    const timestamp = new Date().toISOString();
    
    const envelope: WsOutbound = {
      type: "command",
      commandId,
      timestamp,
      command,
    };

    console.log("🔥 SENDING COMMAND FROM BROWSER:", envelope);
    ws.send(JSON.stringify(envelope));
    
    setPendingCommands((prev) => ({
      ...prev,
      [commandId]: { command, timestamp: Date.now(), unconfirmed: false },
    }));

    return commandId;
  }, []);

  // Monitor pending commands timeouts (mark as unconfirmed after 2 seconds)
  useEffect(() => {
    const id = setInterval(() => {
      setPendingCommands((prev) => {
        let changed = false;
        const now = Date.now();
        const next = { ...prev };
        
        for (const [key, val] of Object.entries(next)) {
          if (!val.unconfirmed && now - val.timestamp > 2000) {
            next[key] = { ...val, unconfirmed: true };
            changed = true;
          }
          // Memory cleanup after 15 seconds
          if (now - val.timestamp > 15000) {
            delete next[key];
            changed = true;
          }
        }
        
        return changed ? next : prev;
      });
    }, 500);

    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pingInterval: ReturnType<typeof setInterval> | undefined;
    let staleChecker: ReturnType<typeof setInterval> | undefined;

    const connect = () => {
      if (stopped) return;
      
      console.log("🌐 Connecting Telemetry WebSocket to:", url);

      // If we already tried once and backoff > 800, we are reconnecting
      if (backoffRef.current > 800) {
        setLink("reconnecting");
      } else {
        setLink("connecting");
      }
      
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("✅ WebSocket Connected successfully to:", url);
        backoffRef.current = 800;
        setLink("online");
        lastReceivedRef.current = Date.now();

        // Start ping heartbeat
        if (pingInterval) clearInterval(pingInterval);
        pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            const envelope: WsOutbound = {
              type: "ping",
              commandId: "ping-" + generateId(),
              timestamp: new Date().toISOString(),
            };
            ws.send(JSON.stringify(envelope));
          }
        }, 3000);

        // Start stale connection checker (every 1s)
        if (staleChecker) clearInterval(staleChecker);
        staleChecker = setInterval(() => {
          const elapsed = Date.now() - lastReceivedRef.current;
          if (elapsed > 8000) {
            setLink("stale");
          } else if (ws.readyState === WebSocket.OPEN && elapsed <= 8000) {
            setLink("online");
          }
        }, 1000);
      };

      ws.onmessage = (ev) => {
        lastReceivedRef.current = Date.now();
        
        try {
          const msg = JSON.parse(String(ev.data)) as WsInbound;

          if (msg.type === "frame" && msg.frame) {
            const next = mapInboundPayload(msg.frame);
            setFrame(next);
            setHistory((h) => [...h.slice(-(HISTORY_CAP - 1)), next]);
          }

          if (msg.type === "ack") {
            const { commandId, ok, error, at } = msg;
            setLastAck({ type: "ack", commandId, ok, error, at });
            
            // Reconcile pending commands
            setPendingCommands((prev) => {
              if (keyInDict(prev, commandId)) {
                const next = { ...prev };
                if (ok) {
                  // Successfully acked, remove immediately
                  delete next[commandId];
                } else {
                  // Failed, set error message so UI can show it
                  next[commandId] = {
                    ...next[commandId],
                    unconfirmed: true,
                    error: error ?? "REJECTED",
                  };
                }
                return next;
              }
              return prev;
            });
          }

          if (msg.type === "pong") {
            // Heartbeat response, simply updates lastReceivedRef
          }

          if (msg.type === "log" && msg.severity && msg.source && msg.message) {
            // Direct injection into system logs
            setFrame((curr) => {
              if (!curr) return null;
              const newLog = { ts: msg.ts, source: msg.source, message: msg.message };
              
              // Also add to alert log if severity is caution/hazard
              let newAlerts = curr.alerts;
              if (msg.severity === "caution" || msg.severity === "hazard") {
                newAlerts = [
                  {
                    id: `dev-${msg.source}-${Date.now()}`,
                    ts: msg.ts,
                    severity: msg.severity,
                    code: `${msg.source}-DEV`,
                    message: msg.message,
                  },
                  ...curr.alerts.slice(0, 5),
                ];
              }

              return {
                ...curr,
                log: [newLog, ...curr.log.slice(0, 23)],
                alerts: newAlerts,
              };
            });
          }
        } catch {
          /* drop malformed frames */
        }
      };

      ws.onclose = (ev) => {
        console.warn(`⚠️ WebSocket closed (code: ${ev.code}, reason: "${ev.reason}") for URL: ${url}`);
        // Fix: React StrictMode fires unmount immediately. 
        // If an old socket's onclose fires *after* a new socket is created, 
        // it shouldn't be allowed to nullify the new socket's ref.
        if (wsRef.current === ws) {
          setLink("offline");
          wsRef.current = null;
        }
        
        if (pingInterval) clearInterval(pingInterval);
        if (staleChecker) clearInterval(staleChecker);
        
        if (stopped) return;
        const wait = backoffRef.current;
        backoffRef.current = Math.min(wait * 1.7, 8000);
        timer = setTimeout(connect, wait);
      };

      ws.onerror = () => {
        console.warn("⚠️ WebSocket connection attempt failed for:", url);
        ws.close();
      };
    };

    connect();
    
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      if (pingInterval) clearInterval(pingInterval);
      if (staleChecker) clearInterval(staleChecker);
      wsRef.current?.close();
    };
  }, [url]);

  return { frame, history, link, sendCommand, lastAck, url, pendingCommands };
}

function keyInDict<T>(obj: Record<string, T>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}
