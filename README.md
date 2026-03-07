# Fishbattery Launcher

Fishbattery Launcher is a fast, underwater-themed Minecraft launcher focused on clean UX, modded play, and reliable cross-device updates.

## Tech Stack

- Tauri 2
- Rust (native commands)
- TypeScript + Vite (frontend)
- `msmc` (Microsoft authentication)
- Modrinth API

## Repository Layout

- `src/` - frontend UI
- `src-tauri/` - Rust backend (Tauri commands, app config)
- `api/` - API-backed TypeScript methods
- `compat/` - API/system invocation split
- `shared/` - shared TypeScript modules

## Requirements

- Node.js 20+ (Node.js 22 recommended)
- Rust toolchain (stable)
- Platform build prerequisites for Tauri:
  - Windows: Visual Studio C++ Build Tools
  - macOS: Xcode Command Line Tools

## Development

Install dependencies:

```bash
npm install
```

Frontend only (Vite):

```bash
npm run dev
```

Run full Tauri app:

```bash
npm run tauri:dev
```

## Build

Frontend bundle:

```bash
npm run build
```

Desktop app bundles:

```bash
npm run tauri:build
```

## Release

Releases are built in GitHub Actions from tags matching `v*` using `.github/workflows/release.yml`.

Windows signing uses Azure Trusted Signing and requires release-environment secrets/variables.

## Updater Config

The runtime updater uses environment variables (set in GitHub `release` environment for CI):

- `FISHBATTERY_UPDATER_PUBKEY`
- `FISHBATTERY_UPDATER_ENDPOINT_STABLE`
- `FISHBATTERY_UPDATER_ENDPOINT_BETA` (optional, for beta channel)

Tauri artifact signing uses:

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

## Data Location

App data is stored in the platform-specific Tauri app data directory for identifier:

`app.fishbattery.launcher.tauri`

## Contributing

Issues and pull requests are welcome.

## License

Fishbattery Launcher
(c) 2026 Fishbattery

Licensed under the GNU General Public License v3.0.

