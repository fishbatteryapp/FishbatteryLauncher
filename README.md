# Fishbattery Launcher

Fishbattery Launcher is a Tauri-based Minecraft launcher focused on performance presets, modpack install flows, and Fishbattery account/cloud features.

Current app version: `0.4.11`.

## What It Does

- Manages vanilla and modded Minecraft instances.
- Supports Modrinth and provider pack flows from the create/import UI.
- Ships preset-backed installs for:
  - `Max FPS` (Modrinth project `fishbattery-fps`)
  - `PvP Ready` (Modrinth project `fishbattery-pvp`)
- Validates preset loader/version availability and marks unavailable combinations in the UI.
- Supports official Minecraft skins/capes plus Fishbattery cape catalog selection.
- Includes a global sidebar skin/cape mannequin preview.
- Supports Fishbattery account sign-in, cloud sync, and subscription-aware UX.
- Includes update checks/channels, diagnostics, preflight checks, and rollback helpers.

## Tech Stack

- Tauri 2
- Rust (`src-tauri`) for launcher/runtime commands
- TypeScript + Vite (`src`) for renderer UI
- `msmc` for Microsoft account auth flow
- `skinview3d` for 3D skin/cape preview rendering

## Repository Layout

- `src/`: renderer UI (`main.ts`, `index.css`, `index.html`)
- `src-tauri/`: Tauri app + Rust commands
- `api/`: TypeScript API helpers (launcher account, cloud sync, packs search)
- `compat/`: backend invocation compatibility layer
- `shared/`: shared static catalogs/types
- `.github/workflows/release.yml`: tagged release build pipeline
- `RELEASE_STEPS.md`: canonical release checklist and procedures
- `CHANGELOG.md`: versioned release notes

## Requirements

- Node.js 22 recommended (Node 20+ supported)
- npm
- Rust stable toolchain
- Tauri platform prerequisites
  - Windows: Visual Studio C++ Build Tools
  - macOS: Xcode Command Line Tools

## Local Development

Install dependencies:

```bash
npm install
```

Run frontend only:

```bash
npm run dev
```

Run full launcher (Tauri + frontend):

```bash
npm run tauri:dev
```

## Build

Build frontend bundle:

```bash
npm run build
```

Build launcher bundles:

```bash
npm run tauri:build
```

## Environment Configuration

Frontend (`.env`, see `.env.example`):

- `VITE_FISHBATTERY_ACCOUNT_API`
- `VITE_FISHBATTERY_UPGRADE_URL`
- Optional `VITE_FISHBATTERY_ACCOUNT_*_PATH` overrides

Runtime/backend (optional overrides):

- `FISHBATTERY_ACCOUNT_API` / `FISHBATTERY_ACCOUNT_API_URL`
- `FISHBATTERY_ACCOUNT_CAPES_PATH`
- `FISHBATTERY_ACCOUNT_CAPES_PUBLIC_PATH`
- `FISHBATTERY_ACCOUNT_CAPES_SELECTED_PATH`
- `FISHBATTERY_UPDATER_PUBKEY` (or `TAURI_UPDATER_PUBKEY`)
- `FISHBATTERY_UPDATER_ENDPOINT_STABLE` / `FISHBATTERY_UPDATER_ENDPOINT_BETA`

CurseForge provider key:

- `FISHBATTERY_CURSEFORGE_API_KEY`, or
- local file `secrets/curseforge-api-key.txt`

For packaged CI releases, the workflow materializes:

- `src-tauri/resources/secrets/curseforge-api-key.txt`

## Releases

Tagged releases (`v*`) are built by `.github/workflows/release.yml`.

Current release pipeline status:

- Windows release only (`windows-latest`)
- Azure Trusted Signing enabled for Windows artifacts
- Signed assets and updated `latest.json` signatures are uploaded back to the GitHub release

Follow `RELEASE_STEPS.md` for the full process, required secrets, and rebuild instructions.

## App Data

Launcher data is stored in the platform-specific Tauri app-data directory for:

`app.fishbattery.launcher.tauri`

This includes instances metadata, accounts/session caches, capes cache, diagnostics, and runtime artifacts.

## Contributing

Issues and pull requests are welcome.

## License

Fishbattery Launcher
Copyright (C) 2026 Fishbattery

Licensed under the GNU General Public License v3.0.
