import type {
  OpenClawPluginApi,
  ProviderCatalogResult,
} from "openclaw/plugin-sdk/plugin-entry";

export type PluginApi = Pick<
  OpenClawPluginApi,
  | "pluginConfig"
  | "logger"
  | "registerProvider"
  | "registerModelCatalogProvider"
>;

export type ProviderPlugin = Parameters<
  OpenClawPluginApi["registerProvider"]
>[0];

export type UnifiedCatalogPlugin = Parameters<
  OpenClawPluginApi["registerModelCatalogProvider"]
>[0];

export type ProviderConfig = Extract<
  ProviderCatalogResult,
  { provider: unknown }
>["provider"];

export interface ProxyModel {
  readonly id: string;
  readonly capabilities: readonly string[];
  readonly maxOutputTokens: number;
}
