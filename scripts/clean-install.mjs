import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(process.cwd());
const state = mkdtempSync(join(tmpdir(), "onchain-router-openclaw-state-"));
const artifacts = mkdtempSync(join(tmpdir(), "onchain-router-openclaw-pack-"));
const environment = {
  ...process.env,
  OPENCLAW_STATE_DIR: state,
  OPENCLAW_CONFIG_PATH: join(state, "openclaw.json"),
};

try {
  run("pnpm", ["build"]);
  run("pnpm", ["pack", "--pack-destination", artifacts]);
  const archives = readdirSync(artifacts).filter((entry) =>
    entry.endsWith(".tgz"),
  );
  if (archives.length !== 1)
    throw new Error("clean install produced an unexpected archive set");
  const archive = join(artifacts, archives[0]);
  run("pnpm", [
    "exec",
    "openclaw",
    "plugins",
    "install",
    archive,
    "--force",
    "--accept-capabilities",
  ]);
  const inspection = run(
    "pnpm",
    [
      "exec",
      "openclaw",
      "plugins",
      "inspect",
      "onchain-router",
      "--runtime",
      "--json",
    ],
    true,
  );
  const parsed = parseJsonOutput(inspection);
  const text = JSON.stringify(parsed);
  if (!text.includes("onchain-router") || !text.includes("dist/index.js"))
    throw new Error(
      "clean install inspection omitted the managed runtime entry",
    );
  const protectedValues = [
    process.env.ONCHAIN_ROUTER_PROXY_TOKEN,
    process.env.PAYMENT_SIGNATURE,
    process.env.RECEIPT_TOKEN,
  ].filter((value) => typeof value === "string" && value.length >= 8);
  if (protectedValues.some((value) => text.includes(value)))
    throw new Error("clean install inspection exposed a protected value");

  const packedPackage = JSON.parse(
    readFileSync(join(root, "package.json"), "utf8"),
  );
  if (
    packedPackage.openclaw?.runtimeExtensions?.[0] !== "./dist/index.js" ||
    packedPackage.openclaw?.compat?.pluginApi !== ">=2026.8.1" ||
    packedPackage.name !== "@agenticfi/onchain-router-openclaw" ||
    packedPackage.dependencies?.["@agenticfi/onchain-router-proxy"] !== "0.1.0"
  )
    throw new Error("clean install package metadata drifted");
  console.log("openclaw_clean_install_ok");
} finally {
  rmSync(state, { recursive: true, force: true });
  rmSync(artifacts, { recursive: true, force: true });
}

function run(command, args, capture = false) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: environment,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.status !== 0) {
    if (capture) process.stderr.write(sanitize(result.stderr));
    throw new Error(`${command} failed with status ${String(result.status)}`);
  }
  return capture ? result.stdout : "";
}

function parseJsonOutput(output) {
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  if (start < 0 || end < start)
    throw new Error("OpenClaw inspection did not return JSON");
  return JSON.parse(output.slice(start, end + 1));
}

function sanitize(value) {
  return String(value).replace(/[A-Za-z0-9_-]{43,}/g, "[redacted]");
}
