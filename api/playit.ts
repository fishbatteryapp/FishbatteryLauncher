import { requestLauncherAccountAuthed } from "./launcherAccount";

const PATH_PLAYIT_EXCHANGE_SETUP_CODE = "/v1/playit/setup/exchange";

export async function playitExchangeSetupCode(code: string): Promise<{
  ok: true;
  linked: boolean;
  secretKey: string;
}> {
  const normalizedCode = String(code || "").trim();
  if (!normalizedCode) {
    throw new Error("Playit setup code is required.");
  }

  const payload = (await requestLauncherAccountAuthed(PATH_PLAYIT_EXCHANGE_SETUP_CODE, {
    method: "POST",
    body: { code: normalizedCode }
  })) as any;

  const secretKey = String(payload?.secretKey || "").trim();
  if (!secretKey) {
    throw new Error("Playit exchange did not return a secret key.");
  }

  return {
    ok: true,
    linked: true,
    secretKey
  };
}
