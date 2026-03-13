$ErrorActionPreference = "Stop"

param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$FileToSign
)

$required = @(
  "AZURE_TRUSTED_SIGNING_ENDPOINT",
  "AZURE_TRUSTED_SIGNING_ACCOUNT_NAME",
  "AZURE_TRUSTED_SIGNING_CERT_PROFILE_NAME",
  "AZURE_CLIENT_ID",
  "AZURE_CLIENT_SECRET",
  "AZURE_TENANT_ID"
)

$missing = @()
foreach ($key in $required) {
  if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($key))) {
    $missing += $key
  }
}

if ($missing.Count -gt 0) {
  throw "Missing required signing environment variables: $($missing -join ', ')"
}

if (-not (Get-Command trusted-signing-cli -ErrorAction SilentlyContinue)) {
  throw "trusted-signing-cli not found in PATH"
}

& trusted-signing-cli `
  --azure-client-secret "$env:AZURE_CLIENT_SECRET" `
  --azure-client-id "$env:AZURE_CLIENT_ID" `
  --azure-tenant-id "$env:AZURE_TENANT_ID" `
  --endpoint "$env:AZURE_TRUSTED_SIGNING_ENDPOINT" `
  --account "$env:AZURE_TRUSTED_SIGNING_ACCOUNT_NAME" `
  --certificate "$env:AZURE_TRUSTED_SIGNING_CERT_PROFILE_NAME" `
  --description "Fishbattery Launcher" `
  "$FileToSign"

if ($LASTEXITCODE -ne 0) {
  throw "trusted-signing-cli failed with exit code $LASTEXITCODE"
}
