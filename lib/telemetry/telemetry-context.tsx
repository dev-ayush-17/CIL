"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useTelemetry } from "./use-telemetry";

type TelemetryApi = ReturnType<typeof useTelemetry>;

const TelemetryContext = createContext<TelemetryApi | null>(null);

export function TelemetryProvider({ children }: { children: ReactNode }) {
  const api = useTelemetry();
  return <TelemetryContext.Provider value={api}>{children}</TelemetryContext.Provider>;
}

export function useTelemetryContext() {
  const ctx = useContext(TelemetryContext);
  if (!ctx) throw new Error("useTelemetryContext must be used inside TelemetryProvider");
  return ctx;
}
