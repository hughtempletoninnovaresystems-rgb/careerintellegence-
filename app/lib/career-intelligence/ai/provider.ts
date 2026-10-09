import { createHash } from "node:crypto";
import { sql } from "@vercel/postgres";
import { GoogleGenAI } from "@google/genai";
import type { ZodType } from "zod";
import { AIProviderError } from "../errors";
import { careerIntelligenceConfig } from "../config";
import { geminiText } from "../utils";
import { AIOutputValidationError, parseValidatedJson } from "./parse-json";

let client: GoogleGenAI | null = null;

function getClient() {
  if (client) {
    return client;
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new AIProviderError("The AI assessment service is not configured.");
  }

  client = new GoogleGenAI({ apiKey });
  return client;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new AIProviderError("The AI assessment service timed out.")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

type AIInvocationContext = {
  assessmentId?: string | null;
  roleAssessmentId?: string | null;
  operation?: string | null;
};

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function actualModelVersion(response: unknown): string | null {
  if (!response || typeof response !== "object") return null;
  const value = (response as { modelVersion?: unknown }).modelVersion;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function recordAIInvocation({
  requestedModel,
  actualModel,
  promptHash,
  outputHash,
  outcome,
  errorCode,
  elapsedMs,
  context,
}: {
  requestedModel: string;
  actualModel: string | null;
  promptHash: string;
  outputHash: string | null;
  outcome: "succeeded" | "provider_error" | "invalid_output";
  errorCode: string | null;
  elapsedMs: number;
  context?: AIInvocationContext;
}) {
  await sql`
    INSERT INTO career_ai_invocations (
      provider,
      requested_model,
      actual_model,
      prompt_sha256,
      output_sha256,
      outcome,
      error_code,
      elapsed_ms,
      assessment_id,
      role_assessment_id,
      operation,
      created_at
    )
    VALUES (
      'google',
      ${requestedModel},
      ${actualModel},
      ${promptHash},
      ${outputHash},
      ${outcome},
      ${errorCode},
      ${Math.max(0, Math.trunc(elapsedMs))},
      ${context?.assessmentId || null},
      ${context?.roleAssessmentId || null},
      ${context?.operation || null},
      NOW()
    )
  `;
}

export async function generateValidatedJson<T>({
  prompt,
  schema,
  model = careerIntelligenceConfig.aiModel,
  timeoutMs = careerIntelligenceConfig.aiTimeoutMs,
  context,
}: {
  prompt: string;
  schema: ZodType<T>;
  model?: string;
  timeoutMs?: number;
  context?: AIInvocationContext;
}): Promise<T> {
  const startedAt = Date.now();
  const promptHash = sha256(prompt);
  let response: unknown;

  try {
    response = await withTimeout(
      getClient().models.generateContent({
        model,
        contents: prompt,
      }),
      timeoutMs,
    );
  } catch (error) {
    try {
      await recordAIInvocation({
        requestedModel: model,
        actualModel: null,
        promptHash,
        outputHash: null,
        outcome: "provider_error",
        errorCode: error instanceof AIProviderError ? "provider_unavailable" : "provider_request_failed",
        elapsedMs: Date.now() - startedAt,
        context,
      });
    } catch (auditError) {
      console.error("Unable to record failed AI invocation", {
        operation: context?.operation || "unspecified",
        errorName: auditError instanceof Error ? auditError.name : "unknown",
      });
    }

    if (error instanceof AIProviderError) {
      throw error;
    }

    throw new AIProviderError("The AI assessment service is unavailable.");
  }

  const outputText = geminiText(response);
  const actualModel = actualModelVersion(response);
  let parsed: T;

  try {
    parsed = parseValidatedJson(outputText, schema);
  } catch (error) {
    try {
      await recordAIInvocation({
        requestedModel: model,
        actualModel,
        promptHash,
        outputHash: sha256(outputText),
        outcome: "invalid_output",
        errorCode: error instanceof AIOutputValidationError ? "output_schema_invalid" : "output_parse_failed",
        elapsedMs: Date.now() - startedAt,
        context,
      });
    } catch (auditError) {
      console.error("Unable to record invalid AI output", {
        operation: context?.operation || "unspecified",
        errorName: auditError instanceof Error ? auditError.name : "unknown",
      });
    }

    if (error instanceof AIOutputValidationError) {
      throw new AIProviderError();
    }

    throw error;
  }

  try {
    await recordAIInvocation({
      requestedModel: model,
      actualModel,
      promptHash,
      outputHash: sha256(outputText),
      outcome: "succeeded",
      errorCode: null,
      elapsedMs: Date.now() - startedAt,
      context,
    });
  } catch (error) {
    // Fail closed: never return a model result that cannot be tied to an audit
    // row. The prompt/response text itself is deliberately not persisted.
    console.error("Unable to record successful AI invocation", {
      operation: context?.operation || "unspecified",
      errorName: error instanceof Error ? error.name : "unknown",
    });
    throw new AIProviderError(
      "The assessment result could not be recorded safely. Please retry.",
    );
  }

  return parsed;
}
