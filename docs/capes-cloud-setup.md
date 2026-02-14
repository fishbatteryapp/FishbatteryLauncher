# Cloud Cape Setup (Launcher + API)

This launcher now expects the Fishbattery cape catalog from the authenticated API instead of local `./capes/*` folders.

## Launcher Env

Set these for the launcher process:

- `FISHBATTERY_ACCOUNT_API` (or `FISHBATTERY_ACCOUNT_API_URL`)
  - Example: `https://fishbattery-auth-api-production.up.railway.app`
- Optional: `FISHBATTERY_ACCOUNT_CAPES_PATH`
  - Default: `/v1/capes/launcher`
- Optional: `FISHBATTERY_ACCOUNT_CAPES_PUBLIC_PATH`
  - Default: `/v1/capes/launcher/public`

The launcher calls:

`GET <FISHBATTERY_ACCOUNT_API><FISHBATTERY_ACCOUNT_CAPES_PATH>`

with the user bearer token.
If auth/session is unavailable, it falls back to:

`GET <FISHBATTERY_ACCOUNT_API><FISHBATTERY_ACCOUNT_CAPES_PUBLIC_PATH>`

## API Contract

`GET /v1/capes/launcher` should return:

```json
{
  "items": [
    {
      "id": "fish",
      "name": "Fish",
      "tier": "free",
      "previewUrl": "https://cdn.example/capes/fish-preview.png",
      "downloadUrl": "https://cdn.example/capes/fish.png"
    }
  ]
}
```

Allowed `tier` values:

- `free`
- `premium`
- `founder`

Server must filter by current user entitlement before returning items.

## Client Behavior

- UI displays only capes returned by API.
- Selection is stored per account id (`userData/capes/selection.json`).
- Selected cape file is cached under `userData/capes/cache/`.
- Launch uses cached file path and injects JVM props for bridge mod.
- If user loses entitlement, selection is auto-cleared.

## Security Notes

- Do not trust local files for entitlement/tier.
- Return only entitled capes from API.
- Prefer signed/public CDN URLs from R2 for image delivery.
