import { Auth } from "msmc";

function fail(message) {
  process.stderr.write(String(message || "Unknown error"));
  process.exit(1);
}

const ACCOUNT_JSON_PREFIX = "__FB_ACCOUNT_JSON__:";

function pickMsmcFrameworkOrder() {
  const override = String(process.env.MSMC_FRAMEWORK || "").toLowerCase();
  if (override === "electron") return ["electron", "raw"];
  if (override === "raw") return ["raw", "electron"];
  return ["raw", "electron"];
}

function asHelpfulAuthError(err, framework) {
  const msg = String((err && err.message) || err || "Unknown error");
  if (/different device|authentication method|error\\s*400/i.test(msg)) {
    return (
      `Microsoft sign-in was blocked in the ${framework} flow.\n` +
      "Fix: use the system-browser login flow (MSMC raw).\n\n" +
      `Details: ${msg}`
    );
  }
  return `Microsoft sign-in failed in the ${framework} flow: ${msg}`;
}

try {
  const authManager = new Auth("select_account");
  let lastErr = null;

  for (const framework of pickMsmcFrameworkOrder()) {
    try {
      const xboxManager = await authManager.launch(framework);
      const mc = await xboxManager.getMinecraft();

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

      const account = {
        id: String(uuid),
        username: String(username),
        mclcAuth,
        accessToken: mclcAuth?.access_token ?? mclcAuth?.accessToken ?? undefined,
        msmcRefreshToken,
        addedAt: Date.now()
      };

      process.stdout.write(`${ACCOUNT_JSON_PREFIX}${JSON.stringify(account)}\n`);
      process.exit(0);
    } catch (err) {
      lastErr = asHelpfulAuthError(err, framework);
    }
  }

  fail(lastErr || "Microsoft sign-in failed.");
} catch (err) {
  fail((err && err.message) || String(err));
}
