# Fishbattery Tauri Port Plan (Strict, Source-Audited)

Scope: migrate Electron runtime in `src/main` + `src/preload` to Tauri while preserving renderer behavior.

Audit basis:
- full `src/` file inventory read
- preload surface from `src/preload/preload.ts`
- IPC and module routing from `src/main/ipc.ts`

## Current status

- Phase 0: complete (state/error/events scaffolding in `src-tauri`).
- Phase 1: complete (`window*`, `externalOpen`, `versionsList` explicit Rust commands).
- Phase 2: complete for accounts + capes path (`accounts*`, local capes entitlement, official Minecraft capes/skins commands).
- Phase 3: complete for API extraction (`launcherAccount*`, `cloudSync*`, `profile*`, `modrinthPacksSearch`, `providerPacksSearch`, official cosmetics API mapping explicit in `compat/api.ts`).
- Phase 4: complete (instances/icons/content/lockfile/servers command surface now explicitly mapped in Tauri runtime).
- Phase 6: complete (mods/packs runtime command surface now explicitly mapped with catalog state persistence and refresh flows).
- Runtime unblock after Phase 3: CSP + capability permissions fixed for Tauri IPC/event/devtools in dev (`src/index.html`, `src-tauri/capabilities/default.json`).
- Sequence exception approved (2026-03-01): execute Phase 7 before fully closing Phase 5 because launch/rollback + bridge enforcement are required to validate remaining installer/provider behavior end-to-end.

## Rust module naming policy

- Do not create new command modules named by phase number (`phaseX.rs`).
- Use domain-focused module files under `src-tauri/src/commands/` so ownership is obvious:
  - `window_shell.rs` (window + external + version listing)
  - `accounts_capes.rs` (minecraft accounts + local/official cosmetics commands)
  - `runtime_ops.rs` (instances/content/servers/installers/loaders/mod runtime)
  - `system_health.rs` (preflight/health checks)
- Keep phase numbers only in this plan document for sequencing, not in Rust filenames.
- When adding new commands, place them in the domain module that matches Electron source ownership.

## Source-truth module map (Electron)

- Window/app lifecycle: `main.ts`, `ipc.ts`
- Security/input guards: `security.ts`
- Minecraft account auth/session/capes/skins: `accounts.ts`
- Launcher account/cloud/profile APIs: `launcherAccount.ts`, `cloudSync.ts`, `profileShowcase.ts`, `capes.ts`
- Instances/icons/transfer/lockfiles/content/servers: `instances.ts`, `instanceIcons.ts`, `instanceTransfer.ts`, `instanceLockfile.ts`, `content.ts`, `servers.ts`
- Installers/catalog/loader: `modrinth.ts`, `modrinthPacks.ts`, `providerPacks.ts`, `packArchiveImport.ts`, `fabric.ts`, `fabricInstall.ts`, `fabricMeta.ts`, `loaderSupport.ts`, `vanillaInstall.ts`, `mojangInstall.ts`
- Mods/packs runtime: `mods.ts`, `modValidation.ts`, `bridgeInstaller.ts`, `packs.ts`
- Launch + diagnosis + rollback: `launch.ts`, `launchDiagnostics.ts`, `rollback.ts`
- System tooling/update: `optimizer.ts`, `benchmark.ts`, `updater.ts`, `diagnostics.ts`, `preflight.ts`

## Architecture boundary (target)

- Keep in TS API layer (Fishbattery backend calls):
  - `launcherAccount*`, `cloudSync*`, `profile*`
  - official cosmetics endpoints (`capesListOfficial`, `capesSetOfficialActive`, `skinsSetOfficialActive`, `skinsUploadOfficial`)
  - optional TS-only searches (`modrinthPacksSearch`, `providerPacksSearch`)
- Port to Rust system layer:
  - local filesystem/process/window/runtime operations
  - launcher engine commands from IPC surface

## Phase 2 (revised): Accounts + Local Capes

Progress:
- 2A complete for functional parity of account add/list/set/remove/avatar paths.
- `accounts_add` performs real Microsoft/Minecraft login via MSMC helper (`scripts/tauri-msmc-login.mjs`) with framework fallback (`raw` then `electron`) and helpful blocked-login errors.
- `accounts_get_avatar(refresh=true)` refreshes avatar cache from Crafatar/MC-Heads.
- 2B local capes list/selection now enforce entitlement parity:
  - founder tier filtered from list when launcher tier is not founder
  - selection auto-clears when tier access is lost
  - set selection rejects unauthorized premium/founder cape IDs with Electron-compatible messages

Phase 2 progress report (implemented):
- Added official Minecraft cosmetics Rust commands and wiring:
  - `capes_list_official`
  - `capes_set_official_active`
  - `skins_set_official_active`
  - `skins_upload_official`
- Added founder entitlement sync path:
  - new Rust command `launcher_accounts_sync`
  - Tauri launcher-account TS mirrors account-tier DB to `appData/data/launcher-accounts.json`
- Startup reliability fix tied to Phase 2 validation:
  - guarded `refreshAll()` against missing command failures so account/cape state still renders
- Validation completed:
  - `cargo check` passing
  - `npm run build` passing

Follow-up (non-blocking to 2A completion):
- replace helper-script dependency with native Rust auth path if/when selected.
- add deeper token refresh parity in the same layer that will own official Minecraft API calls.

### 2A: Real Minecraft account auth (required)

Why separate: current Tauri `accounts_add` is intentionally blocked and must be replaced with real auth.

Rust commands (exact signatures):
- `accounts_list(app: tauri::AppHandle) -> Result<AccountsDb, String>`
- `accounts_get_avatar(app: tauri::AppHandle, id: String, refresh: Option<bool>) -> Result<Option<String>, String>`
- `accounts_add(app: tauri::AppHandle) -> Result<StoredAccount, String>`
- `accounts_set_active(app: tauri::AppHandle, id: Option<String>) -> Result<AccountsDb, String>`
- `accounts_remove(app: tauri::AppHandle, id: String) -> Result<(), String>`

Dependency mapping:
- `ipc.ts`: `accounts:list`, `accounts:getAvatar`, `accounts:add`, `accounts:setActive`, `accounts:remove`
- `accounts.ts`: `addMicrosoftAccountInteractive`, refresh/session persistence, avatar cache behavior
- `paths.ts` + `store.ts`: account db path and persistence shape parity

Acceptance for 2A:
- `accountsAdd` creates real Microsoft+Minecraft account entries, not placeholders.
- returned object shape matches renderer expectations (`id`, `username`, `mclcAuth`, token fields).
- remove/setActive/list semantics match existing Electron behavior.

### 2B: Local cape catalog + selection

Rust commands (exact signatures):
- `capes_list_local() -> Result<LocalCapeCatalog, String>`
- `capes_get_local_selection(app: tauri::AppHandle, account_id: String) -> Result<LocalCapeSelection, String>`
- `capes_set_local_selection(app: tauri::AppHandle, account_id: String, cape_id: Option<String>) -> Result<LocalCapeSelection, String>`

Dependency mapping:
- `ipc.ts`: local cape handlers + entitlement checks
- `capes.ts`: local catalog/selection behavior and data shape
- `launcherAccount.ts`: premium/founder entitlement influence on selection (policy decision: keep entitlement check in TS API layer or re-implement in Rust)

Acceptance for 2B:
- catalog item shape parity (`id`, `name`, `tier`, `fileName`, `fullPath`, `previewDataUrl`).
- selection persist/read parity per account.

## Phase 3: API extraction to TS layer (hybrid stabilization)

Goal: stop routing API-domain calls through Rust bridge.

TS work:
- implement `tauri/api/launcherAccount.ts`, `tauri/api/cloudSync.ts`, `tauri/api/profile.ts`, `tauri/api/cosmetics.ts`
- wire `compat/api.ts` to explicit TS fetch/services for:
  - `launcherAccount*`
  - `cloudSync*`
  - `profile*`
  - `capesListOfficial`, `capesSetOfficialActive`, `skinsSetOfficialActive`, `skinsUploadOfficial`

Acceptance:
- API methods no longer depend on `bridge_invoke`.

Phase 3 progress report (implemented):
- Added explicit TS API modules:
  - `tauri/api/launcherAccount.ts`
  - `tauri/api/cloudSync.ts`
  - `tauri/api/profile.ts`
  - `tauri/api/packsSearch.ts`
- Mapped all `API_METHODS` in `tauri/compat/api.ts` to explicit handlers:
  - `launcherAccount*`
  - `cloudSync*`
  - `profile*`
  - `capesListOfficial`, `capesSetOfficialActive`, `skinsSetOfficialActive`, `skinsUploadOfficial`
  - `modrinthPacksSearch`, `providerPacksSearch`
- Runtime unblock applied after API extraction:
  - CSP connect-src updated for `localhost:15000` and `http://ipc.localhost`
  - capability file added (`src-tauri/capabilities/default.json`) with event listen/unlisten and devtools permission
- Validation completed:
  - `cargo check` passing
  - `npm run build` passing

## Phase 4: Instances + Icons + Content + Lockfile + Servers

Rust commands (exact signatures):
- `instances_list() -> Result<serde_json::Value, String>`
- `instances_create(cfg: serde_json::Value) -> Result<serde_json::Value, String>`
- `instances_update(id: String, patch: serde_json::Value) -> Result<serde_json::Value, String>`
- `instances_remove(id: String) -> Result<serde_json::Value, String>`
- `instances_set_active(id: Option<String>) -> Result<serde_json::Value, String>`
- `instances_duplicate(id: String) -> Result<serde_json::Value, String>`
- `instances_open_folder(id: String) -> Result<String, String>`
- `instances_export(window: tauri::Window, id: String) -> Result<serde_json::Value, String>`
- `instances_import(window: tauri::Window) -> Result<serde_json::Value, String>`
- `instances_pick_icon(window: tauri::Window) -> Result<Option<String>, String>`
- `instances_preview_icon_data_url(icon_token: String) -> Result<String, String>`
- `instances_set_icon_from_file(instance_id: String, icon_token: String, transform: Option<serde_json::Value>) -> Result<String, String>`
- `instances_set_icon_from_url(instance_id: String, url: String) -> Result<String, String>`
- `instances_set_icon_fallback(instance_id: String, label: String, theme: Option<String>) -> Result<String, String>`
- `instances_get_icon(instance_id: String) -> Result<Option<String>, String>`
- `instances_clear_icon(instance_id: String) -> Result<bool, String>`
- `content_pick_files(window: tauri::Window, kind: String) -> Result<Vec<String>, String>`
- `content_add(instance_id: String, kind: String, file_paths: Vec<String>) -> Result<serde_json::Value, String>`
- `content_list(instance_id: String, kind: String) -> Result<serde_json::Value, String>`
- `content_remove(instance_id: String, kind: String, name: String) -> Result<bool, String>`
- `content_toggle_enabled(instance_id: String, kind: String, name: String, enabled: bool) -> Result<serde_json::Value, String>`
- `lockfile_generate(instance_id: String) -> Result<serde_json::Value, String>`
- `lockfile_drift(instance_id: String) -> Result<serde_json::Value, String>`
- `servers_list(instance_id: String) -> Result<serde_json::Value, String>`
- `servers_upsert(instance_id: String, entry: serde_json::Value) -> Result<serde_json::Value, String>`
- `servers_remove(instance_id: String, server_id: String) -> Result<serde_json::Value, String>`
- `servers_set_preferred(instance_id: String, server_id: Option<String>) -> Result<serde_json::Value, String>`
- `servers_export_profile(window: tauri::Window, instance_id: String, server_id: String) -> Result<serde_json::Value, String>`
- `servers_import_profile(window: tauri::Window, instance_id: String) -> Result<serde_json::Value, String>`

Phase 4 progress report (current):
- Implemented explicit Rust commands in `src-tauri/src/commands/runtime_ops.rs` and registered them in `main.rs`:
  - `instances_list`, `instances_create`, `instances_set_active`, `instances_update`, `instances_remove`, `instances_duplicate`, `instances_open_folder`
  - `instances_pick_icon`, `instances_preview_icon_data_url`, `instances_set_icon_from_file`, `instances_set_icon_from_url`, `instances_set_icon_fallback`, `instances_get_icon`, `instances_clear_icon`
- Implemented explicit Tauri mappings in `compat/system.ts` for all `instances*` methods above (no bridge fallback for these methods now).
- Baseline gaps identified here were subsequently closed in Phase 4C/4D below.

Phase 4B progress report (new):
- Implemented Rust command handlers in `src-tauri/src/commands/runtime_ops.rs`:
  - content: `content_pick_files`, `content_add`, `content_list`, `content_remove`, `content_toggle_enabled`
  - lockfile: `lockfile_generate`, `lockfile_drift`
  - servers: `servers_list`, `servers_upsert`, `servers_remove`, `servers_set_preferred`
- Registered all commands in `src-tauri/src/main.rs`.
- Added explicit Tauri mappings in `compat/system.ts` for:
  - `content*`, `lockfile*`, `servers*`
- Result:
  - renderer no longer relies on bridge fallback for these method groups.

Phase 4C progress report (new):
- Implemented remaining transfer/profile command mappings in `compat/system.ts`:
  - `instancesExport`, `instancesImport`
  - `serversExportProfile`, `serversImportProfile`
- Implemented Rust handlers and registration:
  - `instances_export`, `instances_import`
  - `servers_export_profile`, `servers_import_profile`
- Added native file-dialog + zip flow for the commands above (imports/exports now execute end-to-end in Tauri runtime).

Phase 4D progress report (new):
- Replaced remaining picker placeholders with native dialogs:
  - `instances_pick_icon` now opens image picker and returns selected file path.
  - `content_pick_files` now opens native multi-select dialog with kind-based filters (`.jar` for mods, `.zip` for packs).
- Improved import payload parity for `instances_import`:
  - lockfile entry extraction (`instance.lock.json` / `instance/instance.lock.json`)
  - returns `lockfileApplied` and `lockfileResult` structure expected by renderer logs.
- Phase 4 remaining follow-up:
  - optional: deepen lockfile application semantics during import to match full Electron `applyInstanceLockfile` behavior.

## Phase 5: Installer and loader stack

Rust commands:
- `modrinth_packs_install(payload: serde_json::Value) -> Result<serde_json::Value, String>`
- `provider_packs_install(provider: String, pack_id: String, defaults: Option<serde_json::Value>) -> Result<serde_json::Value, String>`
- `pack_archive_import(window: tauri::Window, payload: serde_json::Value) -> Result<serde_json::Value, String>`
- `fabric_pick_loader(mc_version: String) -> Result<String, String>`
- `fabric_install(instance_id: String, mc_version: String, loader_version: String) -> Result<serde_json::Value, String>`
- `loader_pick_version(loader: String, mc_version: String) -> Result<Option<String>, String>`
- `loader_install(instance_id: String, mc_version: String, loader: String, loader_version: Option<String>) -> Result<serde_json::Value, String>`
- `vanilla_install(mc_version: String) -> Result<bool, String>`

Phase 5 progress report (completed):
- Implemented and registered the full Phase 5 command surface in `src-tauri/src/commands/runtime_ops.rs` and `src-tauri/src/main.rs`:
  - `loader_pick_version`, `loader_install`
  - `modrinth_packs_install`, `provider_packs_install`, `pack_archive_import`
  - `vanilla_install`, `fabric_pick_loader`, `fabric_install`
- Effect: renderer mappings for installer/loader stack now have explicit registered Tauri commands for the full Phase 5 command list.
- Provider install parity update:
  - `provider_packs_install` now accepts all provider values: `curseforge`, `technic`, `atlauncher`, `ftb`.
  - FTB now performs real file download/install flow (version metadata + required file writes) instead of metadata-only instance creation.
  - CurseForge direct install now supported with API-key-backed flow (search + download + manifest dependency resolution in Tauri runtime).
  - Technic remains archive-only in current build (direct install blocked explicitly; no implicit file-dialog side effects from `Install` action).
- Phase dependency note:
  - Phase 5 closeout was temporarily blocked on Phase 7 launch-path completion so installer outcomes could be validated through real launch/rollback flows.
- Additional Phase 5 closeout updates (2026-03-02):
  - `loader_install` now performs real runtime installation behavior for:
    - `vanilla`: installs version metadata/client artifacts via `vanilla_install`.
    - `fabric`: resolves loader version and runs full `fabric_install`.
    - `quilt`: resolves loader version, writes Quilt profile + version jar, and prefetches profile artifact libraries.
  - `forge`/`neoforge` retain current contract for this phase: resolved version + installer prefetch payload.
  - Phase 5 command surface is now behavior-complete for launcher UI flows in this branch.

## Phase 6: Mods + packs runtime

Rust commands:
- `mods_list(instance_id: String) -> Result<serde_json::Value, String>`
- `mods_set_enabled(instance_id: String, mod_id: String, enabled: bool) -> Result<serde_json::Value, String>`
- `mods_refresh(instance_id: String, mc_version: Option<String>) -> Result<serde_json::Value, String>`
- `mods_plan_refresh(instance_id: String, mc_version: Option<String>) -> Result<serde_json::Value, String>`
- `mods_refresh_selected(instance_id: String, mc_version: String, selected_ids: Vec<String>) -> Result<serde_json::Value, String>`
- `mods_sync_bridge(instance_id: String, mc_version: Option<String>) -> Result<serde_json::Value, String>`
- `mods_validate(instance_id: String) -> Result<serde_json::Value, String>`
- `mods_fix_duplicates(instance_id: String) -> Result<serde_json::Value, String>`
- `packs_list(instance_id: String) -> Result<serde_json::Value, String>`
- `packs_refresh(instance_id: String, mc_version: Option<String>) -> Result<serde_json::Value, String>`
- `packs_set_enabled(instance_id: String, pack_id: String, enabled: bool) -> Result<serde_json::Value, String>`

Phase 6 progress report (completed):
- Added explicit Rust commands in `src-tauri/src/commands/runtime_ops.rs`:
  - mods: `mods_set_enabled`, `mods_refresh`, `mods_plan_refresh`, `mods_refresh_selected`, `mods_sync_bridge`, `mods_fix_duplicates`
  - packs: `packs_list`, `packs_refresh`, `packs_set_enabled`
- Added invoke registrations in `src-tauri/src/main.rs` for all commands above.
- Added explicit Tauri mappings in `tauri/compat/system.ts` for all commands above.
- Runtime behavior now includes:
  - catalog-backed mods/packs listing
  - enabled-state persistence (`mods-state.json`, `packs-state.json`)
  - Modrinth-based refresh/download flow for recommended mods/packs
  - duplicate cleanup path for managed mod files
  - real bridge sync/install flow wired via `mods_sync_bridge` (GitHub release resolution + install/update semantics)
- UX parity fixes during closeout:
  - `mods_set_enabled` now updates resolved enabled state and restores managed files from cache on enable when needed.
  - local installed mods list refreshes immediately after recommended-toggle actions.
- Validation completed:
  - `cargo check` passing
  - user-confirmed manual Phase 6 UI verification

## Phase 7: Launch + rollback

Rust commands:
- `launch(window: tauri::Window, instance_id: String, account_id: String, runtime_prefs: Option<serde_json::Value>) -> Result<serde_json::Value, String>`
- `launch_is_running(instance_id: String) -> Result<bool, String>`
- `launch_stop(instance_id: String) -> Result<bool, String>`
- `launch_diagnose(instance_id: String, lines: Vec<String>) -> Result<serde_json::Value, String>`
- `launch_apply_fix(instance_id: String, action: String) -> Result<serde_json::Value, String>`
- `rollback_create_snapshot(instance_id: String, reason: String, note: Option<String>) -> Result<serde_json::Value, String>`
- `rollback_get_latest(instance_id: String) -> Result<serde_json::Value, String>`
- `rollback_restore_latest(instance_id: String) -> Result<serde_json::Value, String>`

Event parity:
- emit `launch:log` lines exactly as renderer expects.

Fishbattery cape bridge enforcement (required parity with Electron):
- Goal:
  - ensure Fishbattery cape bridge mod is always present for supported MC versions.
- Source of truth:
  - bridge release/version metadata is resolved from the Fishbattery GitHub release/page endpoint used by Electron.
- On instance creation/import (pre-launch convenience path):
  - when instance `mcVersion` is supported by the bridge, pre-install/enable the bridge mod in the instance mods folder.
  - if unsupported for that version/loader, do not fail instance creation; log a compatibility note.
- On launch (hard guarantee path):
  - before spawning Java, run `mods_sync_bridge(instance_id, mc_version)` and force-install/update bridge if missing or outdated.
  - if bridge install/update fails for a supported version, launch should fail fast with actionable error text in diagnostics/log stream.
  - if unsupported version, continue launch normally and emit non-fatal note.
- Current support target (as of 2026-03-01):
  - Fabric/Quilt bridge builds for Minecraft 1.16 through 1.21.x (including 1.21.11).
  - future expansion planned for Quilt/Forge/NeoForge with the same enforcement contract.

Phase 7 progress report (completed):
- Added explicit Rust command surface in `src-tauri/src/commands/lifecycle.rs`:
  - `launch`, `launch_is_running`, `launch_stop`
  - `launch_diagnose`, `launch_apply_fix`
  - `rollback_create_snapshot`, `rollback_get_latest`, `rollback_restore_latest`
- Added explicit invoke registrations in `src-tauri/src/main.rs` for all commands above.
- Added explicit Tauri mappings in `tauri/compat/system.ts` for all `launch*` and `rollback*` methods (bridge fallback removed for these methods).
- Implemented parity-complete pieces:
  - launch log diagnosis signatures and auto-fix routing parity (`launchDiagnostics.ts` behavior)
  - rollback snapshot create/get/restore + mods/packs enabled-state restoration and refresh flows (`rollback.ts` behavior)
- Additional Phase 7 implementation updates (2026-03-01): 
  - `mods_sync_bridge` now performs real GitHub release resolution + bridge JAR install/update flow in Rust (loader/version gating + old bridge cleanup + download validation).
  - `launch` now resolves bundled Java 21 candidates from `runtime/java21/bin` first (resource/cwd/exe-relative probing), emits launch log parity messages for selected runtime, and validates Java runtime availability via `java -version` before continuing.
  - launch lifecycle plumbing is now active in Rust:
    - executes optional pre-launch/post-exit hooks from runtime prefs
    - spawns and tracks a real Java child process
    - streams stdout/stderr lines to `launch:log`
    - `launch_is_running` / `launch_stop` now operate on real process PID tracking (stop uses OS process termination)
  - bridge enforcement behavior updated in launch path:
    - supported bridge MC versions fail launch on bridge sync error (hard guarantee path)
    - unsupported versions emit non-fatal bridge notes
- Additional Phase 7 implementation updates (2026-03-01, continued):
  - `launch` now performs full profile bootstrap in Rust (vanilla/fabric/quilt path):
    - resolves/installs launch profile id and profile inheritance chain
    - prepares runtime artifacts (client jar, libraries, natives extraction, asset index + asset objects)
    - resolves auth placeholders from stored `mclcAuth` and builds JVM/game arguments from `arguments`/`minecraftArguments`
    - spawns Java with resolved `mainClass`, classpath, natives, memory, hooks, and server join args
  - Phase 7 launch-path gap is closed for vanilla/fabric/quilt runtime bootstrap parity.
- Additional Phase 7 closeout updates (2026-03-02):
  - launch argument rules now evaluate Mojang `features` gates (prevents erroneous `--demo`/quick-play placeholder args for standard sessions).
  - launch command logging now redacts `--accessToken` values in persisted logs.
  - launcher log persistence added in Tauri runtime (`data/logs`):
    - `latest.log`, `debug.log`, `stderr_stream.log`
    - per-session daily `YYYY-MM-DD-N.log.gz`
  - local launcher cape selection is now injected into launch JVM properties (`-Dfishbattery.cape.path` and optional signature) for bridge consumption.

## Phase 8: Optimizer + benchmark + updater + diagnostics + preflight

Rust commands:
- `optimizer_preview(profile: String) -> Result<serde_json::Value, String>`
- `optimizer_apply(instance_id: String, profile: String) -> Result<serde_json::Value, String>`
- `optimizer_restore(instance_id: String) -> Result<bool, String>`
- `benchmark_run(instance_id: String, profile: Option<String>) -> Result<serde_json::Value, String>`
- `benchmark_list(instance_id: String) -> Result<serde_json::Value, String>`
- `updater_get_state() -> Result<serde_json::Value, String>`
- `updater_get_channel() -> Result<String, String>`
- `updater_set_channel(channel: String) -> Result<String, String>`
- `updater_check() -> Result<bool, String>`
- `updater_download() -> Result<bool, String>`
- `updater_install() -> Result<bool, String>`
- `diagnostics_export(window: tauri::Window) -> Result<serde_json::Value, String>`
- `preflight_run() -> Result<serde_json::Value, String>`
- `preflight_get_last() -> Result<serde_json::Value, String>`

Event parity:
- emit `updater:event` payloads compatible with renderer logic.

Phase 8 progress report (current):
- Added explicit Rust command module `src-tauri/src/commands/maintenance.rs` and registrations in `src-tauri/src/main.rs` for:
  - optimizer: `optimizer_preview`, `optimizer_apply`, `optimizer_restore`
  - benchmark: `benchmark_run`, `benchmark_list`
  - updater: `updater_get_state`, `updater_get_channel`, `updater_set_channel`, `updater_check`, `updater_download`, `updater_install`
  - diagnostics: `diagnostics_export`
- Added explicit Tauri mappings in `tauri/compat/system.ts` for all commands above.
- Startup updater bridge-missing errors are resolved because updater methods no longer fall back to `bridge_invoke`.
- `diagnostics_export` now returns native save-dialog result payload shape (`{ ok, canceled, path? }`) and writes a zip with system + launcher log snapshots.
- Validation completed:
  - `cargo check` passing
  - `npm run build` (tauri) passing
- Additional closeout updates (2026-03-07):
  - updater command path now uses `tauri-plugin-updater` provider flow:
    - `updater_check` performs real remote check
    - `updater_download` performs real package download with progress updates
    - `updater_install` installs downloaded payload and requests app restart
  - updater is environment-configured in runtime via:
    - `FISHBATTERY_UPDATER_PUBKEY` (or `TAURI_UPDATER_PUBKEY`)
    - `FISHBATTERY_UPDATER_ENDPOINT[_STABLE|_BETA]` (or `TAURI_UPDATER_ENDPOINT[_STABLE|_BETA]`)

## Phase 9: Bridge removal and contract lock

- remove proxy fallback to `bridge_invoke`. (completed 2026-03-07)
- remove runtime `bridge_invoke` command registration. (completed 2026-03-07)
- explicit invoke map for all system methods in `compat/system.ts`.
- explicit TS implementations for all API methods in `compat/api.ts`.
- contract regression tests against Electron payload snapshots.

## Gate policy

- Do not advance phase until all commands in that phase are mapped explicitly.
- Exception (approved 2026-03-01): Phase 7 may proceed before final Phase 5 closeout; once Phase 7 is complete, Phase 5 must be resumed and closed before Phase 8.
- `cargo check` and `npm run build` must pass.
- no renderer UI/UX changes are allowed as part of runtime porting.
