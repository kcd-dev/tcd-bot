import type { SandInferenceProvider } from "../inference-router.js";

export const LOCAL_INFERENCE_AUTH_ID = "local-openrouter";
export const LOCAL_INFERENCE_PEEK_TOKEN = "local-openrouter-bypass";

export const LOCAL_INFERENCE_AUTH_STATUS = {
  kind: "logged-in" as const,
  authId: LOCAL_INFERENCE_AUTH_ID,
  email: "openrouter@local",
  displayName: "ChainFuel",
};

export function shouldBypassCursorSignIn(
  provider: SandInferenceProvider | string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const flag = env.SAND_SKIP_CURSOR_AUTH?.trim().toLowerCase();
  if (flag === "1" || flag === "true" || flag === "yes") return true;
  return provider != null && provider !== "cursor";
}
