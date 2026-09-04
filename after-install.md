# Finish Onchain Router setup

The OpenClaw adapter is installed but does not create, import, unlock, or fund a wallet.

1. In a human-controlled terminal, install and configure the AgenticFI Buyer Runtime.
2. Start or unlock its local profile with conservative budgets.
3. Restart OpenClaw, then run `/onchain-router doctor`.
4. Select an `onchain-router/<model-id>` returned by the live model picker.

Keep the local proxy on `127.0.0.1`; never expose it through a tunnel or LAN bind. A timeout or
ambiguous paid result must be recovered with the original idempotency key and identical request,
not retried as a new payment.

Guide: https://onchainrouter.dev/docs/openclaw
