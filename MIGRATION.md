# Fishbattery Electron to Tauri Migration

This folder is the incremental Tauri runtime migration target. UI files in `tauri/src` are copied from `src/renderer` and must remain visually identical.

Strict phased plan:
- `tauri/PORT_PLAN.md`

## Architecture Rule (Fishbattery)

- Keep API-backed logic in TypeScript (Railway/cloud/auth/cosmetics API flows).
- Port only local/system logic to Rust commands.
- `tauri/compat` now reflects this split:
  - `compat/api.ts` for API-classified methods
  - `compat/system.ts` for system/local methods
  - `compat/method-groups.ts` is the source of truth

## Current Compat Status

- API/system method classification is explicit and complete (`compat/method-groups.ts`).
- `compat/api.ts` and `compat/system.ts` now fail fast for unmapped methods; no runtime fallback to `bridge_invoke`.
- Rust command surface is registered explicitly in `src-tauri/src/main.rs`.
- Updater command path is now wired to real Tauri updater provider flow (`check` -> `download` -> `install`) with updater events/state updates.

## Scope Classification

### Stay in TypeScript (API layer)

- `launcherAccount*`
- `cloudSync*`
- `profile*`
- `capesListOfficial`
- `capesSetOfficialActive`
- `skinsSetOfficialActive`
- `skinsUploadOfficial`
- `modrinthPacksSearch`
- `providerPacksSearch`

### Port to Rust (system layer)

- `versionsList`
- `window*`
- `externalOpen`
- `accounts*`
- `capesListLocal`, `capesGetLocalSelection`, `capesSetLocalSelection`
- `instances*`
- `content*`
- `lockfile*`
- `servers*`
- `mods*`
- `packs*`
- `fabric*`, `loader*`, `vanillaInstall`
- `launch*`
- `rollback*`
- `optimizer*`
- `benchmark*`
- `updater*`
- `diagnosticsExport`
- `preflight*`
- event handlers: `onLaunchLog`, `onUpdaterEvent`

## Execution Policy

1. Keep `tauri/src` UI parity locked.
2. Keep explicit API/system method mapping locked; unmapped methods should hard-fail in compat.
3. Do not move API-layer methods to Rust unless a concrete local-system need appears.

## Phase Status

- Phases 0-8: completed in current branch (command surface + runtime behavior wired through explicit API/system mappings).
- Bridge fallback removal: completed (`bridge_invoke` command path removed from active routing).
- Remaining closeout:
  - Add contract regression tests against Electron payload snapshots (Phase 9 lock step).
  - Validate updater provider environment in CI/release (`FISHBATTERY_UPDATER_PUBKEY`, channel endpoints).
