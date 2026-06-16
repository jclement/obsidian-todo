import { useEffect } from "react";

/**
 * Tracks the iOS visual viewport and exposes the on-screen keyboard height as
 * the CSS var --kb on <html>. Bottom sheets bind their `bottom` to it so they
 * ride above the keyboard instead of hiding behind it. No-op where
 * visualViewport is unsupported.
 */
export function useVisualViewport() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const set = () =>
      document.documentElement.style.setProperty(
        "--kb",
        `${Math.max(0, window.innerHeight - vv.height - vv.offsetTop)}px`,
      );
    vv.addEventListener("resize", set);
    vv.addEventListener("scroll", set);
    set();
    return () => {
      vv.removeEventListener("resize", set);
      vv.removeEventListener("scroll", set);
    };
  }, []);
}
