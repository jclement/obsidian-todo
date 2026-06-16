import { useRef } from "react";
import { NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import clsx from "clsx";
import { useCounts } from "../queries";

function Tab({ to, icon, label, badge }: { to: string; icon: string; label: string; badge?: number }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        clsx(
          "relative flex flex-1 flex-col items-center gap-1 py-1.5 text-[0.6875rem] font-medium tracking-tight",
          isActive ? "text-[var(--color-accent-2)]" : "text-[var(--color-text-3)]",
        )
      }
    >
      {({ isActive }) => (
        <>
          <span className={clsx("grid place-items-center rounded-full px-3 py-0.5 text-[1.25rem] leading-none", isActive && "bg-[var(--color-accent-soft)]")}>{icon}</span>
          {label}
          {badge != null && badge > 0 && (
            <span
              className="absolute right-[14%] -top-0.5 grid h-[1.05rem] min-w-[1.05rem] place-items-center rounded-full px-1 text-[0.625rem] font-semibold leading-none tabular-nums text-white"
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
  const hold = useRef<number | undefined>(undefined);
  const fired = useRef(false);

  // Tap = quick add. Press-and-hold (~350ms) = voice dictation, but only when AI
  // is configured (otherwise there's nothing to transcribe into).
  const start = () => {
    fired.current = false;
    if (!aiEnabled) return;
    hold.current = window.setTimeout(() => {
      fired.current = true;
      onVoice();
    }, 350);
  };
  const end = () => {
    window.clearTimeout(hold.current);
    if (!fired.current) onAdd();
  };

  return (
    <nav
      className="safe-x fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] backdrop-blur-xl md:hidden"
      style={{ borderColor: "var(--color-border)", background: "color-mix(in oklab, var(--color-surface) 85%, transparent)" }}
    >
      <Tab to="/" icon="☀" label="Due" badge={counts.data?.today} />
      <Tab to="/inbox" icon="✉" label="Inbox" badge={counts.data?.inbox} />
      <div className="relative flex flex-1 items-center justify-center">
        <motion.button
          whileTap={{ scale: 0.9 }}
          onPointerDown={start}
          onPointerUp={end}
          onPointerLeave={() => window.clearTimeout(hold.current)}
          onContextMenu={(e) => e.preventDefault()}
          aria-label={aiEnabled ? "Tap to add, hold to dictate" : "New task"}
          className="absolute -top-7 grid size-14 place-items-center rounded-full text-white ring-4 ring-[var(--color-bg)] shadow-[0_8px_24px_rgba(124,58,237,.5)]"
          style={{ background: "linear-gradient(160deg, var(--color-accent), var(--color-accent-2))", touchAction: "manipulation" }}
        >
          <span className="text-[1.6rem] leading-none">+</span>
          {aiEnabled && (
            <span className="absolute -bottom-0.5 -right-0.5 grid size-5 place-items-center rounded-full text-[0.6rem] ring-2 ring-[var(--color-bg)]" style={{ background: "var(--color-accent-2)" }}>
              🎙
            </span>
          )}
        </motion.button>
      </div>
      <Tab to="/tags" icon="▦" label="Browse" />
      <Tab to="/settings" icon="⚙" label="Settings" />
    </nav>
  );
}
