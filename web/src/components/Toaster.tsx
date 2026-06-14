import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { ToastMsg } from "../toast";

export function Toaster() {
  const [toasts, setToasts] = useState<ToastMsg[]>([]);

  useEffect(() => {
    const onToast = (e: Event) => {
      const t = (e as CustomEvent<ToastMsg>).detail;
      setToasts((cur) => [...cur, t]);
      setTimeout(() => setToasts((cur) => cur.filter((x) => x.id !== t.id)), 3500);
    };
    window.addEventListener("toast", onToast);
    return () => window.removeEventListener("toast", onToast);
  }, []);

  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            className="pointer-events-auto rounded-lg border px-4 py-2 text-sm shadow-lg"
            style={{
              background: "var(--color-surface-2)",
              borderColor: t.kind === "error" ? "var(--color-red)" : t.kind === "success" ? "var(--color-green)" : "var(--color-border-strong)",
              color: "var(--color-text)",
            }}
          >
            {t.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
