/** Shared OpenAI Responses adapter for all assessment prompts. */
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { revisedAIEnvelopeProviderSchema } from "./revised-contract";
import { AIProviderError } from "../errors";
import { careerIntelligenceConfig } from "../config";

let openai: OpenAI | undefined;
const string = { type: "string" };
const nullableString = { type: ["string", "null"] };
const capability = {
  type: "object", additionalProperties: false,
  properties: { name: string, evidence: string, confidence: { type: "number", minimum: 0, maximum: 1 } },
  required: ["name", "evidence", "confidence"],
};
// Provider-constrained shape is separately subject to Zod semantic validation.
const clarificationSchema = {
  type: "object", additionalProperties: false,
  properties: {
    evaluations: {
      type: "array", items: {
        type: "object", additionalProperties: false,
        properties: {
          questionId: string, competency: string,
          status: { type: "string", enum: ["demonstrated", "gap", "needs_clarification"] },
          evidence: string, confidence: { type: "number", minimum: 0, maximum: 1 },
          followUpQuestion: nullableString, followUpReason: nullableString,
          emergingCapabilities: { type: "array", items: capability },
        },
        required: ["questionId", "competency", "status", "evidence", "confidence", "followUpQuestion", "followUpReason", "emergingCapabilities"],
      },
    },
  },
  required: ["evaluations"],
};

export async function generateOpenAIJson(input: {
  model: string; prompt: string; timeoutMs: number; operation?: string | null;
}) {
  if (!process.env.OPENAI_API_KEY || !input.model)
    throw new AIProviderError("The OpenAI assessment configuration is incomplete.");
  openai ||= new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: input.timeoutMs, maxRetries: 0 });
  const response = await openai.responses.create({
    model: input.model,
    reasoning: { effort: careerIntelligenceConfig.aiReasoningEffort },
    input: input.prompt,
    text: { format: input.operation === "revised_ic_preview"
      ? zodTextFormat(revisedAIEnvelopeProviderSchema, "career_revised_preview")
      : input.operation === "clarification_evaluation"
        ? { type: "json_schema" as const, name: "career_clarifications", strict: true, schema: clarificationSchema }
        : { type: "json_object" as const },
    },
    store: false,
  }, { timeout: input.timeoutMs });
  if (response.status !== "completed" || !response.output_text?.trim())
    throw new AIProviderError("The AI assessment service did not return a complete result.");
  return { outputText: response.output_text, actualModel: response.model || null };
}
