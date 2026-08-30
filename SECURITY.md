# Security boundary

- Only `http://127.0.0.1:<port>` proxy origins are accepted.
- The bearer file must be a current-user-owned, non-symlink regular file with mode `0600`.
- The adapter never accepts a wallet private key, mnemonic, payment signature, provider key, or
  production API origin.
- Catalog responses are bounded to 4 MiB and validated only when OpenClaw invokes a lazy runtime or
  unified live-model catalog; registration itself performs no network or token-file I/O.
- No prompt, completion, bearer, payment payload, or receipt token is logged.
- The adapter performs no retry or fallback. Buyer Runtime owns outcome classification and durable
  recovery.

The bearer is passed to OpenClaw's in-process provider configuration because OpenClaw must
authenticate to the loopback proxy. This repository does not persist that configuration. The
OpenClaw profile and the bearer file must remain accessible only to the same trusted OS user.
