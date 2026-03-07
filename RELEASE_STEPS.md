# Fishbattery Launcher Release Steps

This is the canonical release process for this repo.

## 1. One-time setup (Azure + GitHub)

### Azure Trusted Signing prerequisites

1. Create/verify an Azure Artifact Signing account.
2. Create/verify certificate profile (current names used: `Fishbattery` / `Fishbattery`).
3. Ensure identity validation is completed in Azure.
4. Ensure the service principal used by GitHub has roles:
   - `Artifact Signing Certificate Profile Signer` on certificate profile scope
   - `Reader` on signing account scope

### GitHub `release` environment configuration

Repository: `fishbatteryapp/FishbatteryLauncher`  
Environment name: `release`

#### Environment secrets

- `AZURE_CLIENT_ID`
- `AZURE_CLIENT_SECRET`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`
- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

#### Environment variables

- `AZURE_TRUSTED_SIGNING_ENDPOINT` (example: `https://neu.codesigning.azure.net/`)
- `AZURE_TRUSTED_SIGNING_ACCOUNT_NAME` (example: `Fishbattery`)
- `AZURE_TRUSTED_SIGNING_CERT_PROFILE_NAME` (example: `Fishbattery`)
- `AZURE_TRUSTED_SIGNING_PUBLISHER_NAME` (the CN/O/L publisher string)
- `AZURE_TRUSTED_SIGNING_TIMESTAMP_URL` (optional but recommended)
- `FISHBATTERY_UPDATER_PUBKEY` (public key, not private key)
- `FISHBATTERY_UPDATER_ENDPOINT_STABLE`
- `FISHBATTERY_UPDATER_ENDPOINT_BETA` (optional)

## 2. Pre-release checklist

1. Confirm `src-tauri/tauri.conf.json` has:
   - correct `productName`
   - correct `version`
   - updater plugin object present (`plugins.updater`) with non-null shape
2. Confirm `package.json` version matches intended release version.
3. Commit and push all changes to `main`.
4. Confirm working tree is clean (`git status`).

## 3. Create release tag

Use semantic version tags (`vX.Y.Z`), for example:

```powershell
git checkout main
git pull
git tag v0.4.0
git push origin v0.4.0
```

This triggers `.github/workflows/release.yml`.

## 4. Monitor GitHub Actions run

1. Open Actions run for the tag.
2. Ensure both jobs pass:
   - `Release (windows-latest)`
   - `Release (macos-latest)`
3. On Windows job, verify these specific steps succeed:
   - `Azure login (Trusted Signing)`
   - `Sign Windows release artifacts (post-build)`
   - `Replace release assets with signed Windows artifacts`

## 5. Validate release assets

On GitHub Release page for the tag:

1. Confirm expected assets exist for Windows and macOS.
2. Confirm `latest.json` / updater metadata assets are present.
3. Confirm Windows assets were replaced by signed versions (same file names, uploaded in post-build step).

## 6. Validate code signing on Windows

For downloaded installer (`.exe`/`.msi`):

1. Right-click -> Properties -> `Digital Signatures` tab exists.
2. Publisher matches expected certificate subject.

Note: SmartScreen reputation can still warn for new binaries even when signed.

## 7. If release must be rebuilt

If artifacts are wrong and you need to rebuild same version:

```powershell
git tag -d v0.4.0
git push origin :refs/tags/v0.4.0
git tag v0.4.0
git push origin v0.4.0
```

Then rerun and recheck assets.

## 8. Troubleshooting

### `403 Forbidden` from Trusted Signing

Usually RBAC/scope issue. Recheck:

- SP has `Artifact Signing Certificate Profile Signer` on:
  `/subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.CodeSigning/codeSigningAccounts/<account>/certificateProfiles/<profile>`
- SP has `Reader` on:
  `/subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.CodeSigning/codeSigningAccounts/<account>`

Wait 5-15 minutes after role changes, then rerun workflow.

### `Unknown publisher` in SmartScreen dialog

- If file has no digital signature tab: signing failed or unsigned asset downloaded.
- If file is signed but SmartScreen still warns: this is reputation-based and can persist temporarily.

### Tauri updater panic about `plugins.updater`

`plugins.updater` in `src-tauri/tauri.conf.json` must be an object, not `null`.

