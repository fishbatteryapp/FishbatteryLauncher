# Fishbattery Preset QA Checklist

Date: __________
Tester: __________
Build/Commit: __________

## Scope

Presets to test on each combo:
- [ ] Max FPS
- [ ] Shader Friendly
- [ ] Distant Horizons Worldgen
- [ ] PvP Ready

## Matrix

Mark each preset run as pass/fail per row.

| # | Loader | MC Version | Max FPS | Shader Friendly | Distant Horizons | PvP Ready | Notes |
|---|--------|------------|---------|------------------|------------------|-----------|-------|
| 1 | Fabric | 1.21.11 | [ ] | [ ] | [ ] | [ ] | |
| 2 | Fabric | 1.20.1 | [ ] | [ ] | [ ] | [ ] | |
| 3 | Fabric | 1.16.5 | [ ] | [ ] | [ ] | [ ] | |
| 4 | Quilt | 1.21.11 | [ ] | [ ] | [ ] | [ ] | |
| 5 | Quilt | 1.20.1 | [ ] | [ ] | [ ] | [ ] | |
| 6 | Forge | 1.21.11 | [ ] | [ ] | [ ] | [ ] | |
| 7 | Forge | 1.20.1 | [ ] | [ ] | [ ] | [ ] | |
| 8 | Forge | 1.16.5 | [ ] | [ ] | [ ] | [ ] | |
| 9 | Forge | 1.12.2 | [ ] | [ ] | [ ] | [ ] | |
| 10 | Forge | 1.8.9 | [ ] | [ ] | [ ] | [ ] | |
| 11 | NeoForge | 1.21.11 | [ ] | [ ] | [ ] | [ ] | |
| 12 | NeoForge | 1.20.1 | [ ] | [ ] | [ ] | [ ] | |

## Vanilla Behavior Checks

Presets should be unavailable/disabled for vanilla.

| # | Loader | MC Version | Presets Disabled UI | Notes |
|---|--------|------------|---------------------|-------|
| 1 | Vanilla | 1.21.11 | [ ] | |
| 2 | Vanilla | 1.20.1 | [ ] | |

## Per-Run Validation

For each preset run, verify:
- [ ] Preset apply action completes without crash/error popup.
- [ ] Logs show expected profile bucket (legacy/classic/modern/latest).
- [ ] Mods resolve to `ok` or fallback messages are clear.
- [ ] Launch reaches main menu/world at least once.
- [ ] Second launch also succeeds (cold start + relaunch path).
- [ ] Memory/JVM args are respected by game process.
- [ ] Save/open instance again keeps preset state as expected.

Extra checks for specific presets:
- Shader Friendly:
  - [ ] Shader pack installed/enabled correctly.
  - [ ] No immediate crash with shader pipeline active.
- Distant Horizons Worldgen:
  - [ ] Distant/worldgen-related mods resolve or fallback cleanly.
  - [ ] World load/chunk traversal is stable for a short run.

## Failure Capture Template

Use this block when anything fails:

```text
Loader:
MC Version:
Preset:
Bucket:
Observed:
Expected:
Recent logs:
Repro steps:
```

## Sign-off

- [ ] All required rows tested
- [ ] All blockers fixed or documented
- [ ] Ready for release candidate

