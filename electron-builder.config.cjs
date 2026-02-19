const fs = require("node:fs");
const path = require("node:path");

const pkgPath = path.join(__dirname, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const base = pkg.build || {};

function str(name) {
  return String(process.env[name] || "").trim();
}

function bool(name) {
  const raw = str(name).toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

function splitPublisherNames(raw) {
  return String(raw || "")
    .split(";")
    .map((x) => x.trim())
    .filter(Boolean);
}

const trustedSigningEnabled =
  bool("WINDOWS_TRUSTED_SIGNING") &&
  !!str("AZURE_TRUSTED_SIGNING_ENDPOINT") &&
  !!str("AZURE_TRUSTED_SIGNING_ACCOUNT_NAME") &&
  !!str("AZURE_TRUSTED_SIGNING_CERT_PROFILE_NAME") &&
  splitPublisherNames(str("AZURE_TRUSTED_SIGNING_PUBLISHER_NAME")).length > 0;

const win = { ...(base.win || {}) };
if (trustedSigningEnabled) {
  win.azureSignOptions = {
    endpoint: str("AZURE_TRUSTED_SIGNING_ENDPOINT"),
    codeSigningAccountName: str("AZURE_TRUSTED_SIGNING_ACCOUNT_NAME"),
    certificateProfileName: str("AZURE_TRUSTED_SIGNING_CERT_PROFILE_NAME"),
    publisherName: splitPublisherNames(str("AZURE_TRUSTED_SIGNING_PUBLISHER_NAME")),
    timestampRfc3161: str("AZURE_TRUSTED_SIGNING_TIMESTAMP_URL") || "http://timestamp.acs.microsoft.com",
    timestampDigest: "sha256",
    fileDigest: "sha256"
  };
  console.log("[builder] Windows Trusted Signing enabled for this build.");
} else {
  console.log("[builder] Windows Trusted Signing disabled (missing env vars or WINDOWS_TRUSTED_SIGNING flag).");
}

module.exports = {
  ...base,
  win
};
