export type ThemePref = "system" | "light" | "dark";
const KEY = "obtodo-theme";

export function getThemePref(): ThemePref {
  const v = localStorage.getItem(KEY);
  return v === "light" || v === "dark" || v === "system" ? v : "system";
}

function resolve(pref: ThemePref): boolean {
  return pref === "dark" || (pref === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
}

export function applyTheme(pref: ThemePref = getThemePref()) {
  document.documentElement.classList.toggle("dark", resolve(pref));
}

export function setThemePref(pref: ThemePref) {
  localStorage.setItem(KEY, pref);
  applyTheme(pref);
}

/** Re-apply on OS theme change while in "system" mode. */
export function initThemeListener() {
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (getThemePref() === "system") applyTheme("system");
  });
}
