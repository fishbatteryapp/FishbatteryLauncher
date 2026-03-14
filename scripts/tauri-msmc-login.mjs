import { Auth } from "msmc";
import { spawn } from "node:child_process";

function fail(message) {
  process.stderr.write(String(message || "Unknown error"));
  process.exit(1);
}

const ACCOUNT_JSON_PREFIX = "__FB_ACCOUNT_JSON__:";
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
const FISHBATTERY_MS_TOKEN = {
  client_id: "901072c6-44ac-4871-a9dc-c1c408639183",
  redirect: "https://login.microsoftonline.com/common/oauth2/nativeclient",
  prompt: "select_account"
};

function describeError(err) {
  if (!err) return "Unknown error";
  if (typeof err === "string") {
    const trimmed = err.trim();
    return trimmed || "Unknown error";
  }
  if (err instanceof Error) {
    const details = [err.message, err.cause].filter(Boolean).map((v) => String(v).trim()).filter(Boolean);
    return details[0] || err.toString() || "Unknown error";
  }
  if (typeof err === "object") {
    const record = err;
    const candidates = [
      record.message,
      record.errorMessage,
      record.error_description,
      record.errorDescription,
      record.details,
      record.detail,
      record.reason,
      record.error,
      record.cause
    ];
    for (const value of candidates) {
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
      if (value && typeof value === "object") {
        const nested = describeError(value);
        if (nested && nested !== "Unknown error") return nested;
      }
    }
    try {
      const serialized = JSON.stringify(record, null, 2);
      if (serialized && serialized !== "{}") return serialized;
    } catch {
      // Ignore serialization failures.
    }
  }
  const fallback = String(err).trim();
  return fallback || "Unknown error";
}

function asHelpfulAuthError(err) {
  const msg = describeError(err);
  if (/different device|authentication method|error\s*400/i.test(msg)) {
    return (
      "Microsoft sign-in was blocked by the browser or Microsoft auth flow.\n" +
      "Fix: retry the sign-in and complete it in your default browser.\n\n" +
      `Details: ${msg}`
    );
  }
  return `Microsoft sign-in failed: ${msg}`;
}

function buildAccount(xboxManager, mc) {
  const uuid = mc?.profile?.id ?? mc?.profile?.uuid ?? null;
  const username = mc?.profile?.name ?? null;
  if (!uuid || !username) {
    throw new Error(
      "Microsoft login succeeded, but no Minecraft profile was returned. " +
        "The account may not own Minecraft Java."
    );
  }

  const mclcAuth = typeof mc?.mclc === "function" ? mc.mclc() : mc?.mclc;
  if (!mclcAuth || typeof mclcAuth !== "object") {
    throw new Error("MSMC did not return mclc auth payload.");
  }

  const xuid = mclcAuth?.meta?.xuid ?? null;
  if (!xuid) {
    throw new Error("MSMC auth missing meta.xuid.");
  }

  const msmcRefreshToken =
    typeof xboxManager?.save === "function"
      ? String(xboxManager.save() || "").trim() || undefined
      : undefined;

  return {
    id: String(uuid),
    username: String(username),
    mclcAuth,
    accessToken: mclcAuth?.access_token ?? mclcAuth?.accessToken ?? undefined,
    msmcRefreshToken,
    addedAt: Date.now()
  };
}

function openUrl(url) {
  const target = String(url || "").trim();
  if (!target) {
    return Promise.reject(new Error("Missing sign-in URL."));
  }

  return new Promise((resolve, reject) => {
    let command;
    let args;

    switch (process.platform) {
      case "win32":
        command = "cmd";
        args = ["/c", "start", "", target];
        break;
      case "darwin":
        command = "open";
        args = [target];
        break;
      default:
        command = "xdg-open";
        args = [target];
        break;
    }

    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore"
    });

    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

async function loginInSystemBrowser() {
  const authManager = new Auth(FISHBATTERY_MS_TOKEN);

  let serverInfo = null;
  let timeoutHandle = null;
  let isSettled = false;

  const closeServer = () => {
    try {
      serverInfo?.server?.close?.();
    } catch {
      // Ignore close failures.
    }
  };

  const accountPromise = new Promise((resolve, reject) => {
    const settle = (handler, value) => {
      if (isSettled) return;
      isSettled = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      closeServer();
      handler(value);
    };

    authManager
      .setServer(
        async (xboxManager) => {
          try {
            const mc = await xboxManager.getMinecraft();
            settle(resolve, buildAccount(xboxManager, mc));
          } catch (err) {
            settle(reject, err);
          }
        },
        "Fishbattery sign-in complete. You can close this tab.",
        0
      )
      .then((info) => {
        serverInfo = info;
        timeoutHandle = setTimeout(() => {
          settle(
            reject,
            new Error("Timed out waiting for Microsoft sign-in to complete.")
          );
        }, LOGIN_TIMEOUT_MS);

        return openUrl(info.link);
      })
      .catch((err) => {
        settle(reject, err);
      });
  });

  return await accountPromise;
}

try {
  const account = await loginInSystemBrowser();
  process.stdout.write(`${ACCOUNT_JSON_PREFIX}${JSON.stringify(account)}\n`);
  process.exit(0);
} catch (err) {
  fail(asHelpfulAuthError(err));
}
