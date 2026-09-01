import { getFree, type ProxyCallDependencies } from "./api.js";
import { readProxyToken, type AdapterConfig } from "./config.js";
import { resolveProxyEntrypoint } from "./proxy-service.js";

export const COMMAND_HELP = [
  "Onchain Router commands:",
  "  /onchain-router status    Show local proxy readiness",
  "  /onchain-router doctor    Run redacted local checks",
  "  /onchain-router models    Show policy-filtered models",
  "  /onchain-router pricing   Show current pass-through pricing",
  "  /onchain-router voices    Show available speech voices",
  "  /onchain-router recovery  Explain safe same-key recovery",
  "  /onchain-router help      Show this message",
  "",
  "Wallet setup, unlock, funding, policy, backup, and recovery actions remain human-terminal operations.",
].join("\n");

function display(value: Record<string, unknown>): string {
  const text = JSON.stringify(value, null, 2);
  return text.length <= 16_000 ? text : `${text.slice(0, 16_000)}\n…output truncated`;
}

export async function dispatchCommand(
  config: AdapterConfig,
  rawArgs: string | undefined,
  dependencies: ProxyCallDependencies = {},
): Promise<string> {
  const command = (rawArgs ?? "").trim().toLowerCase();
  if (command === "" || command === "help" || command === "?") return COMMAND_HELP;
  if (command === "recovery")
    return [
      "Ambiguous paid-call recovery:",
      "1. Do not retry with a new key or a different model.",
      "2. Inspect Buyer Runtime receipts from a human terminal.",
      "3. Recover with the original idempotency key and identical request.",
      "4. Never paste a receipt capability, proxy bearer, or wallet secret into chat.",
    ].join("\n");
  if (command === "doctor") {
    const checks: string[] = [];
    try {
      (dependencies.readToken ?? readProxyToken)(config.tokenFile);
      checks.push("PASS owner_only_bearer: owner-only token is valid");
    } catch {
      checks.push("FAIL owner_only_bearer: token is missing or unsafe");
    }
    if (config.manageProxy) {
      try {
        resolveProxyEntrypoint();
        checks.push("PASS exact_proxy: exact pinned entrypoint is valid");
      } catch {
        checks.push("FAIL exact_proxy: package is missing, unsafe, or the wrong version");
      }
    } else {
      checks.push("PASS exact_proxy: externally managed by explicit configuration");
    }
    const current = await getFree(config, "/v1/models", dependencies);
    checks.push(`${current["ok"] === true ? "PASS" : "FAIL"} proxy_reachable: ${config.proxyOrigin}`);
    return checks.join("\n");
  }
  const paths: Record<string, string> = {
    status: "/v1/models",
    models: "/v1/models",
    pricing: "/v1/pricing",
    voices: "/v1/audio/voices",
  };
  const path = paths[command];
  if (!path) return `Unknown subcommand: ${JSON.stringify(command)}\n${COMMAND_HELP}`;
  const response = await getFree(config, path, dependencies);
  if (command === "status")
    return [
      "Onchain Router local proxy",
      `  Origin:    ${config.proxyOrigin}`,
      `  Reachable: ${String(response["ok"] === true)}`,
      `  Managed:   ${String(config.manageProxy)}`,
      `  Error:     ${response["ok"] === true ? "—" : String(response["outcome"] ?? "unavailable")}`,
    ].join("\n");
  return display(response);
}
