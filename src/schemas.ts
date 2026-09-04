import { Buffer } from "node:buffer";
import { Type, type TSchema } from "typebox";

const IDEMPOTENCY_PATTERN = "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$";
const MODEL_PATTERN = "^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$";
const ASPECT_PATTERN = "^\\d{1,2}:\\d{1,2}$";
const VOICE_PATTERN = "^[a-z0-9][a-z0-9-]{0,63}$";
const IDEMPOTENCY = new RegExp(IDEMPOTENCY_PATTERN);
const MODEL = new RegExp(MODEL_PATTERN);
const ASPECT = new RegExp(ASPECT_PATTERN);
const VOICE = new RegExp(VOICE_PATTERN);
const MAX_TOOL_BODY_BYTES = 1_114_112;
const MAX_TRANSCRIPTION_BASE64 = 1_048_576;

const strict = <T extends Record<string, TSchema>>(properties: T) =>
  Type.Object(properties, { additionalProperties: false });

const common = {
  idempotency_key: Type.String({
    pattern: IDEMPOTENCY_PATTERN,
    description: "Stable caller key. Reuse only for the identical logical request.",
  }),
  model: Type.String({
    pattern: MODEL_PATTERN,
    description: "Exact model returned by the live Onchain Router catalog.",
  }),
};

export const EMPTY_SCHEMA = Type.Object({}, { additionalProperties: false });
export const IMAGE_SCHEMA = strict({
    ...common,
    prompt: Type.String({ minLength: 1, maxLength: 4000 }),
    image_size: Type.Optional(Type.Union(["0.5K", "1K", "2K", "4K"].map((value) => Type.Literal(value)))),
    aspect_ratio: Type.Optional(Type.String({ pattern: ASPECT_PATTERN })),
    response_format: Type.Optional(Type.Literal("url")),
  });
export const SPEECH_SCHEMA = strict({
    ...common,
    input: Type.String({ minLength: 1, maxLength: 5000 }),
    voice: Type.Optional(Type.String({ pattern: VOICE_PATTERN })),
    response_format: Type.Optional(Type.Literal("mp3")),
    speed: Type.Optional(Type.Number({ minimum: 0.7, maximum: 1.2 })),
  });
export const TRANSCRIPTION_SCHEMA = strict({
    ...common,
    audio_base64: Type.String({ minLength: 4, maxLength: MAX_TRANSCRIPTION_BASE64 }),
    acknowledge_provider_retention: Type.Literal(true),
    language: Type.Optional(Type.String({ pattern: "^[a-z]{2,3}(?:-[A-Z]{2})?$" })),
    diarize: Type.Optional(Type.Boolean()),
    num_speakers: Type.Optional(Type.Integer({ minimum: 1, maximum: 32 })),
    timestamps: Type.Optional(Type.Union(["none", "word", "character"].map((value) => Type.Literal(value)))),
    tag_audio_events: Type.Optional(Type.Boolean()),
    response_format: Type.Optional(Type.Union(["json", "verbose_json"].map((value) => Type.Literal(value)))),
  });

function object(
  value: unknown,
  allowed: readonly string[],
  required: readonly string[],
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("tool input must be an object");
  const result = { ...(value as Record<string, unknown>) };
  if (Object.keys(result).some((key) => !allowed.includes(key)))
    throw new Error("unsupported tool input field");
  if (required.some((key) => !(key in result)))
    throw new Error("required tool input field is missing");
  if (typeof result["idempotency_key"] !== "string" || !IDEMPOTENCY.test(result["idempotency_key"]))
    throw new Error("idempotency_key is invalid");
  if (typeof result["model"] !== "string" || !MODEL.test(result["model"]))
    throw new Error("model is invalid");
  return result;
}

function text(value: unknown, maximum: number, label: string): asserts value is string {
  if (typeof value !== "string" || !value.trim() || value.includes("\0") || value.length > maximum)
    throw new Error(`${label} is empty, malformed, or too long`);
}

function bounded(value: Record<string, unknown>): Record<string, unknown> {
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > MAX_TOOL_BODY_BYTES)
    throw new Error("tool request exceeds its byte limit");
  return value;
}

export function validateImage(value: unknown): [string, Record<string, unknown>] {
  const result = object(
    value,
    ["idempotency_key", "model", "prompt", "image_size", "aspect_ratio", "response_format"],
    ["idempotency_key", "model", "prompt"],
  );
  text(result["prompt"], 4000, "prompt");
  if (!["0.5K", "1K", "2K", "4K"].includes(String(result["image_size"] ?? "1K")))
    throw new Error("image_size is not supported");
  if (typeof (result["aspect_ratio"] ?? "1:1") !== "string" || !ASPECT.test(String(result["aspect_ratio"] ?? "1:1")))
    throw new Error("aspect_ratio is invalid");
  if ((result["response_format"] ?? "url") !== "url")
    throw new Error("only hosted image URLs are supported by this tool");
  const key = String(result["idempotency_key"]);
  delete result["idempotency_key"];
  return [key, bounded(result)];
}

export function validateSpeech(value: unknown): [string, Record<string, unknown>] {
  const result = object(
    value,
    ["idempotency_key", "model", "input", "voice", "response_format", "speed"],
    ["idempotency_key", "model", "input"],
  );
  text(result["input"], 5000, "speech input");
  if (result["voice"] !== undefined && (typeof result["voice"] !== "string" || !VOICE.test(result["voice"])))
    throw new Error("voice is invalid");
  if ((result["response_format"] ?? "mp3") !== "mp3")
    throw new Error("only MP3 speech output is supported by this tool");
  const speed = result["speed"] ?? 1;
  if (
    typeof speed !== "number" ||
    !Number.isFinite(speed) ||
    speed < 0.7 ||
    speed > 1.2 ||
    !Number.isInteger(speed * 1000)
  )
    throw new Error("speech speed is invalid");
  const key = String(result["idempotency_key"]);
  delete result["idempotency_key"];
  return [key, bounded(result)];
}

export function validateTranscription(value: unknown): [string, Record<string, unknown>] {
  const result = object(
    value,
    [
      "idempotency_key", "model", "audio_base64", "acknowledge_provider_retention", "language",
      "diarize", "num_speakers", "timestamps", "tag_audio_events", "response_format",
    ],
    ["idempotency_key", "model", "audio_base64", "acknowledge_provider_retention"],
  );
  if (result["acknowledge_provider_retention"] !== true)
    throw new Error("provider-retention acknowledgement is required before audio upload");
  const encoded = result["audio_base64"];
  if (typeof encoded !== "string" || encoded.length > MAX_TRANSCRIPTION_BASE64 || encoded.length % 4 !== 0)
    throw new Error("audio must be bounded canonical MP3 Base64");
  const decoded = Buffer.from(encoded, "base64");
  if (
    decoded.length === 0 ||
    decoded.toString("base64") !== encoded ||
    !(decoded.subarray(0, 3).toString("ascii") === "ID3" || (decoded[0] === 0xff && ((decoded[1] ?? 0) & 0xe0) === 0xe0))
  )
    throw new Error("only bounded canonical MP3 Base64 is supported");
  if (result["num_speakers"] !== undefined && result["diarize"] !== true)
    throw new Error("num_speakers requires diarize=true");
  if (
    result["language"] !== undefined &&
    (typeof result["language"] !== "string" || !/^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(result["language"]))
  )
    throw new Error("transcription language is invalid");
  for (const flag of ["diarize", "tag_audio_events"] as const) {
    if (result[flag] !== undefined && typeof result[flag] !== "boolean")
      throw new Error(`${flag} must be boolean`);
  }
  if (
    result["num_speakers"] !== undefined &&
    (typeof result["num_speakers"] !== "number" ||
      !Number.isInteger(result["num_speakers"]) ||
      result["num_speakers"] < 1 ||
      result["num_speakers"] > 32)
  )
    throw new Error("num_speakers is invalid");
  if (!["none", "word", "character"].includes(String(result["timestamps"] ?? "none")))
    throw new Error("transcription timestamps are invalid");
  if (!["json", "verbose_json"].includes(String(result["response_format"] ?? "json")))
    throw new Error("transcription response_format is invalid");
  const key = String(result["idempotency_key"]);
  delete result["idempotency_key"];
  delete result["acknowledge_provider_retention"];
  return [key, bounded(result)];
}
