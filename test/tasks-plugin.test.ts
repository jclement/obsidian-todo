import { afterEach, beforeEach, expect, test } from "bun:test";
import { VaultStore } from "../src/vault/store.ts";
import { readTasksPluginConfig } from "../src/vault/tasks-plugin.ts";
import { tmpVault, type TmpVault } from "./helpers.ts";

let vault: TmpVault;
afterEach(() => vault?.cleanup());

test("reads global filter + statuses from the Tasks plugin config", async () => {
  vault = tmpVault({
    ".obsidian/plugins/obsidian-tasks-plugin/data.json": JSON.stringify({
      globalFilter: "#todo",
      statusSettings: {
        coreStatuses: [
          { symbol: " ", name: "Todo", type: "TODO" },
          { symbol: "x", name: "Done", type: "DONE" },
        ],
        customStatuses: [
          { symbol: "/", name: "In Progress", type: "IN_PROGRESS" },
          { symbol: "-", name: "Cancelled", type: "CANCELLED" },
          { symbol: "!", name: "Important", type: "TODO" },
        ],
      },
    }),
  });
  const cfg = await readTasksPluginConfig(new VaultStore(vault.dir));
  expect(cfg.available).toBe(true);
  expect(cfg.globalFilter).toBe("#todo");
  expect(cfg.statuses!.map((s) => [s.symbol, s.type])).toEqual([
    [" ", "TODO"],
    ["x", "DONE"],
    ["/", "IN_PROGRESS"],
    ["-", "CANCELLED"],
    ["!", "TODO"],
  ]);
});

test("reports unavailable when the plugin config is absent", async () => {
  vault = tmpVault({ "Inbox.md": "# Inbox\n" });
  const cfg = await readTasksPluginConfig(new VaultStore(vault.dir));
  expect(cfg.available).toBe(false);
});
