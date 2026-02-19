# Fishbattery Codebase Map

This map is for fast navigation: where each major feature lives, and which file is the entry point.

## Repos / Modules

- `src/` (main Electron launcher app)
- `fishbattery-web/` (static website)
- `fishbattery-auth-api/` (account/auth/cloud API)
- `launcher-cape-bridges/` (Minecraft cape bridge mod sources)

## Launcher (`src/`)

- `src/renderer/index.html`
  - Main launcher UI shell (sidebar, topbar, views, modal containers).
- `src/renderer/main.ts`
  - Main frontend controller for launcher UI.
  - Handles view switching, instance CRUD, settings, profile showcase, capes UI, sponsored cards, and most button handlers.
- `src/renderer/index.css`
  - Launcher styling and theme system.
- `src/preload/preload.ts`
  - Safe bridge exposing IPC functions to renderer via `window.api`.
- `src/main/main.ts`
  - Electron process bootstrap.
- `src/main/ipc.ts`
  - IPC handlers used by renderer (`external:open`, instances/mods/packs/accounts/cloud sync, etc.).
- `src/main/launcherAccount.ts`
  - Fishbattery account session management and API sync from desktop app.
- `src/main/updater.ts`
  - Auto-update orchestration.

## Website (`fishbattery-web/`)

- `fishbattery-web/index.html`
  - Marketing landing page.
- `fishbattery-web/download.html` + `fishbattery-web/download.js`
  - Release asset fetching + download links from GitHub releases.
- `fishbattery-web/login.html` + `fishbattery-web/login.js`
  - Web login/create account UI.
- `fishbattery-web/account.html` + `fishbattery-web/account.js`
  - Profile editing, password, 2FA, privacy/data export/delete.
- `fishbattery-web/site-nav.js`
  - Shared auth-aware topbar behavior across pages.
- `fishbattery-web/ads.js`
  - Sponsored slot rendering and AdSense/fallback ad handling.
- `fishbattery-web/consent.js`
  - Consent banner + ad consent state/event handling.
- `fishbattery-web/styles.css`
  - Shared site styling.

## Auth API (`fishbattery-auth-api/`)

- `fishbattery-auth-api/src/index.ts`
  - Full API entrypoint (Express app).
  - Auth, Google OAuth desktop flow, profiles, 2FA, cloud sync, capes, billing, GDPR endpoints.
- `fishbattery-auth-api/schema.sql`
  - Database tables and indexes.

## Cape Bridge (`launcher-cape-bridges/`)

- `launcher-cape-bridges/src/client/resources/fishbattery-cape-bridge.client.mixins.json`
  - Client mixin config.
- `launcher-cape-bridges/sources/**`
  - Bridge source implementations by loader/version.

## Fast “Where is X?” Index

- Account login/session (launcher): `src/main/launcherAccount.ts`, `src/renderer/main.ts`
- Web account UI: `fishbattery-web/account.html`, `fishbattery-web/account.js`
- Cloud sync: `src/main/launcherAccount.ts`, `src/renderer/main.ts`, `fishbattery-auth-api/src/index.ts`
- Capes (launcher): `src/renderer/main.ts`, `src/main/ipc.ts`, `src/main/bridgeInstaller.ts`
- Capes (API): `fishbattery-auth-api/src/index.ts` (`/v1/capes/*`)
- Updater: `src/main/updater.ts`, `src/renderer/main.ts`
- Sponsored/ads: `src/renderer/main.ts` (launcher sponsored card), `fishbattery-web/ads.js`
- GDPR/export/delete (web+API): `fishbattery-web/account.js`, `fishbattery-auth-api/src/index.ts`

