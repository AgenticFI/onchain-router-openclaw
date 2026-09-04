import type { AnyAgentTool } from "openclaw/plugin-sdk/plugin-entry";
import { getFree, postPaid, type ProxyCallDependencies } from "./api.js";
import type { AdapterConfig } from "./config.js";
import {
  EMPTY_SCHEMA,
  IMAGE_SCHEMA,
  SPEECH_SCHEMA,
  TRANSCRIPTION_SCHEMA,
  validateImage,
  validateSpeech,
  validateTranscription,
} from "./schemas.js";

function result(details: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(details) }],
    details,
  };
}

function invalid(error: unknown) {
  return result({
    ok: false,
    outcome: "invalid_input",
    message: error instanceof Error ? error.message : "invalid tool input",
    retry: "never",
  });
}

export function createOnchainRouterTools(
  config: AdapterConfig,
  dependencies: ProxyCallDependencies = {},
): AnyAgentTool[] {
  return [
    {
      name: "onchain_router_models",
      label: "Onchain Router Models",
      description: "List live policy-filtered Onchain Router models without spending.",
      parameters: EMPTY_SCHEMA,
      execute: async (_id, _params, signal) => result(await getFree(config, "/v1/models", { ...dependencies, signal })),
    },
    {
      name: "onchain_router_pricing",
      label: "Onchain Router Pricing",
      description: "Inspect current Onchain Router model pricing without spending.",
      parameters: EMPTY_SCHEMA,
      execute: async (_id, _params, signal) => result(await getFree(config, "/v1/pricing", { ...dependencies, signal })),
    },
    {
      name: "onchain_router_voices",
      label: "Onchain Router Voices",
      description: "List public speech voices and compatibility without spending.",
      parameters: EMPTY_SCHEMA,
      execute: async (_id, _params, signal) => result(await getFree(config, "/v1/audio/voices", { ...dependencies, signal })),
    },
    {
      name: "onchain_router_image_generate",
      label: "Onchain Router Image Generation",
      description: "Generate one paid image through Buyer Runtime. Returns a hosted URL and seven-day expiry.",
      parameters: IMAGE_SCHEMA,
      execute: async (_id, params, signal) => {
        try {
          const [key, body] = validateImage(params);
          return result(await postPaid(config, "/v1/images/generations", body, key, { ...dependencies, signal }));
        } catch (error) {
          return invalid(error);
        }
      },
    },
    {
      name: "onchain_router_speech_generate",
      label: "Onchain Router Speech Generation",
      description: "Generate paid MP3 speech through Buyer Runtime.",
      parameters: SPEECH_SCHEMA,
      execute: async (_id, params, signal) => {
        try {
          const [key, body] = validateSpeech(params);
          return result(await postPaid(config, "/v1/audio/speech", body, key, { ...dependencies, signal }));
        } catch (error) {
          return invalid(error);
        }
      },
    },
    {
      name: "onchain_router_transcribe",
      label: "Onchain Router Transcription",
      description: "Transcribe bounded MP3 Base64 after explicit provider-retention acknowledgement.",
      parameters: TRANSCRIPTION_SCHEMA,
      execute: async (_id, params, signal) => {
        try {
          const [key, body] = validateTranscription(params);
          return result(await postPaid(config, "/v1/audio/transcriptions", body, key, { ...dependencies, signal }));
        } catch (error) {
          return invalid(error);
        }
      },
    },
  ];
}
