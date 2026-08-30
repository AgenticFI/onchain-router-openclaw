export type ModelDefinition = {
  id: string;
  name: string;
  api: 'openai-completions';
  reasoning: boolean;
  input: Array<'text' | 'image'>;
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
  contextWindow: number;
  maxTokens: number;
};

export type ProviderPlugin = {
  id: string;
  label: string;
  docsPath: string;
  aliases: string[];
  envVars: string[];
  models: {
    baseUrl: string;
    apiKey: string;
    api: 'openai-completions';
    authHeader: true;
    models: ModelDefinition[];
  };
  auth: [];
};

export type PluginApi = {
  pluginConfig?: Record<string, unknown>;
  logger: {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
  };
  registerProvider(provider: ProviderPlugin): void;
};

export type PluginDefinition = {
  id: string;
  name: string;
  description: string;
  version: string;
  register(api: PluginApi): Promise<void>;
};

export interface ProxyModel {
  readonly id: string;
  readonly capabilities: readonly string[];
  readonly maxOutputTokens: number;
}
