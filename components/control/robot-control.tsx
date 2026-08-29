"use client";

import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { CameraFeeds } from "@/components/cameras/camera-feeds";
import { Bezel } from "@/components/ui/bezel";
import { useTelemetryContext } from "@/lib/telemetry/telemetry-context";
import type { ControlCommand, LightLevel, SpeedGear, VisionMode } from "@/lib/telemetry/schema";
import { OperatorNotes } from "@/components/control/operator-notes";

// Custom hook to handle continuous press-and-hold loop for D-Pads and Gimbal pads
function useHoldCommand(
  sendCommand: (command: ControlCommand) => string | null,
  commandCreator: (dir: string) => ControlCommand,
  stopCommand: ControlCommand,
  rateMs = 200
) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeDirRef = useRef<string | null>(null);

  const startHold = useCallback((dir: string) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    activeDirRef.current = dir;

    // Send the first command immediately
    sendCommand(commandCreator(dir));

    // Start repeating loop
    intervalRef.current = setInterval(() => {
      sendCommand(commandCreator(dir));
    }, rateMs);
  }, [sendCommand, commandCreator, rateMs]);

  const stopHold = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (activeDirRef.current !== null) {
      activeDirRef.current = null;
      sendCommand(stopCommand);
    }
  }, [sendCommand, stopCommand]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return { startHold, stopHold };
}

export function RobotControl() {
  const { frame, sendCommand, link, pendingCommands } = useTelemetryContext();
  const c = frame?.control;
  const estopActive = c?.estopActive ?? false;
  const disabled = link !== "online" || estopActive;

  // Slider local states (during drag)
  const [localTiltRoll, setLocalTiltRoll] = useState<number | null>(null);
  const [localHeight, setLocalHeight] = useState<number | null>(null);
  
  // Slider throttling ref
  const sliderThrottleRef = useRef<number>(0);

  const sendThrottledPosture = (tilt: number, height: number) => {
    const now = Date.now();
    if (now - sliderThrottleRef.current > 150) {
      sendCommand({ type: "set_posture", tiltRollPct: tilt, heightPct: height });
      sliderThrottleRef.current = now;
    }
  };

  // Helper: check if there's any unconfirmed pending command matching a filter
  const getPendingCommand = (filter: (cmd: ControlCommand) => boolean) => {
    return Object.values(pendingCommands).find((p) => filter(p.command));
  };

  // Unconfirmed status for Bezels
  const pendingMode = getPendingCommand((cmd) => cmd.type === "set_mode");
  const modeVal = pendingMode && pendingMode.command.type === "set_mode" ? pendingMode.command.mode : c?.mode;
  const modeUnconfirmed = pendingMode?.unconfirmed ?? false;

  const pendingPreset = getPendingCommand((cmd) => cmd.type === "posture_preset");
  const pendingPosture = getPendingCommand((cmd) => cmd.type === "set_posture");
  const postureUnconfirmed = (pendingPreset?.unconfirmed || pendingPosture?.unconfirmed) ?? false;

  const pendingLights = getPendingCommand((cmd) => cmd.type === "set_lights");
  const lightsVal = pendingLights && pendingLights.command.type === "set_lights" ? pendingLights.command.intensity : c?.lights;
  const lightsUnconfirmed = pendingLights?.unconfirmed ?? false;

  const pendingVision = getPendingCommand((cmd) => cmd.type === "set_vision");
  const visionVal = pendingVision && pendingVision.command.type === "set_vision" ? pendingVision.command.mode : c?.vision;
  const visionUnconfirmed = pendingVision?.unconfirmed ?? false;

  const pendingSpeed = getPendingCommand((cmd) => cmd.type === "set_speed");
  const speedVal = pendingSpeed && pendingSpeed.command.type === "set_speed" ? pendingSpeed.command.speed : c?.speed;
  const speedUnconfirmed = pendingSpeed?.unconfirmed ?? false;

  // 1. Continuous Drive D-Pad Hold Loop
  const driveHold = useHoldCommand(
    sendCommand,
    (dir) => ({ type: "drive", dir: dir as "stop" | "fwd" | "back" | "left" | "right" }),
    { type: "drive", dir: "stop" }
  );

  // 2. Continuous Walk D-Pad Hold Loop
  const walkHold = useHoldCommand(
    sendCommand,
    (dir) => ({ type: "walk", dir: dir as "stop" | "fwd" | "back" | "left" | "right" }),
    { type: "walk", dir: "stop" }
  );

  // 3. Continuous Gimbal Hold Loop
  const gimbalHold = useHoldCommand(
    sendCommand,
    (dir) => ({ type: "gimbal", dir: dir as "up" | "down" | "left" | "right" | "center" }),
    { type: "gimbal", dir: "center" }
  );

  // Reconciled Values for visual state
  const tiltRollVal = localTiltRoll !== null ? localTiltRoll : (c?.tiltRollPct ?? 0);
  const heightVal = localHeight !== null ? localHeight : (c?.heightPct ?? 0);

  return (
    <div className="flex min-w-0 flex-col gap-[var(--space-sm)]">
      {estopActive && (
        <div className="border border-[var(--color-hazard)] bg-red-950/20 p-[var(--space-sm)] text-[var(--color-hazard)] font-mono text-center animate-pulse font-bold tracking-wide text-xs">
          ⚠️ EMERGENCY STOP ACTIVE — MOTION CONTROLS LOCKED OUT
        </div>
      )}

      <div className="grid min-w-0 grid-cols-1 gap-[var(--space-sm)] xl:grid-cols-2 2xl:grid-cols-4">
        {/* Op Modes */}
        <Bezel title="Op modes" stamp={modeUnconfirmed ? "WAITING FOR ACK ⚠️" : undefined}>
          <div className="grid grid-cols-2">
            <button
              type="button"
              className={`latch ${modeVal === "drive" ? "is-on" : ""}`}
              disabled={disabled}
              aria-pressed={modeVal === "drive"}
              onClick={() => sendCommand({ type: "set_mode", mode: "drive" })}
            >
              Drive mode
            </button>
            <button
              type="button"
              className={`latch ${modeVal === "walk" ? "is-on" : ""}`}
              disabled={disabled}
              aria-pressed={modeVal === "walk"}
              onClick={() => sendCommand({ type: "set_mode", mode: "walk" })}
            >
              Walk mode
            </button>
          </div>
        </Bezel>

        {/* Posture Sliders */}
        <Bezel
          title="Posture"
          stamp={postureUnconfirmed ? "WAITING FOR ACK ⚠️" : (c ? `${tiltRollVal.toFixed(0)} / ${heightVal.toFixed(0)}` : "—")}
        >
          <label className="label block">
            Tilt / roll
            <input
              className="range mt-[var(--space-2xs)]"
              type="range"
              min={0}
              max={100}
              disabled={disabled}
              value={tiltRollVal}
              onChange={(e) => {
                const val = Number(e.target.value);
                setLocalTiltRoll(val);
                sendThrottledPosture(val, heightVal);
              }}
              onPointerUp={() => {
                sendCommand({ type: "set_posture", tiltRollPct: tiltRollVal, heightPct: heightVal });
                setLocalTiltRoll(null);
              }}
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
              value={heightVal}
              onChange={(e) => {
                const val = Number(e.target.value);
                setLocalHeight(val);
                sendThrottledPosture(tiltRollVal, val);
              }}
              onPointerUp={() => {
                sendCommand({ type: "set_posture", tiltRollPct: tiltRollVal, heightPct: heightVal });
                setLocalHeight(null);
              }}
            />
          </label>
          <div className="mt-[var(--space-sm)] grid grid-cols-2">
            <button
              type="button"
              className="latch"
              disabled={disabled}
              onClick={() => sendCommand({ type: "posture_preset", preset: "crouch" })}
            >
              Crouch
            </button>
            <button
              type="button"
              className="latch"
              disabled={disabled}
              onClick={() => sendCommand({ type: "posture_preset", preset: "stand" })}
            >
              Stand
            </button>
          </div>
        </Bezel>

        {/* Drive Control */}
        <Bezel title="Drive control" stamp={speedUnconfirmed ? "WAITING FOR ACK ⚠️" : undefined}>
          <DPad
            disabled={disabled}
            active={c?.driveDir ?? "stop"}
            onHold={driveHold}
          />
          <div className="mt-[var(--space-sm)] grid grid-cols-3">
            {(["slow", "med", "fast"] as SpeedGear[]).map((speed) => (
              <button
                key={speed}
                type="button"
                className={`latch ${speedVal === speed ? "is-on" : ""}`}
                disabled={disabled}
                aria-pressed={speedVal === speed}
                onClick={() => sendCommand({ type: "set_speed", speed })}
              >
                {speed}
              </button>
            ))}
          </div>
        </Bezel>

        {/* Walk Control */}
        <Bezel title="Walk control">
          <DPad
            disabled={disabled}
            active={c?.walkDir ?? "stop"}
            onHold={walkHold}
          />
        </Bezel>

        {/* Lighting */}
        <Bezel title="Lighting" stamp={lightsUnconfirmed ? "WAITING FOR ACK ⚠️" : undefined}>
          <div className="grid grid-cols-4">
            {(["off", "low", "med", "high"] as LightLevel[]).map((intensity) => (
              <button
                key={intensity}
                type="button"
                className={`latch ${lightsVal === intensity ? "is-on" : ""}`}
                disabled={disabled}
                aria-pressed={lightsVal === intensity}
                onClick={() => sendCommand({ type: "set_lights", intensity })}
              >
                {intensity}
              </button>
            ))}
          </div>
        </Bezel>

        {/* Gimbal */}
        <Bezel title="Gimbal" stamp={c ? `P ${c.gimbal.pitch}  Y ${c.gimbal.yaw}` : "—"}>
          <GimbalPad disabled={disabled} onHold={gimbalHold} />
        </Bezel>

        {/* Vision Mode */}
        <Bezel title="Vision mode" stamp={visionUnconfirmed ? "WAITING FOR ACK ⚠️" : undefined}>
          <div className="grid grid-cols-3">
            {(["rgb", "thermal", "ir"] as VisionMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                className={`latch ${visionVal === mode ? "is-on" : ""}`}
                disabled={disabled}
                aria-pressed={visionVal === mode}
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
  onHold,
}: {
  disabled: boolean;
  active: "stop" | "fwd" | "back" | "left" | "right";
  onHold: { startHold: (dir: string) => void; stopHold: () => void };
}) {
  return (
    <div className="mx-auto grid w-[8.5rem] grid-cols-3 gap-[var(--space-2xs)]">
      <span />
      <PadBtn
        disabled={disabled}
        on={active === "fwd"}
        onStart={() => onHold.startHold("fwd")}
        onStop={onHold.stopHold}
      >
        Fwd
      </PadBtn>
      <span />
      <PadBtn
        disabled={disabled}
        on={active === "left"}
        onStart={() => onHold.startHold("left")}
        onStop={onHold.stopHold}
      >
        L
      </PadBtn>
      <PadBtn
        disabled={disabled}
        on={active === "stop"}
        onStart={() => onHold.startHold("stop")}
        onStop={onHold.stopHold}
      >
        Stop
      </PadBtn>
      <PadBtn
        disabled={disabled}
        on={active === "right"}
        onStart={() => onHold.startHold("right")}
        onStop={onHold.stopHold}
      >
        R
      </PadBtn>
      <span />
      <PadBtn
        disabled={disabled}
        on={active === "back"}
        onStart={() => onHold.startHold("back")}
        onStop={onHold.stopHold}
      >
        Back
      </PadBtn>
      <span />
    </div>
  );
}

function GimbalPad({
  disabled,
  onHold,
}: {
  disabled: boolean;
  onHold: { startHold: (dir: string) => void; stopHold: () => void };
}) {
  return (
    <div className="mx-auto grid w-[8.5rem] grid-cols-3 gap-[var(--space-2xs)]">
      <span />
      <PadBtn
        disabled={disabled}
        on={false}
        onStart={() => onHold.startHold("up")}
        onStop={onHold.stopHold}
      >
        Up
      </PadBtn>
      <span />
      <PadBtn
        disabled={disabled}
        on={false}
        onStart={() => onHold.startHold("left")}
        onStop={onHold.stopHold}
      >
        L
      </PadBtn>
      <PadBtn
        disabled={disabled}
        on={false}
        onStart={() => onHold.startHold("center")}
        onStop={onHold.stopHold}
      >
        Ctr
      </PadBtn>
      <PadBtn
        disabled={disabled}
        on={false}
        onStart={() => onHold.startHold("right")}
        onStop={onHold.stopHold}
      >
        R
      </PadBtn>
      <span />
      <PadBtn
        disabled={disabled}
        on={false}
        onStart={() => onHold.startHold("down")}
        onStop={onHold.stopHold}
      >
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
  onStart,
  onStop,
}: {
  children: ReactNode;
  on: boolean;
  disabled: boolean;
  onStart: () => void;
  onStop: () => void;
}) {
  return (
    <button
      type="button"
      className={`pad-key ${on ? "is-on" : ""}`}
      disabled={disabled}
      onPointerDown={(e) => {
        if (disabled) return;
        e.preventDefault();
        onStart();
      }}
      onPointerUp={(e) => {
        e.preventDefault();
        onStop();
      }}
      onPointerLeave={(e) => {
        e.preventDefault();
        onStop();
      }}
      onPointerCancel={(e) => {
        e.preventDefault();
        onStop();
      }}
    >
      {children}
    </button>
  );
}
