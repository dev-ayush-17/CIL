"use client";

import type { ReactNode } from "react";
import { CameraFeeds } from "@/components/cameras/camera-feeds";
import { Bezel } from "@/components/ui/bezel";
import { useTelemetryContext } from "@/lib/telemetry/telemetry-context";
import type { LightLevel, SpeedGear, VisionMode } from "@/lib/telemetry/schema";
import { OperatorNotes } from "@/components/control/operator-notes";

export function RobotControl() {
  const { frame, sendCommand, link } = useTelemetryContext();
  const c = frame?.control;
  const disabled = link !== "online";

  return (
    <div className="flex min-w-0 flex-col gap-[var(--space-sm)]">
      <div className="grid min-w-0 grid-cols-1 gap-[var(--space-sm)] xl:grid-cols-2 2xl:grid-cols-4">
        <Bezel title="Op modes">
          <div className="grid grid-cols-2">
            <button type="button" className="latch" disabled={disabled} aria-pressed={c?.mode === "drive"} onClick={() => sendCommand({ type: "set_mode", mode: "drive" })}>
              Drive mode
            </button>
            <button type="button" className="latch" disabled={disabled} aria-pressed={c?.mode === "walk"} onClick={() => sendCommand({ type: "set_mode", mode: "walk" })}>
              Walk mode
            </button>
          </div>
        </Bezel>
        <Bezel title="Posture" stamp={c ? `${c.tiltRollPct.toFixed(0)} / ${c.heightPct.toFixed(0)}` : "—"}>
          <label className="label block">
            Tilt / roll
            <input
              className="range mt-[var(--space-2xs)]"
              type="range"
              min={0}
              max={100}
              disabled={disabled}
              value={c?.tiltRollPct ?? 0}
              onChange={(e) =>
                sendCommand({
                  type: "set_posture",
                  tiltRollPct: Number(e.target.value),
                  heightPct: c?.heightPct ?? 50,
                })
              }
            />
          </label>
          <label className="label mt-[var(--space-sm)] block">
            Height
            <input
              className="range mt-[var(--space-2xs)]"
              type="range"
              min={0}
              max={100}
              disabled={disabled}
              value={c?.heightPct ?? 0}
              onChange={(e) =>
                sendCommand({
                  type: "set_posture",
                  tiltRollPct: c?.tiltRollPct ?? 50,
                  heightPct: Number(e.target.value),
                })
              }
            />
          </label>
          <div className="mt-[var(--space-sm)] grid grid-cols-2">
            <button type="button" className="latch" disabled={disabled} onClick={() => sendCommand({ type: "posture_preset", preset: "crouch" })}>
              Crouch
            </button>
            <button type="button" className="latch" disabled={disabled} onClick={() => sendCommand({ type: "posture_preset", preset: "stand" })}>
              Stand
            </button>
          </div>
        </Bezel>
        <Bezel title="Drive control">
          <DPad
            disabled={disabled}
            active={c?.driveDir ?? "stop"}
            onDir={(dir) => sendCommand({ type: "drive", dir })}
          />
          <div className="mt-[var(--space-sm)] grid grid-cols-3">
            {(["slow", "med", "fast"] as SpeedGear[]).map((speed) => (
              <button
                key={speed}
                type="button"
                className="latch"
                disabled={disabled}
                aria-pressed={c?.speed === speed}
                onClick={() => sendCommand({ type: "set_speed", speed })}
              >
                {speed}
              </button>
            ))}
          </div>
        </Bezel>
        <Bezel title="Walk control">
          <DPad
            disabled={disabled}
            active={c?.walkDir ?? "stop"}
            onDir={(dir) => sendCommand({ type: "walk", dir })}
          />
        </Bezel>
        <Bezel title="Lighting">
          <div className="grid grid-cols-4">
            {(["off", "low", "med", "high"] as LightLevel[]).map((intensity) => (
              <button
                key={intensity}
                type="button"
                className="latch"
                disabled={disabled}
                aria-pressed={c?.lights === intensity}
                onClick={() => sendCommand({ type: "set_lights", intensity })}
              >
                {intensity}
              </button>
            ))}
          </div>
        </Bezel>
        <Bezel title="Gimbal" stamp={c ? `P ${c.gimbal.pitch}  Y ${c.gimbal.yaw}` : "—"}>
          <GimbalPad disabled={disabled} onDir={(dir) => sendCommand({ type: "gimbal", dir })} />
        </Bezel>
        <Bezel title="Vision mode">
          <div className="grid grid-cols-3">
            {(["rgb", "thermal", "ir"] as VisionMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                className="latch"
                disabled={disabled}
                aria-pressed={c?.vision === mode}
                onClick={() => sendCommand({ type: "set_vision", mode })}
              >
                {mode}
              </button>
            ))}
          </div>
        </Bezel>
      </div>
      <CameraFeeds />
      <OperatorNotes />
    </div>
  );
}

function DPad({
  disabled,
  active,
  onDir,
}: {
  disabled: boolean;
  active: "stop" | "fwd" | "back" | "left" | "right";
  onDir: (dir: "stop" | "fwd" | "back" | "left" | "right") => void;
}) {
  return (
    <div className="mx-auto grid w-[8.5rem] grid-cols-3 gap-[var(--space-2xs)]">
      <span />
      <PadBtn disabled={disabled} on={active === "fwd"} onClick={() => onDir("fwd")}>
        Fwd
      </PadBtn>
      <span />
      <PadBtn disabled={disabled} on={active === "left"} onClick={() => onDir("left")}>
        L
      </PadBtn>
      <PadBtn disabled={disabled} on={active === "stop"} onClick={() => onDir("stop")}>
        Stop
      </PadBtn>
      <PadBtn disabled={disabled} on={active === "right"} onClick={() => onDir("right")}>
        R
      </PadBtn>
      <span />
      <PadBtn disabled={disabled} on={active === "back"} onClick={() => onDir("back")}>
        Back
      </PadBtn>
      <span />
    </div>
  );
}

function GimbalPad({
  disabled,
  onDir,
}: {
  disabled: boolean;
  onDir: (dir: "up" | "down" | "left" | "right" | "center") => void;
}) {
  return (
    <div className="mx-auto grid w-[8.5rem] grid-cols-3 gap-[var(--space-2xs)]">
      <span />
      <PadBtn disabled={disabled} on={false} onClick={() => onDir("up")}>
        Up
      </PadBtn>
      <span />
      <PadBtn disabled={disabled} on={false} onClick={() => onDir("left")}>
        L
      </PadBtn>
      <PadBtn disabled={disabled} on={false} onClick={() => onDir("center")}>
        Ctr
      </PadBtn>
      <PadBtn disabled={disabled} on={false} onClick={() => onDir("right")}>
        R
      </PadBtn>
      <span />
      <PadBtn disabled={disabled} on={false} onClick={() => onDir("down")}>
        Dn
      </PadBtn>
      <span />
    </div>
  );
}

function PadBtn({
  children,
  on,
  disabled,
  onClick,
}: {
  children: ReactNode;
  on: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`pad-key ${on ? "is-on" : ""}`} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}
