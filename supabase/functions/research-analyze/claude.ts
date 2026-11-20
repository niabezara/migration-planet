/**
 * Claude as the analysis model. Structured outputs guarantee the JSON shape;
 * validate.ts checks the content. The system prompt (rules + dataset catalog)
 * is the same for every publication and is cached for an hour.
 */
import Anthropic from "npm:@anthropic-ai/sdk@1.4.0";
import { ANALYSIS_SCHEMA, TRIAGE_SCHEMA } from "../_shared/research/analysis/schemas.ts";
import type { AnalysisLlm, AnalysisOutput, LlmResult, TriageOutput } from "../_shared/research/analysis/types.ts";

const MODEL = "claude-opus-5-5";

export function claudeAnalysisLlm(apiKey: string): AnalysisLlm {
  // The SDK retries 408/409/429/5xx and connection errors itself.
  const client = new Anthropic({ apiKey, timeout: 110_000, maxRetries: 2 });

  async function call<T>(system: string, user: string, schema: Record<string, unknown>, effort: "medium" | "high"): Promise<LlmResult<T>> {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      // On a safety-classifier decline, the API re-runs the request on Anthropic's recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral", ttl: "1h" } }],
      messages: [{ role: "user", content: user }],
      output_config: { effort, format: { type: "json_schema", schema } },
    });
    if (response.stop_reason === "refusal") {
      throw new Error(`Claude declined to analyse this publication (${response.stop_details?.category ?? "no category"})`);
    }
    if (response.stop_reason === "max_tokens") throw new Error("analysis was cut off (max_tokens)");
    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    return { output: JSON.parse(text) as T, model: response.model, usage: { ...response.usage } };
  }

  return {
    triage: (system, user) => call<TriageOutput>(system, user, TRIAGE_SCHEMA, "medium"),
    analyze: (system, user) => call<AnalysisOutput>(system, user, ANALYSIS_SCHEMA, "medium"),
  };
}
