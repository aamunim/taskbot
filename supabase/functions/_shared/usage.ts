import { db } from "./util.ts";

// US dollars per million tokens: [input, output, cache read, cache write].
const PRICES: Record<string, [number, number, number, number]> = {
  "claude-opus-5-5": [4, 20, 0.2, 5],
  "claude-opus-5": [5, 25, 0.5, 6.25],
  "claude-opus-4-8": [5, 25, 0.5, 6.25],
  "claude-sonnet-5-5": [2, 10, 0.1, 2.5],
  "claude-sonnet-5": [2, 10, 0.2, 2.5],
  "claude-haiku-5-5": [0.1, 0.5, 0.01, 0.125],
};

interface Usage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

/** Records what one AI call used. Never throws: bookkeeping must not break the work itself. */
export async function recordUsage(kind: "analyse" | "ask" | "triage", model: string, usage: Usage | null | undefined): Promise<void> {
  try {
    const input = usage?.input_tokens ?? 0;
    const output = usage?.output_tokens ?? 0;
    const cacheRead = usage?.cache_read_input_tokens ?? 0;
    const cacheWrite = usage?.cache_creation_input_tokens ?? 0;
    const price = Object.entries(PRICES).find(([name]) => model.startsWith(name))?.[1];
    const cost = price ? (input * price[0] + output * price[1] + cacheRead * price[2] + cacheWrite * price[3]) / 1_000_000 : null;
    await db().from("ai_usage").insert({
      kind, model, input_tokens: input, output_tokens: output,
      cache_read_tokens: cacheRead, cache_write_tokens: cacheWrite, cost_usd: cost,
    });
  } catch (e) {
    console.error("usage not recorded", e);
  }
}
