import { apiBackend } from "./api";
import { systemBackend } from "./system";
import { API_METHODS, SYSTEM_METHODS } from "./method-groups";

export const backend = new Proxy(
  {},
  {
    get(_target, prop) {
      if (typeof prop !== "string") return undefined;
      if (API_METHODS.has(prop)) return (apiBackend as Record<string, unknown>)[prop];
      if (SYSTEM_METHODS.has(prop)) return (systemBackend as Record<string, unknown>)[prop];
      return (...args: unknown[]) =>
        Promise.reject(new Error(`compat: method '${prop}' is not classified (args: ${JSON.stringify(args)})`));
    }
  }
) as Window["api"];
