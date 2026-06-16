import { useEffect } from "react";

const root = () => document.documentElement;
const isEditable = (el: Element | null) =>
  el instanceof HTMLElement && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);

/**
 * Tracks the iOS visual viewport and publishes two CSS vars on <html>:
 *   --kb  on-screen keyboard height (bottom sheets bind their `bottom` to it)
 *   --vvh the visible viewport height (sheets cap their max-height to it, which
 *         stays correct in landscape and under either Android keyboard model)
 *
 * When focus leaves all editable elements (or the page is hidden) we force --kb
 * back to 0: closing a Radix dialog unmounts the input without a blur, so iOS
 * may not fire a viewport resize and a stale --kb would offset the next fixed
 * element. No-op where visualViewport is unsupported.
 */
export function useVisualViewport() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const set = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      root().style.setProperty("--kb", `${kb}px`);
      root().style.setProperty("--vvh", `${vv.height}px`);
    };
    const reset = () => {
      if (!isEditable(document.activeElement)) root().style.setProperty("--kb", "0px");
    };
    vv.addEventListener("resize", set);
    vv.addEventListener("scroll", set);
    // focusout bubbles; defer so document.activeElement settles after the blur.
    const onFocusOut = () => queueMicrotask(reset);
    window.addEventListener("focusout", onFocusOut);
    window.addEventListener("pagehide", reset);
    set();
    return () => {
      vv.removeEventListener("resize", set);
      vv.removeEventListener("scroll", set);
      window.removeEventListener("focusout", onFocusOut);
      window.removeEventListener("pagehide", reset);
    };
  }, []);
}
