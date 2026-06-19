import type { CapacitorConfig } from "@capacitor/cli";

// Thin native wrapper: the app just loads the live web app in a WKWebView.
// You keep deploying the web app as normal; this shell rarely changes.
//
// Two things must agree for passkeys to work:
//   1. server.url host below
//   2. the Associated Domains entitlement (webcredentials:<host>) in Xcode
//   3. the server's /.well-known/apple-app-site-association naming this app
//      (set IOS_APP_ID="<TeamID>.<appId>" on the server)
const config: CapacitorConfig = {
  appId: "net.onewheelgeek.todo", // ← your bundle id (must match Xcode + AASA)
  appName: "Obsidian Todo",
  webDir: "www", // placeholder; the real UI is loaded from server.url
  server: {
    url: "https://todo.onewheelgeek.net", // ← your deployed https origin
    // The app only ever navigates to your origin; keep it https.
  },
  ios: {
    // We deliberately allow navigations to your remote origin.
    limitsNavigationsToAppBoundDomains: false,
    contentInset: "always",
  },
};

export default config;
