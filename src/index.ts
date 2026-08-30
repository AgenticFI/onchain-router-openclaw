import {
  definePluginEntry,
  type OpenClawPluginDefinition,
} from "openclaw/plugin-sdk/plugin-entry";
import { fetchProxyModels } from "./catalog.js";
import { parseConfig, readProxyToken } from "./config.js";
import type {
  PluginApi,
  ProviderConfig,
  ProviderPlugin,
  UnifiedCatalogPlugin,
} from "./types.js";

export const VERSION = "0.1.0";

export function registerOnchainRouter(
  api: PluginApi,
  dependencies: { readonly fetch?: typeof fetch } = {},
): void {
  const config = parseConfig(api.pluginConfig);
  const provider: ProviderPlugin = {
    id: "onchain-router",
    label: "Onchain Router",
    docsPath: "https://llm.agenticfi.wtf/docs",
    aliases: ["ocr"],
    envVars: [],
    catalog: {
      order: "simple",
      run: async () => ({
        provider: await buildProviderCatalog(config, dependencies),
      }),
    },
    auth: [],
  };
  api.registerProvider(provider);
  const unifiedCatalog: UnifiedCatalogPlugin = {
    provider: "onchain-router",
    kinds: ["text"],
    liveCatalog: async () => {
      const models = await fetchConfiguredModels(config, dependencies);
      return models.map((model) => ({
        kind: "text" as const,
        provider: "onchain-router",
        model: model.id,
        label: model.id,
        source: "live" as const,
      }));
    },
  };
  api.registerModelCatalogProvider(unifiedCatalog);
  api.logger.info(
    `Onchain Router registered its policy-filtered catalog through ${config.proxyOrigin}.`,
  );
}

export async function buildProviderCatalog(
  config: ReturnType<typeof parseConfig>,
  dependencies: { readonly fetch?: typeof fetch } = {},
): Promise<ProviderConfig> {
  const token = readProxyToken(config.tokenFile);
  const models = await fetchConfiguredModels(config, dependencies, token);
  return {
    baseUrl: `${config.proxyOrigin}/v1`,
    apiKey: token,
    api: "openai-completions" as const,
    models: models.map((model) => ({
      id: model.id,
      name: model.id,
      reasoning: true,
      input: model.capabilities.includes("vision")
        ? ["text", "image"]
        : ["text"],
      // OpenClaw display metadata only. Buyer Runtime uses request-bound integer quotes.
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: Math.max(model.maxOutputTokens, 8_192),
      maxTokens: model.maxOutputTokens,
    })),
  };
}

async function fetchConfiguredModels(
  config: ReturnType<typeof parseConfig>,
  dependencies: { readonly fetch?: typeof fetch },
  token = readProxyToken(config.tokenFile),
) {
  return await fetchProxyModels(config.proxyOrigin, token, dependencies.fetch);
}

const plugin: OpenClawPluginDefinition = definePluginEntry({
  id: "onchain-router",
  name: "Onchain Router",
  description: "Policy-bounded, receipt-backed LLM calls through Buyer Runtime",
  register(api) {
    registerOnchainRouter(api);
  },
});

export { fetchProxyModels } from "./catalog.js";
export { parseConfig, readProxyToken, type AdapterConfig } from "./config.js";
export type {
  PluginApi,
  ProviderConfig,
  ProviderPlugin,
  ProxyModel,
  UnifiedCatalogPlugin,
} from "./types.js";
export default plugin;
