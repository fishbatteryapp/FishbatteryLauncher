import path from "node:path";

export function assertNoNullByte(name: string, value: string): void {
  if (value.includes("\0")) {
    throw new Error(`${name}: invalid null byte`);
  }
}

export function assertBoundedString(name: string, raw: unknown, maxLen = 512): string {
  const value = String(raw ?? "").trim();
  if (!value) throw new Error(`${name}: missing`);
  if (value.length > maxLen) throw new Error(`${name}: too long`);
  assertNoNullByte(name, value);
  return value;
}

export function assertIdLike(name: string, raw: unknown, maxLen = 128): string {
  const value = assertBoundedString(name, raw, maxLen);
  if (!/^[A-Za-z0-9._:-]+$/.test(value)) {
    throw new Error(`${name}: invalid characters`);
  }
  return value;
}

export function assertSafeHttpUrl(name: string, raw: unknown, allowHttp = true): string {
  const value = assertBoundedString(name, raw, 2048);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name}: invalid URL`);
  }
  const https = parsed.protocol === "https:";
  const http = allowHttp && parsed.protocol === "http:";
  if (!https && !http) throw new Error(`${name}: unsupported URL protocol`);
  if (!parsed.hostname) throw new Error(`${name}: invalid URL host`);
  if (parsed.username || parsed.password) throw new Error(`${name}: credentials not allowed`);
  return parsed.toString();
}

export function assertWithinAllowedDir(name: string, targetPath: string, allowedRoots: string[]): string {
  const normalizedTarget = path.resolve(assertBoundedString(name, targetPath, 4096));
  const roots = allowedRoots.map((x) => path.resolve(assertBoundedString(`${name}:root`, x, 4096)));
  const inside = roots.some((root) => normalizedTarget === root || normalizedTarget.startsWith(`${root}${path.sep}`));
  if (!inside) throw new Error(`${name}: path outside allowed directories`);
  return normalizedTarget;
}

