# Security boundary

- Only `http://127.0.0.1:<port>` proxy origins are accepted.
- The bearer file must be a current-user-owned, non-symlink regular file with mode `0600`.
- The adapter never accepts a wallet private key, mnemonic, payment signature, provider key, or
  production API origin.
- Catalog responses are bounded to 4 MiB and validated only when OpenClaw invokes a lazy runtime or
  unified live-model catalog; registration itself performs no network or token-file I/O.
- Tool responses are streamed into bounded buffers: 4 MiB for free discovery and 32 MiB for paid
  media. Only an allowlist of receipt and payment metadata headers is returned to the agent.
- Paid media tools require a validated caller-supplied idempotency key, validate bounded request
  schemas locally, and perform exactly one proxy request. Cancellation or transport loss becomes a
  human-review outcome; it is never automatically replayed.
- No prompt, completion, bearer, payment payload, or receipt token is logged.
- The adapter performs no retry or fallback. Buyer Runtime owns outcome classification and durable
  recovery.
- Registration performs no file, network, process, wallet, or payment action. The OpenClaw service
  may reuse or start only the exact installed proxy dependency and never downloads at runtime.
- A managed child receives a minimal environment and is never automatically restarted. The
  adapter stops only the child it created.
- Native commands require an authenticated sender and expose only redacted readiness information
  and static recovery guidance. Wallet, policy, backup, and recovery mutations remain terminal-only.

The bearer is passed to OpenClaw's in-process provider configuration because OpenClaw must
authenticate to the loopback proxy. This repository does not persist that configuration. The
OpenClaw profile and the bearer file must remain accessible only to the same trusted OS user.

Report suspected vulnerabilities privately through
<https://github.com/OnchainRouter/onchain-router-openclaw/security/advisories/new>. Do not include
wallet keys, proxy bearers, payment payloads, receipt capabilities, prompts, or model output.
