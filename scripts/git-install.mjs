import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(process.cwd());
const state = mkdtempSync(join(tmpdir(), "onchain-router-openclaw-git-state-"));
const environment = {
  ...process.env,
  OPENCLAW_STATE_DIR: state,
  OPENCLAW_CONFIG_PATH: join(state, "openclaw.json"),
};

try {
  const revision = run("git", ["rev-parse", "HEAD"], true).trim();
  if (!/^[0-9a-f]{40}$/.test(revision)) throw new Error("Git release revision is invalid");
  const source = `git:${pathToFileURL(root).href}#${revision}`;
  run("pnpm", [
    "exec",
    "openclaw",
    "plugins",
    "install",
    source,
    "--force",
    "--accept-capabilities",
  ]);
  const inspection = parseJsonOutput(
    run(
      "pnpm",
      ["exec", "openclaw", "plugins", "inspect", "onchain-router", "--runtime", "--json"],
      true,
    ),
  );
  const serialized = JSON.stringify(inspection);
  if (!serialized.includes("onchain-router") || !serialized.includes("dist/index.js")) {
    throw new Error("Git-installed plugin omitted its runtime registration");
  }
  if (!serialized.includes("onchain_router_image_generate")) {
    throw new Error("Git-installed plugin omitted its declared media tools");
  }
  const protectedValues = [
    process.env.ONCHAIN_ROUTER_PROXY_TOKEN,
    process.env.PAYMENT_SIGNATURE,
    process.env.RECEIPT_TOKEN,
  ].filter((value) => typeof value === "string" && value.length >= 8);
  if (protectedValues.some((value) => serialized.includes(value))) {
    throw new Error("Git install inspection exposed a protected value");
  }
  run("pnpm", ["exec", "openclaw", "plugins", "uninstall", "onchain-router", "--force"]);
  console.log("openclaw_native_git_install_ok");
} finally {
  rmSync(state, { recursive: true, force: true });
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
  if (start < 0 || end < start) throw new Error("OpenClaw inspection did not return JSON");
  return JSON.parse(output.slice(start, end + 1));
}

function sanitize(value) {
  return String(value).replace(/[A-Za-z0-9_-]{43,}/g, "[redacted]");
}
