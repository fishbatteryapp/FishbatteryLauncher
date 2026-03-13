# Changelog

## v0.4.15-beta.1 - 2026-03-14

### Fixed
- Fixed legacy Forge launches failing when `lzma:lzma:0.0.1` was resolved against Maven Central instead of Forge's Maven.
- Fixed additional Windows command prompt flashes during launch-time Java runtime checks and legacy loader installer execution.

## v0.4.14 - 2026-03-14

### Changed
- Microsoft account sign-in now uses a Rust-native browser/device-code flow in the Tauri backend instead of the bundled Node/MSMC helper runtime.

### Fixed
- Fixed Microsoft account sign-in failing after browser approval during the Xbox/Minecraft token exchange.
- Fixed launcher auth errors surfacing as `[object Object]` instead of a readable sign-in failure message.

## v0.4.13 - 2026-03-13

### Changed
- Microsoft account sign-in now completes in the system browser using a localhost callback flow instead of MSMC's built-in popup launcher flow.

### Fixed
- Fixed Microsoft login hitting Microsoft's removed `oauth20_desktop.srf` redirect page during account connection.
- Fixed repeated Windows registry lookup errors during Microsoft sign-in on systems where MSMC could not resolve a compatible browser path.

## v0.4.11 - 2026-03-13

### Added
- Added resilient Forge profile fallback for legacy installers by importing/deriving profile data when the installer does not generate a launcher profile.
- Added Modrinth `.mrpack` dependency parsing so installs can use pack-declared Minecraft/loader versions directly.

### Changed
- Loader installer resolution now tries legacy Forge version forms automatically (including `mc-loader` and `mc-loader-mc`) and keeps the resolved installer version in instance metadata.
- Skin/cape sidebar mannequin is now initialized globally and kept active across pages instead of only after opening Skin & Capes.
- Launcher dialogs (`alert`/`confirm`/`prompt`) now use the unified Fishbattery modal style.
- Sidebar mannequin UI now renders as a single card block (removed nested inner card frame).

### Fixed
- Fixed old Forge preset launches failing with `installer completed but no launch profile was generated`.
- Fixed Windows launch-time command prompt flashes by hiding console windows for Java probes and hook command execution.
- Fixed Modrinth pack installs choosing wrong compatibility versions in some Forge scenarios (for example PvP 1.8.9 selecting 1.12.2).
- Fixed launcher cape catalog sync to merge authenticated and public cape payloads, improving visibility of newly added free capes.
- Improved Minecraft session-expired messaging for official skin/cape update/upload calls.

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
