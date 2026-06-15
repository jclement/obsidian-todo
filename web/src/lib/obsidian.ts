import { useAppCtx } from "../app-context";

/**
 * Open a note in Obsidian. The `obsidian://open` URI needs the vault's exact
 * name (only the user knows it); App handles prompting/remembering via a styled
 * dialog. This hook just exposes that action.
 */
export function useOpenInObsidian() {
  return useAppCtx().openObsidian;
}
