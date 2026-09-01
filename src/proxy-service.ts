import { spawn } from "node:child_process";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import process from "node:process";
import { fetchProxyModels } from "./catalog.js";
import { readProxyToken, type AdapterConfig } from "./config.js";
import type { PluginService } from "./types.js";

const PROXY_PACKAGE = "@agenticfi/onchain-router-proxy";
const PROXY_VERSION = "0.1.0";
const START_TIMEOUT_MS = 15_000;
const PROBE_INTERVAL_MS = 100;
const MAX_PACKAGE_JSON_BYTES = 16 * 1024;

export interface ManagedChild {
  readonly pid?: number | undefined;
  readonly exitCode: number | null;
  kill(signal?: NodeJS.Signals): boolean;
  once(event: "exit", listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
}

export interface ProxyServiceDependencies {
  readonly probe?: (config: AdapterConfig) => Promise<boolean>;
  readonly resolveEntrypoint?: () => string;
  readonly spawnChild?: (
    entrypoint: string,
    args: readonly string[],
    env: NodeJS.ProcessEnv,
  ) => ManagedChild;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly now?: () => number;
}

function safeChildEnvironment(): NodeJS.ProcessEnv {
  const allowed = [
    "HOME",
    "LANG",
    "LC_ALL",
    "LOGNAME",
    "PATH",
    "SHELL",
    "TMPDIR",
    "USER",
    "XDG_CONFIG_HOME",
    "XDG_DATA_HOME",
  ] as const;
  const environment: NodeJS.ProcessEnv = {};
  for (const name of allowed) {
    const value = process.env[name];
    if (value !== undefined) environment[name] = value;
  }
  return environment;
}

export function resolveProxyEntrypoint(): string {
  const require = createRequire(import.meta.url);
  const packageJsonPath = realpathSync(require.resolve(`${PROXY_PACKAGE}/package.json`));
  const metadata = lstatSync(packageJsonPath);
  if (!metadata.isFile() || metadata.size < 2 || metadata.size > MAX_PACKAGE_JSON_BYTES)
    throw new Error("installed buyer proxy package metadata is invalid");
  const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8")) as Record<string, unknown>;
  if (parsed["name"] !== PROXY_PACKAGE || parsed["version"] !== PROXY_VERSION)
    throw new Error(`buyer proxy must be exactly ${PROXY_PACKAGE}@${PROXY_VERSION}`);
  const bin = parsed["bin"];
  const relative =
    typeof bin === "object" && bin !== null
      ? (bin as Record<string, unknown>)["onchain-router-proxy"]
      : undefined;
  if (typeof relative !== "string" || isAbsolute(relative))
    throw new Error("installed buyer proxy package has no safe executable");
  const packageDirectory = dirname(packageJsonPath);
  const entrypoint = realpathSync(resolve(packageDirectory, relative));
  if (!entrypoint.startsWith(`${realpathSync(packageDirectory)}${sep}`))
    throw new Error("installed buyer proxy executable escapes its package");
  const executable = lstatSync(entrypoint);
  if (!executable.isFile()) throw new Error("installed buyer proxy executable is not a file");
  if (typeof process.getuid === "function" && executable.uid !== process.getuid())
    throw new Error("installed buyer proxy executable must be owned by the current user");
  return entrypoint;
}

async function defaultProbe(config: AdapterConfig): Promise<boolean> {
  try {
    const token = readProxyToken(config.tokenFile);
    await fetchProxyModels(config.proxyOrigin, token);
    return true;
  } catch {
    return false;
  }
}

function defaultSpawn(
  entrypoint: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
): ManagedChild {
  return spawn(process.execPath, [entrypoint, ...args], {
    env,
    stdio: "ignore",
  });
}

export function createProxyService(
  config: AdapterConfig,
  dependencies: ProxyServiceDependencies = {},
): PluginService {
  const probe = dependencies.probe ?? defaultProbe;
  const resolveEntrypoint = dependencies.resolveEntrypoint ?? resolveProxyEntrypoint;
  const spawnChild = dependencies.spawnChild ?? defaultSpawn;
  const sleep =
    dependencies.sleep ?? ((milliseconds) => new Promise((done) => setTimeout(done, milliseconds)));
  const now = dependencies.now ?? Date.now;
  let child: ManagedChild | undefined;
  let stopping = false;
  let startPromise: Promise<void> | undefined;

  async function startInternal(context: Parameters<PluginService["start"]>[0]): Promise<void> {
    stopping = false;
    if (await probe(config)) {
      context.serviceHealth?.clearFailure();
      context.logger.info(`Onchain Router reused the buyer proxy at ${config.proxyOrigin}.`);
      return;
    }
    if (!config.manageProxy)
      throw new Error("buyer proxy is unavailable; start onchain-router-proxy in a human terminal");

    const entrypoint = resolveEntrypoint();
    const port = new URL(config.proxyOrigin).port || "80";
    child = spawnChild(
      entrypoint,
      ["--profile", config.profileDirectory, "--port", port],
      safeChildEnvironment(),
    );
    child.once("exit", () => {
      if (!stopping)
        context.serviceHealth?.reportFailure(
          new Error("managed buyer proxy exited; paid requests were not replayed"),
        );
    });

    const deadline = now() + START_TIMEOUT_MS;
    while (now() < deadline) {
      if (child.exitCode !== null) break;
      if (await probe(config)) {
        context.serviceHealth?.clearFailure();
        context.logger.info(`Onchain Router started the buyer proxy at ${config.proxyOrigin}.`);
        return;
      }
      await sleep(PROBE_INTERVAL_MS);
    }
    if (child.exitCode === null) child.kill("SIGTERM");
    child = undefined;
    throw new Error("buyer proxy failed to become ready; no paid request was attempted");
  }

  return {
    id: "onchain-router-buyer-proxy",
    async start(context) {
      if (!startPromise) {
        startPromise = startInternal(context).catch((error: unknown) => {
          context.serviceHealth?.reportFailure(error);
          startPromise = undefined;
          throw error;
        });
      }
      await startPromise;
    },
    async stop() {
      stopping = true;
      if (child?.exitCode === null) child.kill("SIGTERM");
      child = undefined;
      startPromise = undefined;
    },
  };
}
