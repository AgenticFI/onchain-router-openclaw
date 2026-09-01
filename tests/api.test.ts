import { describe, expect, it, vi } from "vitest";
import { getFree, parseConfig, postPaid } from "../src/index.js";

const TOKEN = "s".repeat(43);
const config = parseConfig({
  proxyOrigin: "http://127.0.0.1:8402",
  tokenFile: "/tmp/proxy-token",
});
const token = () => TOKEN;

describe("bounded proxy API", () => {
  it("performs one authenticated no-store free request", async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init).toMatchObject({ method: "GET", redirect: "error", cache: "no-store" });
      expect((init?.headers as Record<string, string>)["Authorization"]).toBe(`Bearer ${TOKEN}`);
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof globalThis.fetch;
    await expect(getFree(config, "/v1/models", { fetch, readToken: token })).resolves.toEqual({
      ok: true,
      result: { data: [] },
    });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("rejects unlisted free and paid paths before any network request", async () => {
    const fetch = vi.fn();
    await expect(getFree(config, "/health/live", { fetch, readToken: token })).rejects.toThrow("unsupported");
    await expect(postPaid(config, "/v1/chat/completions", {}, "same-key", { fetch, readToken: token })).rejects.toThrow("unsupported");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects malformed idempotency keys before any paid request", async () => {
    const fetch = vi.fn();
    await expect(postPaid(config, "/v1/audio/speech", {}, "space key", { fetch, readToken: token })).rejects.toThrow("idempotency_key");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("forwards a stable paid identity once and exposes only safe metadata", async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>)["Idempotency-Key"]).toBe("image-key-001");
      return new Response(JSON.stringify({ data: [{ url: "https://example.invalid/image" }] }), {
        status: 200,
        headers: {
          "x-receipt-id": "receipt-1",
          "x-payment-actual-atomic": "123",
          "set-cookie": "must-not-leak",
        },
      });
    }) as unknown as typeof globalThis.fetch;
    const response = await postPaid(
      config,
      "/v1/images/generations",
      { model: "image", prompt: "circle" },
      "image-key-001",
      { fetch, readToken: token },
    );
    expect(fetch).toHaveBeenCalledOnce();
    expect(response["metadata"]).toEqual({
      "x-receipt-id": "receipt-1",
      "x-payment-actual-atomic": "123",
    });
    expect(JSON.stringify(response)).not.toContain(TOKEN);
    expect(JSON.stringify(response)).not.toContain("must-not-leak");
  });

  it("does not replay an ambiguous paid transport outcome", async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError("lost response");
    }) as unknown as typeof globalThis.fetch;
    await expect(
      postPaid(config, "/v1/audio/speech", { model: "speech", input: "hello" }, "speech-key", {
        fetch,
        readToken: token,
      }),
    ).resolves.toEqual({
      ok: false,
      outcome: "transport_unknown",
      message: "local proxy outcome is unknown; inspect receipts and recover with the same key",
      retry: "human_review",
    });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("does not expose an upstream error message or unknown headers", async () => {
    const fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: { code: "declined", message: `secret ${TOKEN}` } }), {
        status: 402,
        headers: { "x-onchain-router-retry": "never", "x-internal-debug": TOKEN },
      }),
    ) as unknown as typeof globalThis.fetch;
    const response = await postPaid(config, "/v1/audio/speech", {}, "speech-key", { fetch, readToken: token });
    expect(response).toMatchObject({
      ok: false,
      status: 402,
      error: { code: "declined", message: "buyer proxy returned HTTP 402" },
      retry: "never",
    });
    expect(JSON.stringify(response)).not.toContain(TOKEN);
  });

  it("fails closed on declared oversize and invalid JSON responses", async () => {
    const oversize = vi.fn(async () =>
      new Response("{}", { headers: { "content-length": String(4 * 1024 * 1024 + 1) } }),
    ) as unknown as typeof globalThis.fetch;
    await expect(getFree(config, "/v1/models", { fetch: oversize, readToken: token })).resolves.toMatchObject({
      ok: false,
      outcome: "transport_unknown",
    });
    const invalid = vi.fn(async () => new Response("not-json")) as unknown as typeof globalThis.fetch;
    await expect(getFree(config, "/v1/models", { fetch: invalid, readToken: token })).resolves.toMatchObject({
      ok: false,
      outcome: "transport_unknown",
    });
  });

  it("passes cancellation to the single paid attempt", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.signal?.aborted).toBe(true);
      throw new DOMException("aborted", "AbortError");
    }) as unknown as typeof globalThis.fetch;
    const response = await postPaid(config, "/v1/audio/speech", {}, "speech-key", {
      fetch,
      readToken: token,
      signal: controller.signal,
    });
    expect(response["outcome"]).toBe("transport_unknown");
    expect(fetch).toHaveBeenCalledOnce();
  });
});
