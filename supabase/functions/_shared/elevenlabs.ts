import { env, optionalEnv } from "./util.ts";

/** Speech-to-text with ElevenLabs Scribe. Language is auto-detected (Bangla/English mix). */
export async function transcribe(audio: Uint8Array, fileName: string, mimeType: string): Promise<string> {
  const form = new FormData();
  form.append("model_id", optionalEnv("ELEVENLABS_STT_MODEL") ?? "scribe_v1");
  form.append("file", new Blob([audio as BlobPart], { type: mimeType }), fileName);
  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": env("ELEVENLABS_API_KEY") },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`ElevenLabs transcription failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  }
  const body = await res.json();
  if (typeof body?.text !== "string") throw new Error("ElevenLabs returned no text");
  return body.text.trim();
}
