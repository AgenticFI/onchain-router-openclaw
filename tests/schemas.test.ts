import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import { validateImage, validateSpeech, validateTranscription } from "../src/index.js";

describe("bounded media validation", () => {
  it("accepts a variable-size hosted image request and removes only the financial key", () => {
    expect(validateImage({
      idempotency_key: "image-1",
      model: "gemini-image",
      prompt: "A blue circle",
      image_size: "4K",
      aspect_ratio: "16:9",
    })).toEqual(["image-1", {
      model: "gemini-image",
      prompt: "A blue circle",
      image_size: "4K",
      aspect_ratio: "16:9",
    }]);
  });

  it.each([
    [{ idempotency_key: "bad key", model: "m", prompt: "x" }, "idempotency_key"],
    [{ idempotency_key: "k", model: "bad model!", prompt: "x" }, "model"],
    [{ idempotency_key: "k", model: "m", prompt: "" }, "prompt"],
    [{ idempotency_key: "k", model: "m", prompt: "x", image_size: "8K" }, "image_size"],
    [{ idempotency_key: "k", model: "m", prompt: "x", response_format: "base64" }, "hosted"],
    [{ idempotency_key: "k", model: "m", prompt: "x", surprise: true }, "unsupported"],
  ])("rejects invalid image input %#", (value, message) => {
    expect(() => validateImage(value)).toThrow(String(message));
  });

  it("accepts bounded speech and rejects unsafe formats and speeds", () => {
    expect(validateSpeech({ idempotency_key: "speech-1", model: "tts", input: "hello", speed: 1.1 })[0]).toBe("speech-1");
    expect(() => validateSpeech({ idempotency_key: "k", model: "tts", input: "hello", response_format: "wav" })).toThrow("MP3");
    expect(() => validateSpeech({ idempotency_key: "k", model: "tts", input: "hello", speed: Number.NaN })).toThrow("speed");
  });

  it("requires explicit retention acknowledgement and canonical MP3 Base64", () => {
    const mp3 = Buffer.from("ID3safe-audio").toString("base64");
    expect(validateTranscription({
      idempotency_key: "transcribe-1",
      model: "stt",
      audio_base64: mp3,
      acknowledge_provider_retention: true,
    })[1]).toEqual({ model: "stt", audio_base64: mp3 });
    expect(() => validateTranscription({
      idempotency_key: "transcribe-1", model: "stt", audio_base64: mp3,
      acknowledge_provider_retention: false,
    })).toThrow("acknowledgement");
    expect(() => validateTranscription({
      idempotency_key: "transcribe-1", model: "stt", audio_base64: Buffer.from("not-mp3").toString("base64"),
      acknowledge_provider_retention: true,
    })).toThrow("MP3");
  });

  it("requires diarization before a speaker count", () => {
    const mp3 = Buffer.from("ID3safe-audio").toString("base64");
    expect(() => validateTranscription({
      idempotency_key: "transcribe-1", model: "stt", audio_base64: mp3,
      acknowledge_provider_retention: true, num_speakers: 2,
    })).toThrow("diarize");
  });

  it("validates transcription language, flags, speaker count, timestamps, and format", () => {
    const mp3 = Buffer.from("ID3safe-audio").toString("base64");
    const base = {
      idempotency_key: "transcribe-1", model: "stt", audio_base64: mp3,
      acknowledge_provider_retention: true,
    };
    expect(() => validateTranscription({ ...base, language: "english" })).toThrow("language");
    expect(() => validateTranscription({ ...base, diarize: "yes" })).toThrow("boolean");
    expect(() => validateTranscription({ ...base, diarize: true, num_speakers: 33 })).toThrow("num_speakers");
    expect(() => validateTranscription({ ...base, timestamps: "sentence" })).toThrow("timestamps");
    expect(() => validateTranscription({ ...base, response_format: "text" })).toThrow("response_format");
  });
});
