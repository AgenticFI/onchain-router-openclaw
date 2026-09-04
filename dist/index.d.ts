import * as openclaw_plugin_sdk_plugin_entry from 'openclaw/plugin-sdk/plugin-entry';
import { OpenClawPluginApi, ProviderCatalogResult, AnyAgentTool } from 'openclaw/plugin-sdk/plugin-entry';

interface AdapterConfig {
    readonly proxyOrigin: string;
    readonly tokenFile: string;
    readonly profileDirectory: string;
    readonly manageProxy: boolean;
}
declare function parseConfig(value: Record<string, unknown> | undefined): AdapterConfig;
declare function readProxyToken(path: string): string;

type PluginApi = Pick<OpenClawPluginApi, "pluginConfig" | "logger" | "registerProvider" | "registerModelCatalogProvider" | "registerService" | "registerCommand" | "registerTool">;
type ProviderPlugin = Parameters<OpenClawPluginApi["registerProvider"]>[0];
type UnifiedCatalogPlugin = Parameters<OpenClawPluginApi["registerModelCatalogProvider"]>[0];
type PluginService = Parameters<OpenClawPluginApi["registerService"]>[0];
type ProviderConfig = Extract<ProviderCatalogResult, {
    provider: unknown;
}>["provider"];
interface ProxyModel {
    readonly id: string;
    readonly capabilities: readonly string[];
    readonly maxOutputTokens: number;
}

interface ManagedChild {
    readonly pid?: number | undefined;
    readonly exitCode: number | null;
    kill(signal?: NodeJS.Signals): boolean;
    once(event: "exit", listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
}
interface ProxyServiceDependencies {
    readonly probe?: (config: AdapterConfig) => Promise<boolean>;
    readonly resolveEntrypoint?: () => string;
    readonly spawnChild?: (entrypoint: string, args: readonly string[], env: NodeJS.ProcessEnv) => ManagedChild;
    readonly sleep?: (milliseconds: number) => Promise<void>;
    readonly now?: () => number;
}
declare function resolveProxyEntrypoint(): string;
declare function createProxyService(config: AdapterConfig, dependencies?: ProxyServiceDependencies): PluginService;

declare function fetchProxyModels(origin: string, token: string, fetchImplementation?: typeof fetch): Promise<readonly ProxyModel[]>;

interface ProxyCallDependencies {
    readonly fetch?: typeof fetch | undefined;
    readonly readToken?: ((path: string) => string) | undefined;
}
interface ProxyCallOptions extends ProxyCallDependencies {
    readonly signal?: AbortSignal | undefined;
}
declare function getFree(config: AdapterConfig, path: string, options?: ProxyCallOptions): Promise<Record<string, unknown>>;
declare function postPaid(config: AdapterConfig, path: string, body: Record<string, unknown>, idempotencyKey: string, options?: ProxyCallOptions): Promise<Record<string, unknown>>;

declare const COMMAND_HELP: string;
declare function dispatchCommand(config: AdapterConfig, rawArgs: string | undefined, dependencies?: ProxyCallDependencies): Promise<string>;

declare function validateImage(value: unknown): [string, Record<string, unknown>];
declare function validateSpeech(value: unknown): [string, Record<string, unknown>];
declare function validateTranscription(value: unknown): [string, Record<string, unknown>];

declare function createOnchainRouterTools(config: AdapterConfig, dependencies?: ProxyCallDependencies): AnyAgentTool[];

declare const VERSION = "0.2.0";
declare function stableTurnIdempotencyKey(sessionId: string | undefined, turnId: string, modelId: string): string;
declare function registerOnchainRouter(api: PluginApi, dependencies?: {
    readonly fetch?: typeof fetch;
    readonly proxyService?: ProxyServiceDependencies;
}): void;
declare function buildProviderCatalog(config: ReturnType<typeof parseConfig>, dependencies?: {
    readonly fetch?: typeof fetch;
}): Promise<ProviderConfig>;
declare const plugin: Omit<{
    id: string;
    name: string;
    description: string;
    kind?: openclaw_plugin_sdk_plugin_entry.OpenClawPluginDefinition["kind"];
    configSchema?: openclaw_plugin_sdk_plugin_entry.OpenClawPluginConfigSchema | (() => openclaw_plugin_sdk_plugin_entry.OpenClawPluginConfigSchema);
    reload?: openclaw_plugin_sdk_plugin_entry.OpenClawPluginDefinition["reload"];
    nodeHostCommands?: openclaw_plugin_sdk_plugin_entry.OpenClawPluginDefinition["nodeHostCommands"];
    securityAuditCollectors?: openclaw_plugin_sdk_plugin_entry.OpenClawPluginDefinition["securityAuditCollectors"];
    register: NonNullable<openclaw_plugin_sdk_plugin_entry.OpenClawPluginDefinition["register"]>;
}, "configSchema"> & {
    configSchema: openclaw_plugin_sdk_plugin_entry.OpenClawPluginConfigSchema;
};

export { type AdapterConfig, COMMAND_HELP, type ManagedChild, type PluginApi, type PluginService, type ProviderConfig, type ProviderPlugin, type ProxyModel, type ProxyServiceDependencies, type UnifiedCatalogPlugin, VERSION, buildProviderCatalog, createOnchainRouterTools, createProxyService, plugin as default, dispatchCommand, fetchProxyModels, getFree, parseConfig, postPaid, readProxyToken, registerOnchainRouter, resolveProxyEntrypoint, stableTurnIdempotencyKey, validateImage, validateSpeech, validateTranscription };
