@echo off
setlocal enabledelayedexpansion

if "%~1"=="" (
  echo Missing file path argument to sign-windows.cmd
  exit /b 1
)

if "%AZURE_TRUSTED_SIGNING_ENDPOINT%"=="" (
  echo Missing AZURE_TRUSTED_SIGNING_ENDPOINT
  exit /b 1
)
if "%AZURE_TRUSTED_SIGNING_ACCOUNT_NAME%"=="" (
  echo Missing AZURE_TRUSTED_SIGNING_ACCOUNT_NAME
  exit /b 1
)
if "%AZURE_TRUSTED_SIGNING_CERT_PROFILE_NAME%"=="" (
  echo Missing AZURE_TRUSTED_SIGNING_CERT_PROFILE_NAME
  exit /b 1
)
if "%AZURE_CLIENT_ID%"=="" (
  echo Missing AZURE_CLIENT_ID
  exit /b 1
)
if "%AZURE_CLIENT_SECRET%"=="" (
  echo Missing AZURE_CLIENT_SECRET
  exit /b 1
)
if "%AZURE_TENANT_ID%"=="" (
  echo Missing AZURE_TENANT_ID
  exit /b 1
)

where trusted-signing-cli >nul 2>nul
if errorlevel 1 (
  echo trusted-signing-cli not found in PATH
  exit /b 1
)

trusted-signing-cli ^
  --azure-client-secret "%AZURE_CLIENT_SECRET%" ^
  --azure-client-id "%AZURE_CLIENT_ID%" ^
  --azure-tenant-id "%AZURE_TENANT_ID%" ^
  --endpoint "%AZURE_TRUSTED_SIGNING_ENDPOINT%" ^
  --account "%AZURE_TRUSTED_SIGNING_ACCOUNT_NAME%" ^
  --certificate "%AZURE_TRUSTED_SIGNING_CERT_PROFILE_NAME%" ^
  --description "Fishbattery Launcher" ^
  "%~1"

if errorlevel 1 (
  echo trusted-signing-cli failed with exit code %errorlevel%
  exit /b %errorlevel%
)

exit /b 0
