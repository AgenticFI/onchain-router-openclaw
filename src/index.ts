import { fetchProxyModels } from './catalog.js';
import { parseConfig, readProxyToken } from './config.js';
import type { PluginApi, PluginDefinition, ProviderPlugin } from './types.js';

export const VERSION = '0.1.0';

export async function registerOnchainRouter(
  api: PluginApi,
  dependencies: { readonly fetch?: typeof fetch } = {},
): Promise<void> {
  const config = parseConfig(api.pluginConfig);
  const token = readProxyToken(config.tokenFile);
  const models = await fetchProxyModels(config.proxyOrigin, token, dependencies.fetch);
  const provider: ProviderPlugin = {
    id: 'onchain-router',
    label: 'Onchain Router',
    docsPath: 'https://llm.agenticfi.wtf/docs',
    aliases: ['ocr'],
    envVars: [],
    models: {
      baseUrl: `${config.proxyOrigin}/v1`,
      apiKey: token,
      api: 'openai-completions',
      authHeader: true,
      models: models.map((model) => ({
        id: model.id,
        name: model.id,
        api: 'openai-completions',
        reasoning: true,
        input: model.capabilities.includes('vision') ? ['text', 'image'] : ['text'],
        // Display metadata only. Buyer Runtime uses live request-bound quotes and durable receipts.
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: Math.max(model.maxOutputTokens, 8_192),
        maxTokens: model.maxOutputTokens,
      })),
    },
    auth: [],
  };
  api.registerProvider(provider);
  api.logger.info(
    `Onchain Router registered ${models.length} policy-allowed model${models.length === 1 ? '' : 's'} through ${config.proxyOrigin}.`,
  );
}

const plugin: PluginDefinition = {
  id: 'onchain-router',
  name: 'Onchain Router',
  description: 'Policy-bounded, receipt-backed LLM calls through Buyer Runtime',
  version: VERSION,
  register: registerOnchainRouter,
};

export { fetchProxyModels } from './catalog.js';
export { parseConfig, readProxyToken, type AdapterConfig } from './config.js';
export type { PluginApi, PluginDefinition, ProviderPlugin, ProxyModel } from './types.js';
export default plugin;
