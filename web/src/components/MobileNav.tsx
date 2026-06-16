import { useEffect, useRef } from "react";
import { NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import clsx from "clsx";
import { Inbox, LayoutGrid, Mic, Plus, Settings2, Sun, type LucideIcon } from "lucide-react";
import { useCounts } from "../queries";

function Tab({ to, icon: Icon, label, badge }: { to: string; icon: LucideIcon; label: string; badge?: number }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        clsx(
          "relative flex min-h-[44px] flex-1 flex-col items-center justify-center gap-1 py-1.5 text-[0.6875rem] font-medium tracking-tight outline-none focus-visible:rounded-lg focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]",
          isActive ? "text-[var(--color-accent-2)]" : "text-[var(--color-text-2)]",
        )
      }
    >
      {({ isActive }) => (
        <>
          <span className={clsx("grid place-items-center rounded-full px-3 py-0.5", isActive && "bg-[var(--color-accent-soft)]")}><Icon className="size-[1.3rem]" strokeWidth={isActive ? 2.4 : 2} /></span>
          {label}
          {badge != null && badge > 0 && (
            <span
              className="absolute right-[14%] top-0.5 grid h-[1.05rem] min-w-[1.05rem] place-items-center rounded-full px-1 text-[0.625rem] font-semibold leading-none tabular-nums text-white"
              style={{ background: "var(--color-accent)" }}
            >
              {badge > 99 ? "99+" : badge}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

export function MobileNav({ onAdd, onVoice, aiEnabled }: { onAdd: () => void; onVoice: () => void; aiEnabled: boolean }) {
  const counts = useCounts();
  const navRef = useRef<HTMLElement>(null);
  const hold = useRef<number | undefined>(undefined);
  const fired = useRef(false);
  const origin = useRef<{ x: number; y: number } | null>(null);

  // Publish the REAL rendered bar height (varies with the safe-area inset) so the
  // scroll container's bottom padding tracks it instead of a guessed constant.
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const publish = () => document.documentElement.style.setProperty("--nav-h", `${el.offsetHeight}px`);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const clear = () => window.clearTimeout(hold.current);

  // Tap = quick add. Press-and-hold (~350ms) = voice dictation, but only when AI
  // is configured. We capture the pointer and abort on movement / cancel so a
  // scroll-takeover or wobble never spuriously fires add or voice.
  const start = (e: React.PointerEvent) => {
    fired.current = false;
    origin.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (!aiEnabled) return;
    hold.current = window.setTimeout(() => {
      fired.current = true;
      onVoice();
    }, 350);
  };
  const move = (e: React.PointerEvent) => {
    const o = origin.current;
    if (o && Math.hypot(e.clientX - o.x, e.clientY - o.y) > 10) clear();
  };
  const up = () => {
    clear();
    if (!fired.current && origin.current) onAdd();
    origin.current = null;
  };
  const cancel = () => {
    clear();
    fired.current = false;
    origin.current = null;
  };

  return (
    <nav
      ref={navRef}
      className="safe-x fixed inset-x-0 bottom-0 z-40 flex select-none items-stretch border-t pt-1 pb-[max(0.375rem,env(safe-area-inset-bottom))] backdrop-blur-xl md:hidden"
      style={{ borderColor: "var(--color-border)", background: "color-mix(in oklab, var(--color-surface) 85%, transparent)" }}
    >
      <Tab to="/" icon={Sun} label="Due" badge={counts.data?.today} />
      <Tab to="/inbox" icon={Inbox} label="Inbox" badge={counts.data?.inbox} />
      <div className="relative flex w-16 shrink-0 items-center justify-center">
        <motion.button
          whileTap={{ scale: 0.9 }}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={cancel}
          onContextMenu={(e) => e.preventDefault()}
          aria-label={aiEnabled ? "Tap to add, hold to dictate" : "New task"}
          className="absolute -top-7 grid size-14 select-none place-items-center rounded-full text-white outline-none ring-4 ring-[var(--color-surface)] shadow-[0_8px_24px_rgba(124,58,237,.5)] focus-visible:ring-[var(--color-accent-2)]"
          style={{ background: "linear-gradient(160deg, var(--color-accent), var(--color-accent-2))", touchAction: "none", WebkitUserSelect: "none", userSelect: "none", WebkitTouchCallout: "none" }}
        >
          <Plus className="size-7" strokeWidth={2.5} />
          {aiEnabled && (
            <span className="absolute -bottom-0.5 -right-0.5 grid size-5 place-items-center rounded-full ring-2 ring-[var(--color-surface)]" style={{ background: "var(--color-accent-2)" }}>
              <Mic className="size-3 text-white" />
            </span>
          )}
        </motion.button>
      </div>
      <Tab to="/tags" icon={LayoutGrid} label="Browse" />
      <Tab to="/settings" icon={Settings2} label="Settings" />
    </nav>
  );
}
