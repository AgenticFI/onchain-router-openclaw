import type { AdapterConfig } from "./config.js";
import { readProxyToken } from "./config.js";

const MAX_FREE_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_PAID_RESPONSE_BYTES = 32 * 1024 * 1024;
const SAFE_HEADERS = [
  "x-onchain-router-idempotency-key",
  "x-onchain-router-outcome",
  "x-onchain-router-retry",
  "x-onchain-router-cache",
  "x-onchain-router-charge-atomic",
  "x-onchain-router-source-receipt-id",
  "x-receipt-id",
  "x-payment-network",
  "x-payment-maximum-atomic",
  "x-payment-actual-atomic",
  "x-payment-transaction",
] as const;

const FREE_PATHS = new Set(["/v1/models", "/v1/pricing", "/v1/audio/voices"]);
const PAID_PATHS = new Set([
  "/v1/images/generations",
  "/v1/audio/speech",
  "/v1/audio/transcriptions",
]);
const IDEMPOTENCY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export interface ProxyCallDependencies {
  readonly fetch?: typeof fetch | undefined;
  readonly readToken?: ((path: string) => string) | undefined;
}

export interface ProxyCallOptions extends ProxyCallDependencies {
  readonly signal?: AbortSignal | undefined;
}

async function readBoundedJson(response: Response, maximum: number): Promise<unknown> {
  const declared = response.headers.get("content-length");
  if (declared !== null && /^\d+$/.test(declared) && Number(declared) > maximum)
    throw new Error("buyer proxy response exceeds its byte limit");
  if (!response.body) throw new Error("buyer proxy response has no body");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    length += part.value.byteLength;
    if (length > maximum) {
      await reader.cancel();
      throw new Error("buyer proxy response exceeds its byte limit");
    }
    chunks.push(part.value);
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)) as unknown;
  } catch {
    throw new Error("buyer proxy response is not valid JSON");
  }
}

function safeError(value: unknown, status: number): { code: string; message: string } {
  let code = "buyer_proxy_error";
  if (typeof value === "object" && value !== null) {
    const error = (value as Record<string, unknown>)["error"];
    if (typeof error === "object" && error !== null) {
      const candidate = (error as Record<string, unknown>)["code"];
      if (
        typeof candidate === "string" &&
        candidate.length <= 128 &&
        /^[A-Za-z0-9_]+$/.test(candidate)
      )
        code = candidate;
    }
  }
  return { code, message: `buyer proxy returned HTTP ${status}` };
}

function projectedHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  for (const name of SAFE_HEADERS) {
    const value = headers.get(name);
    if (value !== null) result[name] = value;
  }
  return result;
}

function authHeaders(config: AdapterConfig, readToken: (path: string) => string) {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${readToken(config.tokenFile)}`,
  };
}

export async function getFree(
  config: AdapterConfig,
  path: string,
  options: ProxyCallOptions = {},
): Promise<Record<string, unknown>> {
  if (!FREE_PATHS.has(path)) throw new Error("unsupported free proxy path");
  const fetchImpl = options.fetch ?? fetch;
  const readToken = options.readToken ?? readProxyToken;
  try {
    const response = await fetchImpl(`${config.proxyOrigin}${path}`, {
      method: "GET",
      headers: authHeaders(config, readToken),
      redirect: "error",
      cache: "no-store",
      signal: options.signal ?? null,
    });
    const value = await readBoundedJson(response, MAX_FREE_RESPONSE_BYTES);
    if (response.status !== 200)
      return { ok: false, status: response.status, error: safeError(value, response.status) };
    return { ok: true, result: value };
  } catch {
    return { ok: false, outcome: "transport_unknown", retry: "human_review" };
  }
}

export async function postPaid(
  config: AdapterConfig,
  path: string,
  body: Record<string, unknown>,
  idempotencyKey: string,
  options: ProxyCallOptions = {},
): Promise<Record<string, unknown>> {
  if (!PAID_PATHS.has(path)) throw new Error("unsupported paid proxy path");
  if (!IDEMPOTENCY.test(idempotencyKey)) throw new Error("idempotency_key is invalid");
  const fetchImpl = options.fetch ?? fetch;
  const readToken = options.readToken ?? readProxyToken;
  try {
    const response = await fetchImpl(`${config.proxyOrigin}${path}`, {
      method: "POST",
      headers: {
        ...authHeaders(config, readToken),
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(body),
      redirect: "error",
      cache: "no-store",
      signal: options.signal ?? null,
    });
    const value = await readBoundedJson(response, MAX_PAID_RESPONSE_BYTES);
    const metadata = projectedHeaders(response.headers);
    if (!response.ok) {
      const retry = metadata["x-onchain-router-retry"] === "never" ? "never" : "human_review";
      return {
        ok: false,
        status: response.status,
        error: safeError(value, response.status),
        metadata,
        retry,
      };
    }
    return { ok: true, result: value, metadata, retry: "never" };
  } catch {
    return {
      ok: false,
      outcome: "transport_unknown",
      message: "local proxy outcome is unknown; inspect receipts and recover with the same key",
      retry: "human_review",
    };
  }
}
