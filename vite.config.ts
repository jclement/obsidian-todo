import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The SPA lives in web/ and builds to dist/client, which the Bun server serves
// in production. In dev, `vite` runs on :5173 and proxies the backend prefixes
// to the Bun server on :3000 (so cookies, the API, and the WebSocket all work).
const BACKEND = "http://localhost:3000";
const proxied = ["/api", "/login", "/logout", "/setup", "/oauth", "/app", "/mcp", "/.well-known", "/healthz"];

export default defineConfig({
  root: "web",
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "../dist/client",
    emptyOutDir: true,
    assetsDir: "static",
  },
  server: {
    port: 5173,
    proxy: Object.fromEntries(
      proxied.map((p) => [p, { target: BACKEND, changeOrigin: true, ws: p === "/api" }]),
    ),
  },
});
