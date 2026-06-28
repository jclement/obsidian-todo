import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Stamp sw.js with the entry chunk's content hash. The hash changes whenever app
// code changes, so sw.js's bytes change every deploy — that byte difference is
// what makes the browser detect a new service worker (and, via skipWaiting +
// controllerchange, reload). Without it, an assets-only deploy leaves sw.js
// identical and an installed PWA never picks up the update.
function stampServiceWorker(): Plugin {
  return {
    name: "stamp-service-worker",
    apply: "build",
    writeBundle(options, bundle) {
      const dir = options.dir;
      if (!dir) return;
      const swPath = join(dir, "sw.js");
      if (!existsSync(swPath)) return;
      const entry = Object.values(bundle).find((c) => c.type === "chunk" && c.isEntry);
      const buildId = entry?.type === "chunk" ? entry.fileName.replace(/.*[-.]([^.]+)\.js$/, "$1") : String(Object.keys(bundle).length);
      writeFileSync(swPath, readFileSync(swPath, "utf8").replace(/__BUILD_ID__/g, buildId));
    },
  };
}

// The SPA lives in web/ and builds to dist/client, which the Bun server serves
// in production. In dev, `vite` runs on :5173 and proxies the backend prefixes
// to the Bun server on :3000 (so cookies, the API, and the WebSocket all work).
const BACKEND = "http://localhost:3000";
// /assets serves the server-rendered pages' CSS + vendored JS (htmx, webauthn,
// auth-client); login/setup break without it. /api carries the WebSocket.
const proxied = ["/api", "/assets", "/login", "/logout", "/setup", "/oauth", "/mcp", "/.well-known", "/healthz"];

export default defineConfig({
  root: "web",
  plugins: [react(), tailwindcss(), stampServiceWorker()],
  build: {
    outDir: "../dist/client",
    emptyOutDir: true,
    assetsDir: "static",
  },
  server: {
    port: 5173,
    proxy: Object.fromEntries(
      // changeOrigin:false keeps the Host header as localhost:5173 so the backend
      // (proxy-derived origin mode) resolves its public origin to :5173 — which is
      // what the browser signs for WebAuthn. With changeOrigin:true the passkey
      // ceremony fails with an origin mismatch (server thinks it's :3000).
      proxied.map((p) => [p, { target: BACKEND, changeOrigin: false, ws: p === "/api" }]),
    ),
  },
});
