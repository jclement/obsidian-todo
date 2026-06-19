# Obsidian Todo — native iOS wrapper (Capacitor)

A thin native shell that loads the live web app (`server.url`) in a `WKWebView`.
You keep deploying the web app normally; this wrapper only exists to get:

- **Persistent microphone permission** (native one-time prompt, not the per-use
  PWA prompt iOS shows).
- **Passkeys that keep working** — the WebView runs in the app's context and uses
  your domain's passkeys via the Associated Domains entitlement. **No changes to
  the web app or its WebAuthn flow are needed.**

> Why not a fully dynamic "enter any URL" box? Passkeys are bound to the domain
> compiled into the app's Associated Domains entitlement (and listed in the
> server's AASA file). So the app is pinned to one origin — set it below and
> rebuild if you ever move domains.

## Prerequisites
- macOS with **Xcode** + command line tools, and **CocoaPods** (`sudo gem install cocoapods` or `brew install cocoapods`).
- Node + npm (Capacitor's CLI is npm-based; the rest of this repo uses Bun, but this subfolder is its own npm project).
- Your **Apple Developer Team ID** (Apple Developer → Membership) and a **bundle id** you control, e.g. `net.onewheelgeek.todo`.

## 1. Configure
Edit [`capacitor.config.ts`](capacitor.config.ts):
- `appId` → your bundle id (must match Xcode signing **and** the server's `IOS_APP_ID`).
- `server.url` → your deployed https origin (e.g. `https://todo.onewheelgeek.net`).

## 2. Tell the server about the app (AASA)
The server already serves `/.well-known/apple-app-site-association` — it just needs
the app id. Set this env var on the deployed server and redeploy:

```
IOS_APP_ID=ABCDE12345.net.onewheelgeek.todo     # <TeamID>.<bundleId>
```

Verify it's live (must be JSON, 200, no redirect):

```
curl -i https://todo.onewheelgeek.net/.well-known/apple-app-site-association
# → {"webcredentials":{"apps":["ABCDE12345.net.onewheelgeek.todo"]}}
```

## 3. Generate the iOS project
```
cd apple
npm install
npx cap add ios       # creates apple/ios/ (Xcode project + Pods)
npx cap sync ios
npx cap open ios      # opens Xcode
```

## 4. Xcode settings (one time)
In the `App` target:
1. **Signing & Capabilities → Team**: select your team; set the **Bundle Identifier** to match `appId`.
2. **+ Capability → Associated Domains**, add:
   ```
   webcredentials:todo.onewheelgeek.net
   ```
   (host only, no scheme/path). This is what makes passkeys work.
3. **Info.plist → add `NSMicrophoneUsageDescription`**, e.g.
   `"Used to dictate tasks."` (without this the app crashes when the mic is hit).
4. Build & run on your device (a real device is needed for passkeys + mic).

## 5. Verify
- **Mic:** first dictation → one native iOS permission prompt → never again. ✅
- **Passkeys:** log in with Face ID / Touch ID as usual. If it works, the
  Associated Domains + AASA are correct.

## Updating
The wrapper points at your live URL, so **web changes need no rebuild** — just
deploy. Rebuild the app only when you change the bundle id, domain, icons, or
Capacitor itself.

## Troubleshooting
- **Passkey prompt errors / "not associated"**: the AASA isn't reachable or the
  app id is wrong. Re-check `IOS_APP_ID` (`<TeamID>.<bundleId>`, exact case),
  that the URL returns JSON with no redirect, and that the Associated Domains
  entry host matches your RP ID. Apple caches AASA via its CDN — delete & reinstall
  the app to force a refresh during testing.
- **Passkeys still fail in the WebView** (rare, older iOS): fall back to a native
  passkey shim plugin (`@capacitor/...` community plugins such as
  `@darkedges/capacitor-native-webauthn` or `Cap-go/capacitor-passkey`), which
  forwards `navigator.credentials` to the native API. Not expected to be needed
  for a single-domain app on current iOS.
- **Blank screen**: `server.url` unreachable from the device, or it's http (must
  be https). The placeholder `www/index.html` shows on failure.
- **Service worker / stale shell**: the app loads your live origin, so the
  existing network-first SW + auto-heal apply as in the browser.
