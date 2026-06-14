import { useRef, useState } from "react";
import { api } from "../api";
import { toast } from "../toast";

/**
 * Records mic audio in the browser and sends it to the server (Whisper) for
 * transcription. Works on every browser including iOS Safari, unlike the Web
 * Speech API. Requires an OpenAI key configured in Settings.
 */
export function DictateButton({ enabled, onText }: { enabled: boolean; onText: (text: string) => void }) {
  const [state, setState] = useState<"idle" | "recording" | "transcribing">("idle");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const start = async () => {
    if (!enabled) {
      toast("Add an OpenAI key in Settings to enable dictation", "info");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setState("transcribing");
        try {
          const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
          const text = await api.transcribe(blob);
          if (text) onText(text);
          else toast("Didn't catch that", "info");
        } catch (e) {
          toast(e instanceof Error ? e.message : "Transcription failed", "error");
        } finally {
          setState("idle");
        }
      };
      rec.start();
      recorderRef.current = rec;
      setState("recording");
    } catch {
      toast("Microphone permission denied", "error");
    }
  };

  const stop = () => recorderRef.current?.stop();

  return (
    <button
      type="button"
      onClick={state === "recording" ? stop : start}
      title="Dictate tasks"
      className="grid size-9 shrink-0 place-items-center rounded-md border text-sm transition-colors"
      style={{
        borderColor: state === "recording" ? "var(--color-red)" : "var(--color-border-strong)",
        background: state === "recording" ? "var(--color-red)" : "transparent",
        color: state === "recording" ? "white" : "var(--color-text-2)",
      }}
    >
      {state === "transcribing" ? "…" : state === "recording" ? "■" : "🎙"}
    </button>
  );
}
