import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { parseConfig, readProxyToken, registerOnchainRouter, type ProviderPlugin } from '../src/index.js';

const TOKEN = 'a'.repeat(43);

function tokenFile(mode = 0o600): string {
  const directory = mkdtempSync(join(tmpdir(), 'onchain-router-openclaw-'));
  const path = join(directory, 'proxy-token');
  writeFileSync(path, `${TOKEN}\n`, { mode: 0o600 });
  chmodSync(path, mode);
  return path;
}

describe('Onchain Router OpenClaw adapter', () => {
  it('accepts only an exact loopback buyer proxy origin', () => {
    expect(parseConfig({ proxyOrigin: 'http://127.0.0.1:8402', tokenFile: '/tmp/x' })).toEqual({
      proxyOrigin: 'http://127.0.0.1:8402',
      tokenFile: '/tmp/x',
    });
    expect(() => parseConfig({ proxyOrigin: 'https://llm.agenticfi.wtf' })).toThrow('127.0.0.1');
    expect(() => parseConfig({ proxyOrigin: 'http://localhost:8402' })).toThrow('127.0.0.1');
    expect(() => parseConfig({ proxyOrigin: 'http://user:pass@127.0.0.1:8402' })).toThrow(
      'credential-free',
    );
  });

  it('requires an owner-only non-wallet bearer file', () => {
    expect(readProxyToken(tokenFile())).toBe(TOKEN);
    expect(() => readProxyToken(tokenFile(0o644))).toThrow('0600');
  });

  it('registers only live policy-filtered proxy models and never logs the bearer', async () => {
    const registered: ProviderPlugin[] = [];
    const logs: string[] = [];
    const fetch = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(init?.redirect).toBe('error');
      expect((init?.headers as Record<string, string>)['authorization']).toBe(`Bearer ${TOKEN}`);
      return new Response(
        JSON.stringify({
          object: 'list',
          catalog_version: 'catalog-v1',
          categories: [],
          data: [
            {
              id: 'gemini-2.5-flash',
              supported_endpoints: ['/v1/chat/completions'],
              max_output_tokens: 8192,
              capabilities: ['text', 'vision'],
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as unknown as typeof globalThis.fetch;
    await registerOnchainRouter(
      {
        pluginConfig: { proxyOrigin: 'http://127.0.0.1:8402', tokenFile: tokenFile() },
        logger: { info: (message) => logs.push(message), warn: vi.fn(), error: vi.fn() },
        registerProvider: (provider) => registered.push(provider),
      },
      { fetch },
    );
    expect(registered).toHaveLength(1);
    expect(registered[0]).toMatchObject({
      id: 'onchain-router',
      models: {
        baseUrl: 'http://127.0.0.1:8402/v1',
        models: [{ id: 'gemini-2.5-flash', input: ['text', 'image'] }],
      },
    });
    expect(JSON.stringify(logs)).not.toContain(TOKEN);
  });
});
