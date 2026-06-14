import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { api } from "../api";
import { toast } from "../toast";

/**
 * Voice capture (key `v`). Opens straight into recording with a big throbbing
 * mic; on stop it transcribes (Whisper) and hands the text to AI capture.
 */
export function VoiceModal({
  open,
  onClose,
  aiEnabled,
  onTranscript,
}: {
  open: boolean;
  onClose: () => void;
  aiEnabled: boolean;
  onTranscript: (text: string) => void;
}) {
  const [state, setState] = useState<"idle" | "recording" | "transcribing">("idle");
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (!open) return;
    if (!aiEnabled) {
      toast("Add an OpenAI key in Settings to use voice capture", "info");
      onClose();
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        const rec = new MediaRecorder(stream);
        chunksRef.current = [];
        rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
        rec.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          setState("transcribing");
          try {
            const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
            const text = await api.transcribe(blob);
            if (text) onTranscript(text);
            else toast("Didn't catch that", "info");
          } catch (e) {
            toast(e instanceof Error ? e.message : "Transcription failed", "error");
          } finally {
            setState("idle");
            onClose();
          }
        };
        rec.start();
        recRef.current = rec;
        setState("recording");
      } catch {
        toast("Microphone permission denied", "error");
        onClose();
      }
    })();
    return () => {
      cancelled = true;
      if (recRef.current && recRef.current.state !== "inactive") {
        try { recRef.current.stream.getTracks().forEach((t) => t.stop()); } catch {}
      }
    };
  }, [open, aiEnabled, onClose, onTranscript]);

  const stop = () => recRef.current?.state === "recording" && recRef.current.stop();

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && (recRef.current?.state === "recording" ? stop() : onClose())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 flex w-[min(90vw,22rem)] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-6 rounded-2xl border p-8 shadow-2xl outline-none"
          style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
        >
          <Dialog.Title className="text-sm font-medium" style={{ color: "var(--color-text-2)" }}>
            {state === "transcribing" ? "Transcribing…" : "Listening… speak your tasks"}
          </Dialog.Title>

          <button onClick={stop} disabled={state !== "recording"} className="relative grid size-28 place-items-center" aria-label="Stop recording">
            {state === "recording" && (
              <>
                <span className="mic-ring absolute inset-0 rounded-full" style={{ background: "var(--color-accent)" }} />
                <span className="mic-ring absolute inset-0 rounded-full" style={{ background: "var(--color-accent)", animationDelay: "0.5s" }} />
              </>
            )}
            <span
              className="relative grid size-24 place-items-center rounded-full text-4xl text-white transition-transform active:scale-95"
              style={{ background: state === "transcribing" ? "var(--color-surface-3)" : "var(--color-accent)" }}
            >
              {state === "transcribing" ? "…" : "🎙"}
            </span>
          </button>

          <p className="text-center text-xs" style={{ color: "var(--color-text-3)" }}>
            {state === "recording" ? "Tap the mic when you're done" : "Processing your audio"}
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
