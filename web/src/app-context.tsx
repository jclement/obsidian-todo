import { createContext, useContext } from "react";
import type { Task } from "./types";

export interface AppCtx {
  vaultName: string;
  aiEnabled: boolean;
  openEditor: (t: Task) => void;
  /** Note that quick-add targets (set by the project view). */
  captureTarget?: string;
  setCaptureTarget: (note: string | undefined) => void;
}

export const AppContext = createContext<AppCtx | null>(null);

export function useAppCtx(): AppCtx {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppCtx outside provider");
  return ctx;
}
