import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { admin } from "../../adminApi";
import { toast } from "../../toast";
import { Card, btnPrimary, btnPrimaryStyle, input, inputStyle } from "./ui";

export function GuidanceView() {
  const { data } = useQuery({ queryKey: ["admin", "guidance"], queryFn: admin.guidance });
  const [text, setText] = useState("");
  useEffect(() => { if (data !== undefined) setText(data); }, [data]);
  const save = useMutation({
    mutationFn: () => admin.saveGuidance(text),
    onSuccess: () => toast("Guidance saved", "success"),
    onError: (e) => toast(String(e), "error"),
  });

  return (
    <Card title="MCP guidance for agents">
      <p className="mb-3 text-xs" style={{ color: "var(--color-text-3)" }}>
        Appended to the MCP server instructions Claude (and other agents) see on connect. Use it to explain your vault's conventions — note layout, tag meanings, where things live.
      </p>
      <textarea
        className={input + " w-full"}
        style={inputStyle}
        rows={10}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. Projects live in Projects/. #next means a next-action. Weekly notes are in weekly/."
      />
      <div className="mt-3 flex justify-end">
        <button className={btnPrimary} style={btnPrimaryStyle} disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? "Saving…" : "Save"}
        </button>
      </div>
    </Card>
  );
}
