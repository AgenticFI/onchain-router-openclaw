import { describe, expect, it, vi } from "vitest";
import { createOnchainRouterTools, parseConfig } from "../src/index.js";

const config = parseConfig({ proxyOrigin: "http://127.0.0.1:8402", tokenFile: "/tmp/proxy-token" });
const token = () => "z".repeat(43);

describe("OpenClaw agent tools", () => {
  it("registers matching discovery and media names", () => {
    expect(createOnchainRouterTools(config).map((tool) => tool.name)).toEqual([
      "onchain_router_models",
      "onchain_router_pricing",
      "onchain_router_voices",
      "onchain_router_image_generate",
      "onchain_router_speech_generate",
      "onchain_router_transcribe",
    ]);
  });

  it("uses the caller key for exactly one paid tool request", async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>)["Idempotency-Key"]).toBe("tool-image-1");
      return new Response(JSON.stringify({ data: [{ url: "https://example.invalid/i" }] }));
    }) as unknown as typeof globalThis.fetch;
    const tool = createOnchainRouterTools(config, { fetch, readToken: token }).find((item) => item.name === "onchain_router_image_generate");
    const response = await tool?.execute("call-1", {
      idempotency_key: "tool-image-1", model: "image", prompt: "circle",
    });
    expect(fetch).toHaveBeenCalledOnce();
    expect(JSON.stringify(response)).toContain("https://example.invalid/i");
  });

  it("rejects invalid paid input without reading a token or calling the proxy", async () => {
    const fetch = vi.fn();
    const readToken = vi.fn();
    const tool = createOnchainRouterTools(config, { fetch, readToken }).find((item) => item.name === "onchain_router_speech_generate");
    const response = await tool?.execute("call-1", { model: "speech", input: "hello" });
    expect(JSON.stringify(response)).toContain("invalid_input");
    expect(fetch).not.toHaveBeenCalled();
    expect(readToken).not.toHaveBeenCalled();
  });

  it("returns a human-review outcome after one lost paid response", async () => {
    const fetch = vi.fn(async () => { throw new TypeError("lost"); }) as unknown as typeof globalThis.fetch;
    const tool = createOnchainRouterTools(config, { fetch, readToken: token }).find((item) => item.name === "onchain_router_speech_generate");
    const response = await tool?.execute("call-1", {
      idempotency_key: "tool-speech-1", model: "speech", input: "hello",
    });
    expect(fetch).toHaveBeenCalledOnce();
    expect(JSON.stringify(response)).toContain("human_review");
  });
});
