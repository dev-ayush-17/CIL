"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

export type ConsoleView = "dashboard" | "control";

const ViewContext = createContext<{
  view: ConsoleView;
  setView: (v: ConsoleView) => void;
} | null>(null);

export function ViewProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<ConsoleView>("dashboard");
  return <ViewContext.Provider value={{ view, setView }}>{children}</ViewContext.Provider>;
}

export function useView() {
  const ctx = useContext(ViewContext);
  if (!ctx) throw new Error("useView must be used inside ViewProvider");
  return ctx;
}
