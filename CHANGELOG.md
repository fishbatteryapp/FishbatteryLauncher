# Changelog

## v0.4.10 - 2026-03-12

### Added
- Added preset-backed Modrinth pack installs for:
  - `Max FPS` -> `fishbattery-fps`
  - `PvP Ready` -> `fishbattery-pvp`
- Added loader/version compatibility checks for pack-backed presets in the create/edit modal.
- Added launcher startup sign-in prompt when no Fishbattery account session is active.

### Changed
- Preset availability UI now shows explicit state:
  - `Checking upload availability...`
  - `Not uploaded for <loader> <version>`
- Non-pack presets now display `(coming soon)` and are unselectable.
- Release workflow is temporarily Windows-only.
- Auth API access token TTL is now configurable via `ACCESS_TOKEN_TTL` / `AUTH_ACCESS_TOKEN_TTL` (default `30d`).

### Fixed
- Cloud sync auth failures now invalidate stale launcher sessions and prompt re-auth cleanly (`Session expired. Please sign in again.`).
- CurseForge browse missing-key UX now shows a clear, actionable message instead of raw provider error text.
- Release workflow now materializes `src-tauri/resources/secrets/curseforge-api-key.txt` from `FISHBATTERY_CURSEFORGE_API_KEY` during CI builds.
