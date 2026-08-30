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
pnpm install
pnpm check
```

Start and unlock Buyer Runtime in a human terminal, then start the local buyer proxy before loading
this plugin. The default boundary is:

```text
proxy origin: http://127.0.0.1:8402
token file:   ~/.onchain-router/proxy-token
```

The adapter is unpublished and not deployed. It performs no paid request during installation or
registration. A model call made later by an authorized OpenClaw user is still subject to all Buyer
Runtime model, amount, session, hourly, daily, recipient, network, and confirmation limits.

Smart selection is exposed by `@onchain-router/client` in the main repository and remains separate
from this adapter's explicit-model provider registration. No ambiguous paid outcome is
automatically replayed on another model.
