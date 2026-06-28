import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import { connectLiveSync } from "./ws";
import { applyTheme, initThemeListener } from "./theme";
import "./index.css";

applyTheme();
initThemeListener();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5_000, retry: 1, refetchOnWindowFocus: true },
  },
});

connectLiveSync(queryClient);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  // Auto-heal stale shells: when a freshly-deployed SW takes control, reload so
  // the page swaps the cached index.html (which may point at deleted, content-
  // hashed assets) for the current one. Guard on `hadController` so the very
  // first install (no prior controller) doesn't trigger a needless reload, and
  // on `refreshing` so we reload at most once.
  const hadController = !!navigator.serviceWorker.controller;
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing || !hadController) return;
    refreshing = true;
    window.location.reload();
  });
  window.addEventListener("load", () =>
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        // An installed PWA is usually *resumed*, not reloaded, so `load` fires
        // once and never again. Re-check for a newer SW whenever the app returns
        // to the foreground and on a slow timer for long-lived sessions. A newer
        // sw.js (its bytes change every deploy) self-activates via skipWaiting →
        // controllerchange → reload above, so updates land without reinstalling.
        const check = () => reg.update().catch(() => {});
        check();
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") check();
        });
        setInterval(check, 30 * 60 * 1000);
      })
      .catch(() => {}),
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
