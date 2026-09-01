import { chmodSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  buildProviderCatalog,
  createProxyService,
  parseConfig,
  readProxyToken,
  registerOnchainRouter,
  type ManagedChild,
  type PluginService,
  type ProviderPlugin,
  type UnifiedCatalogPlugin,
} from "../src/index.js";

const TOKEN = "a".repeat(43);

function tokenFile(mode = 0o600): string {
  const directory = mkdtempSync(join(tmpdir(), "onchain-router-openclaw-"));
  const path = join(directory, "proxy-token");
  writeFileSync(path, `${TOKEN}\n`, { mode: 0o600 });
  chmodSync(path, mode);
  return path;
}

describe("Onchain Router OpenClaw adapter", () => {
  it("accepts only an exact loopback buyer proxy origin", () => {
    expect(
      parseConfig({
        proxyOrigin: "http://127.0.0.1:8402",
        tokenFile: "/tmp/proxy-token",
      }),
    ).toEqual({
      proxyOrigin: "http://127.0.0.1:8402",
      tokenFile: "/tmp/proxy-token",
      profileDirectory: "/tmp",
      manageProxy: true,
    });
    expect(() =>
      parseConfig({ proxyOrigin: "https://llm.agenticfi.wtf" }),
    ).toThrow("127.0.0.1");
    expect(() => parseConfig({ proxyOrigin: "http://localhost:8402" })).toThrow(
      "127.0.0.1",
    );
    expect(() =>
      parseConfig({ proxyOrigin: "http://user:pass@127.0.0.1:8402" }),
    ).toThrow("credential-free");
  });

  it("requires an owner-only non-wallet bearer file", () => {
    expect(readProxyToken(tokenFile())).toBe(TOKEN);
    expect(() => readProxyToken(tokenFile(0o644))).toThrow("0600");
    const directory = mkdtempSync(join(tmpdir(), "onchain-router-openclaw-link-"));
    const target = tokenFile();
    const link = join(directory, "proxy-token");
    symlinkSync(target, link);
    expect(() => readProxyToken(link)).toThrow("non-symlink");
  });

  it("registers the official lazy provider catalog without touching the proxy", () => {
    const registered: ProviderPlugin[] = [];
    const unified: UnifiedCatalogPlugin[] = [];
    const services: PluginService[] = [];
    const logs: string[] = [];
    const fetch = vi.fn();
    registerOnchainRouter(
      {
        pluginConfig: {
          proxyOrigin: "http://127.0.0.1:8402",
          tokenFile: tokenFile(),
        },
        logger: {
          info: (message) => logs.push(message),
          warn: vi.fn(),
          error: vi.fn(),
        },
        registerProvider: (provider) => registered.push(provider),
        registerModelCatalogProvider: (provider) => unified.push(provider),
        registerService: (service) => services.push(service),
      },
      { fetch: fetch as unknown as typeof globalThis.fetch },
    );
    expect(registered).toHaveLength(1);
    expect(registered[0]).toMatchObject({
      id: "onchain-router",
      catalog: { order: "simple" },
    });
    expect(unified).toMatchObject([
      { provider: "onchain-router", kinds: ["text"] },
    ]);
    expect(services).toMatchObject([{ id: "onchain-router-buyer-proxy" }]);
    expect(fetch).not.toHaveBeenCalled();
    expect(JSON.stringify(logs)).not.toContain(TOKEN);
  });

  it("reuses a healthy external proxy without starting or stopping a process", async () => {
    const spawnChild = vi.fn();
    const service = createProxyService(
      parseConfig({
        proxyOrigin: "http://127.0.0.1:8402",
        tokenFile: "/tmp/proxy-token",
      }),
      {
        probe: vi.fn(async () => true),
        resolveEntrypoint: vi.fn(() => "/unused"),
        spawnChild,
      },
    );
    const context = serviceContext();
    await service.start(context);
    await service.stop?.(context);
    expect(spawnChild).not.toHaveBeenCalled();
    expect(context.serviceHealth.clearFailure).toHaveBeenCalledOnce();
  });

  it("starts one exact managed proxy and stops only its own child", async () => {
    let probeCount = 0;
    let exitListener: (() => void) | undefined;
    const kill = vi.fn(() => true);
    const child: ManagedChild = {
      pid: 42,
      exitCode: null,
      kill,
      once(_event, listener) {
        exitListener = () => listener(1, null);
        return this;
      },
    };
    const spawnChild = vi.fn(() => child);
    const service = createProxyService(
      parseConfig({
        proxyOrigin: "http://127.0.0.1:8402",
        tokenFile: "/tmp/proxy-token",
      }),
      {
        probe: vi.fn(async () => ++probeCount > 1),
        resolveEntrypoint: () => "/safe/proxy.js",
        spawnChild,
        now: () => 0,
        sleep: vi.fn(async () => undefined),
      },
    );
    const context = serviceContext();
    await Promise.all([service.start(context), service.start(context)]);
    expect(spawnChild).toHaveBeenCalledOnce();
    expect(spawnChild).toHaveBeenCalledWith(
      "/safe/proxy.js",
      ["--profile", "/tmp", "--port", "8402"],
      expect.not.objectContaining({ NODE_AUTH_TOKEN: expect.anything() }),
    );
    exitListener?.();
    expect(context.serviceHealth.reportFailure).toHaveBeenCalledOnce();
    await service.stop?.(context);
    expect(kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("fails closed without a runtime download or process restart", async () => {
    const spawnChild = vi.fn();
    const service = createProxyService(
      parseConfig({
        proxyOrigin: "http://127.0.0.1:8402",
        tokenFile: "/tmp/proxy-token",
        manageProxy: false,
      }),
      { probe: vi.fn(async () => false), spawnChild },
    );
    const context = serviceContext();
    await expect(service.start(context)).rejects.toThrow("human terminal");
    expect(spawnChild).not.toHaveBeenCalled();
  });

  it("terminates one managed child when fixed-port readiness times out", async () => {
    const kill = vi.fn(() => true);
    const child: ManagedChild = {
      pid: 7,
      exitCode: null,
      kill,
      once() {
        return this;
      },
    };
    const times = [0, 16_000];
    const service = createProxyService(
      parseConfig({
        proxyOrigin: "http://127.0.0.1:8402",
        tokenFile: "/tmp/proxy-token",
      }),
      {
        probe: vi.fn(async () => false),
        resolveEntrypoint: () => "/safe/proxy.js",
        spawnChild: () => child,
        now: () => times.shift() ?? 16_000,
        sleep: vi.fn(async () => undefined),
      },
    );
    const context = serviceContext();
    await expect(service.start(context)).rejects.toThrow("failed to become ready");
    expect(kill).toHaveBeenCalledOnce();
    expect(kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("builds only live policy-filtered proxy models when OpenClaw runs the catalog", async () => {
    const fetch = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        expect(init?.redirect).toBe("error");
        expect((init?.headers as Record<string, string>)["authorization"]).toBe(
          `Bearer ${TOKEN}`,
        );
        return new Response(
          JSON.stringify({
            object: "list",
            catalog_version: "catalog-v1",
            categories: [],
            data: [
              {
                id: "gemini-2.5-flash",
                supported_endpoints: ["/v1/chat/completions"],
                max_output_tokens: 8192,
                capabilities: ["text", "vision"],
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    ) as unknown as typeof globalThis.fetch;
    const catalog = await buildProviderCatalog(
      parseConfig({
        proxyOrigin: "http://127.0.0.1:8402",
        tokenFile: tokenFile(),
      }),
      { fetch },
    );
    expect(catalog).toMatchObject({
      baseUrl: "http://127.0.0.1:8402/v1",
      api: "openai-completions",
      models: [{ id: "gemini-2.5-flash", input: ["text", "image"] }],
    });
    expect(JSON.stringify(catalog.models)).not.toContain(TOKEN);
  });
});

function serviceContext() {
  return {
    config: {},
    stateDir: "/tmp",
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    serviceHealth: { reportFailure: vi.fn(), clearFailure: vi.fn() },
  } as const;
}
