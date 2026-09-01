import { describe, expect, it, vi } from "vitest";
import { COMMAND_HELP, dispatchCommand, parseConfig } from "../src/index.js";

const config = parseConfig({
  proxyOrigin: "http://127.0.0.1:8402",
  tokenFile: "/tmp/proxy-token",
  manageProxy: false,
});

describe("native OpenClaw command", () => {
  it("renders complete help without touching the proxy", async () => {
    const fetch = vi.fn();
    await expect(dispatchCommand(config, "help", { fetch })).resolves.toBe(COMMAND_HELP);
    expect(COMMAND_HELP).toContain("models");
    expect(COMMAND_HELP).toContain("recovery");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns redacted status from the free catalog probe", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ data: [] }))) as unknown as typeof globalThis.fetch;
    const output = await dispatchCommand(config, "status", { fetch, readToken: () => "t".repeat(43) });
    expect(output).toContain("Reachable: true");
    expect(output).toContain("Managed:   false");
    expect(output).not.toContain("t".repeat(43));
  });

  it.each([
    ["models", "/v1/models"],
    ["pricing", "/v1/pricing"],
    ["voices", "/v1/audio/voices"],
  ])("routes %s only to its free path", async (command, expectedPath) => {
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(`http://127.0.0.1:8402${expectedPath}`);
      return new Response(JSON.stringify({ command }));
    }) as unknown as typeof globalThis.fetch;
    const output = await dispatchCommand(config, command, { fetch, readToken: () => "t".repeat(43) });
    expect(output).toContain(String(command));
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("provides same-key recovery instructions without accepting secrets", async () => {
    const output = await dispatchCommand(config, "recovery");
    expect(output).toContain("original idempotency key");
    expect(output).toContain("Never paste");
  });

  it("keeps doctor output path- and secret-free", async () => {
    const output = await dispatchCommand(config, "doctor", {
      readToken: () => "t".repeat(43),
      fetch: vi.fn(async () => new Response(JSON.stringify({ data: [] }))) as unknown as typeof globalThis.fetch,
    });
    expect(output).toContain("PASS owner_only_bearer");
    expect(output).not.toContain("/tmp/proxy-token");
    expect(output).not.toContain("t".repeat(43));
  });

  it("fails an unknown subcommand into bounded help", async () => {
    const output = await dispatchCommand(config, "wallet export");
    expect(output).toContain("Unknown subcommand");
    expect(output).toContain("human-terminal operations");
  });
});
