import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useTasks } from "../queries";
import { useAppCtx } from "../app-context";
import { Page, ListBody } from "./View";
import { useOpenInObsidian } from "../lib/obsidian";

export function ProjectView() {
  const [params] = useSearchParams();
  const path = params.get("path") ?? "";
  const note = (path.split("/").pop() ?? path).replace(/\.md$/i, "");
  const { setCaptureTarget } = useAppCtx();
  const openInObsidian = useOpenInObsidian();
  const q = useTasks("project:" + path, { path, include_done: "0", sort: "due" });

  // Route quick-add to this project while it's open.
  useEffect(() => {
    setCaptureTarget(path);
    return () => setCaptureTarget(undefined);
  }, [path, setCaptureTarget]);

  return (
    <Page title={note} subtitle={path}>
      <div className="mb-3 -mt-1">
        <button onClick={() => openInObsidian(path)} className="text-xs" style={{ color: "var(--color-accent-2)" }}>
          Open in Obsidian ↗
        </button>
      </div>
      <ListBody loading={q.isLoading} tasks={q.data} empty={{ title: "No open tasks in this note" }} showNote={false} />
    </Page>
  );
}
