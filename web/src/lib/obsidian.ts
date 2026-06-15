import { useBootstrap, useSaveSettings } from "../queries";
import { obsidianUrl } from "./format";

/**
 * Open a note in Obsidian. The `obsidian://open` URI needs the vault's exact
 * name (only the user knows it). The first time, if it hasn't been configured,
 * prompt for it, persist it, then open — so the link is never a dead end.
 */
export function useOpenInObsidian() {
  const { data: boot } = useBootstrap();
  const save = useSaveSettings();
  return (path: string) => {
    const configured = !!boot?.settings.obsidianVaultName?.trim();
    let name = boot?.vaultName || "Vault";
    if (!configured) {
      const entered = window.prompt(
        "What is this vault called in Obsidian?\n(Exactly as shown in Obsidian's vault switcher — case-sensitive. Set once.)",
        name,
      );
      if (!entered || !entered.trim()) return;
      name = entered.trim();
      save.mutate({ obsidianVaultName: name } as never);
    }
    window.location.href = obsidianUrl(name, path);
  };
}
