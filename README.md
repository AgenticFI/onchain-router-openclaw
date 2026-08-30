# Onchain Router for OpenClaw (private preview)

This is a deliberately thin OpenClaw provider adapter for the separately running Onchain Router
Buyer Runtime proxy. It discovers only models allowed by the human-owned local policy and points
OpenClaw at the proxy's OpenAI-compatible loopback endpoint.

It does **not** create or read a wallet key, unlock a wallet, implement x402, sign payments, store
payment payloads, retry paid requests, provide automatic fallbacks, connect to Base or Solana, or
call Onchain Router production directly. All financial behavior stays in Buyer Runtime. The only
secret it reads is the proxy's non-wallet bearer from its owner-only file.

## Private repository-built check

```bash
pnpm install --ignore-scripts
pnpm check
pnpm qualification:clean-install
```

The adapter is compiled and qualified against the latest stable public OpenClaw package available
during this work, `2026.7.1-2`, on Node 24.19.0. It uses the official `definePluginEntry` and
`catalog.run` provider contract, declares a built `runtimeExtensions` entry, and also registers the
unified live text-model catalog used by current picker and discovery surfaces. Both catalogs remain
lazy: plugin registration performs no proxy request and does not read the bearer file.

`qualification:clean-install` builds and packs the adapter, installs the archive through OpenClaw's
managed plugin installer in a fresh temporary state directory, loads the installed runtime for
inspection, and deletes the temporary state. It neither starts Buyer Runtime nor makes a paid
request.

Start and unlock Buyer Runtime in a human terminal, then start the local buyer proxy before loading
this plugin. The default boundary is:

```text
proxy origin: http://127.0.0.1:8402
token file:   ~/.onchain-router/proxy-token
```

The adapter is unpublished and not deployed. It performs no paid request during installation,
registration, or managed-install qualification. A model call made later by an authorized OpenClaw user is still subject to all Buyer
Runtime model, amount, session, hourly, daily, recipient, network, and confirmation limits.

Smart selection is exposed by `@onchain-router/client` in the main repository and remains separate
from this adapter's explicit-model provider registration. No ambiguous paid outcome is
automatically replayed on another model.
