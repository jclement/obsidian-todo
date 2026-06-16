import type { Database } from "bun:sqlite";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { csrf } from "hono/csrf";
import { StreamableHTTPTransport } from "@hono/mcp";
import type { Config } from "./config.ts";
import type { VaultContext } from "./mcp/context.ts";
import { createMcpServer } from "./mcp/server.ts";
import {
  hostGuard,
  mcpOriginGuard,
  rateLimit,
  requireBearer,
  requireSession,
  resolveOriginMiddleware,
  securityHeaders,
  type AuthEnv,
} from "./auth/middleware.ts";
import { abortRegistry, hashToken } from "./auth/tokens.ts";
import { oauthInteractiveRouter, oauthPublicRouter, wellKnownRouter } from "./oauth/router.ts";
import { setupRouter, type SetupState } from "./web/routes/setup.tsx";
import { loginRouter } from "./web/routes/login.tsx";
import { recordMcpCall } from "./audit.ts";
import type { SyncSupervisor } from "./sync/supervisor.ts";
import type { TaskAppContext } from "./tasks/app-context.ts";
import { apiRouter } from "./web/routes/api.ts";
import { adminApiRouter } from "./web/routes/admin-api.ts";
import { upgradeWebSocket } from "./web/ws.ts";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface AppDeps {
  config: Config;
  db: Database;
  vaultCtx: VaultContext;
  taskCtx: TaskAppContext;
  setupState: SetupState;
  sync?: SyncSupervisor;
}

const SPA_DIR = "./dist/client";

export type AppEnv = AuthEnv & {
  Variables: AuthEnv["Variables"] & {
    deps: AppDeps;
  };
};

export function createApp(deps: AppDeps) {
  const { config, db } = deps;
  const app = new Hono<AppEnv>();

  app.use("*", async (c, next) => {
    c.set("deps", deps);
    await next();
  });
  app.use("*", securityHeaders());
  app.use("*", resolveOriginMiddleware(config));
  app.use("*", hostGuard(db, config));

  // CSRF: a request is same-origin when its Origin header matches this
  // request's resolved public origin (works in fixed and derived modes).
  const sameOriginCsrf = csrf({ origin: (origin, c) => origin === c.get("publicOrigin") });

  app.get("/healthz", (c) => c.json({ ok: true }));
  app.use("/assets/*", serveStatic({ root: "./public", rewriteRequestPath: (p) => p.replace(/^\/assets/, "") }));

  // --- OAuth metadata + public endpoints ---
  app.route("/.well-known", wellKnownRouter());
  app.use("/oauth/token", rateLimit("oauth", 30));
  app.use("/oauth/register", rateLimit("oauth", 30));
  app.route("/oauth", oauthPublicRouter(db));

  // --- OAuth interactive (passkey session + consent) ---
  app.use("/oauth/authorize", requireSession(db, { redirect: true }));
  app.use("/oauth/consent", requireSession(db, { redirect: true }), sameOriginCsrf);
  app.route("/oauth", oauthInteractiveRouter(db));

  // --- Setup & login ---
  app.use("/setup/*", rateLimit("setup", 10));
  app.use("/setup", rateLimit("setup", 10));
  app.route("/setup", setupRouter(db, config, deps.setupState));
  app.use("/login/*", rateLimit("login", 10));
  app.use("/logout", sameOriginCsrf);
  app.route("/", loginRouter(db, config));

  // --- Task API + live WebSocket (passkey session) ---
  // JSON-API CSRF: state-changing calls must carry a custom header that a
  // cross-site form/img cannot set without a CORS preflight we never approve.
  // Combined with the SameSite=Lax session cookie this is solid and, unlike an
  // Origin check, survives the Vite dev proxy.
  app.use("/api/*", requireSession(db, { redirect: false }), async (c, next) => {
    if (c.req.method !== "GET" && c.req.method !== "HEAD" && c.req.header("x-obtodo-csrf") !== "1") {
      return c.json({ error: "csrf", message: "missing X-Obtodo-Csrf header" }, 403);
    }
    await next();
  });
  app.get(
    "/api/ws",
    requireSession(db, { redirect: false }),
    upgradeWebSocket(() => {
      let client: { send(data: string): void } | null = null;
      return {
        onOpen(_evt, ws) {
          client = ws;
          deps.taskCtx.hub.add(ws);
          ws.send(JSON.stringify({ type: "hello", serverTime: Date.now() }));
        },
        onClose() {
          if (client) deps.taskCtx.hub.remove(client);
        },
      };
    }),
  );
  app.route("/api", apiRouter(deps.taskCtx, db, config, () => deps.sync?.status() ?? null));
  app.route("/api/admin", adminApiRouter());

  // --- MCP endpoint (bearer auth) ---
  app.use("/mcp", mcpOriginGuard(), requireBearer(db));
  app.all("/mcp", async (c) => {
    const transport = new StreamableHTTPTransport();
    const principal = c.var.principal!;
    const server = createMcpServer(deps.taskCtx, {
      onToolCall: (tool, args, result) =>
        recordMcpCall(
          db,
          principal,
          tool,
          args,
          result.isError ? "error" : "ok",
          result.isError ? firstText(result) : undefined,
        ),
    });
    await server.connect(transport);
    // revoking the token kills any live SSE stream for it immediately
    const token = c.var.bearerToken!;
    const unregister = abortRegistry.register(hashToken(token), () => void transport.close());
    transport.onclose = unregister;
    return transport.handleRequest(c);
  });

  // --- SPA: the task application at "/" + client-side routing fallback ---
  // The whole UI (incl. admin/settings) is the React SPA; admin data is served
  // by /api/admin above. Only setup/login/oauth-consent stay server-rendered.
  // Mounted last so every explicit route above wins. serveStatic falls through
  // to the index.html fallback when a path isn't a real file (client routes).

  // The SW script and the HTML shell must always revalidate, so a redeploy is
  // picked up immediately — otherwise a heuristically-cached shell can keep
  // pointing at deleted, content-hashed assets. (The /static/* assets are
  // immutable and stay cacheable, served by serveStatic below.)
  app.get("/sw.js", (c) => {
    const p = join(SPA_DIR, "sw.js");
    if (!existsSync(p)) return c.text("Not found", 404);
    c.header("Cache-Control", "no-cache");
    c.header("Content-Type", "text/javascript; charset=utf-8");
    return c.body(readFileSync(p));
  });
  app.get("/", (c) => {
    const index = join(SPA_DIR, "index.html");
    if (!existsSync(index)) return c.text("SPA not built. Run `mise run build`. In dev, open the Vite dev server.", 503);
    c.header("Cache-Control", "no-cache");
    return c.html(readFileSync(index, "utf8"));
  });

  app.use("/*", serveStatic({ root: SPA_DIR }));
  app.get("/*", (c) => {
    // Only client-side ROUTES fall back to index.html. A request that looks like
    // a file (has an extension, e.g. a stale /static/*.js) must 404 — never
    // return HTML for it, or the browser gets text/html for a module script.
    if (/\.[a-z0-9]+$/i.test(c.req.path)) return c.text("Not found", 404);
    const index = join(SPA_DIR, "index.html");
    if (existsSync(index)) { c.header("Cache-Control", "no-cache"); return c.html(readFileSync(index, "utf8")); }
    return c.text("SPA not built. Run `mise run build` (or `vite build`). In dev, open the Vite dev server.", 503);
  });

  return app;
}

/** First line of a tool result's text content, for the audit detail column. */
function firstText(result: { content?: { type: string; text?: string }[] }): string | undefined {
  const block = result.content?.find((b) => b.type === "text");
  return block?.text?.split("\n")[0]?.slice(0, 200);
}
