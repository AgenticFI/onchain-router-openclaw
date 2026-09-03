# Changelog

## Unreleased

- Updated the managed AgenticFI buyer proxy dependency to the corrected public npm alpha `0.1.2`.
- Added a pinned, host-native GitHub install path and post-install setup guidance.
- Added distribution metadata validation so release copy cannot drift back to an unpublished
  source-candidate claim.
- Versioned the small built runtime required by OpenClaw's Git installer and marked the host peer
  optional so npm does not install a second OpenClaw runtime inside the plugin.
- Added an official-host regression test that installs the exact current Git commit before release.
- Pinned patched `esbuild` `0.28.1` across the development toolchain.

## 0.1.0 - public-alpha candidate

- Added the native OpenClaw text provider and live policy-filtered catalog.
- Added deterministic per-turn idempotency across host transport retries.
- Added read-only model, pricing, and voice tools.
- Added bounded image, speech, and transcription tools over Buyer Runtime.
- Added authenticated status, doctor, discovery, and recovery commands.
- Added fixed-version proxy supervision with cancellation-safe shutdown and no automatic restart.
- Added clean install, update, disable/enable, inspection, and uninstall qualification.
- Kept wallet keys, x402 signing, policy, settlement, receipts, and recovery out of the adapter.
