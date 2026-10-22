import { createHash } from "node:crypto";
import { sql } from "@vercel/postgres";
import type { ZodType } from "zod";
import { AIProviderError } from "../errors";
import { careerIntelligenceConfig } from "../config";
import { AIOutputValidationError, parseValidatedJson } from "./parse-json";
import { generateOpenAIJson } from "./openai-adapter";

type AIInvocationContext = {
  assessmentId?: string | null;
  roleAssessmentId?: string | null;
  operation?: string | null;
};

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function recordAIInvocation({
  provider,
  requestedModel,
  actualModel,
  promptHash,
  outputHash,
  outcome,
  errorCode,
  elapsedMs,
  context,
}: {
  provider: "openai";
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
      ${provider},
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
  timeoutMs = careerIntelligenceConfig.aiTimeoutMs,
  context,
}: {
  prompt: string;
  schema: ZodType<T>;
  timeoutMs?: number;
  context?: AIInvocationContext;
}): Promise<T> {
  const provider = careerIntelligenceConfig.aiProvider;
  const requestedModel = careerIntelligenceConfig.aiModel;
  // At most two generation attempts. Each attempt is separately audited.
  let retryHint = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    const attemptPrompt = prompt + retryHint;
    const startedAt = Date.now();
    const promptHash = sha256(attemptPrompt);
    let outputText = "";
    let actualModel: string | null = null;

    try {
      const output = await generateOpenAIJson({
        model: requestedModel, prompt: attemptPrompt, timeoutMs,
        operation: context?.operation,
      });
      outputText = output.outputText;
      actualModel = output.actualModel;
    } catch (error) {
      try {
        await recordAIInvocation({
          provider,
          requestedModel,
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

    let parsed: T;

    try {
      parsed = parseValidatedJson(outputText, schema);
    } catch (error) {
      const validationError = error instanceof AIOutputValidationError ? error : null;
      try {
        await recordAIInvocation({
          provider,
          requestedModel,
          actualModel,
          promptHash,
          outputHash: sha256(outputText),
          outcome: "invalid_output",
          errorCode: validationError?.kind === "schema" ? "output_schema_invalid" : "output_json_invalid",
          elapsedMs: Date.now() - startedAt,
          context,
        });
      } catch (auditError) {
        console.error("Unable to record invalid AI output", {
          operation: context?.operation || "unspecified",
          errorName: auditError instanceof Error ? auditError.name : "unknown",
        });
      }

      if (!validationError) throw error;

      console.warn("Invalid AI structured output", {
        operation: context?.operation || "unspecified",
        kind: validationError.kind,
        fields: validationError.paths,
        attempt: attempt + 1,
      });

      if (attempt === 0) {
        const fields = validationError.paths.length
          ? ` Invalid fields: ${validationError.paths.join(", ")}.`
          : "";
        retryHint = `\n\nYour prior answer was not valid JSON matching the requested structure.${fields} Regenerate the entire answer using the same evidence. Output one JSON object only, with correct field types and all required non-empty fields. No markdown.`;
        continue;
      }
      throw new AIProviderError();
    }

    try {
      await recordAIInvocation({
        provider,
        requestedModel,
        actualModel,
        promptHash,
        outputHash: sha256(outputText),
        outcome: "succeeded",
        errorCode: null,
        elapsedMs: Date.now() - startedAt,
        context,
      });
    } catch (error) {
      // Fail closed: never return unaudited model assessments. Neither
      // candidate text nor raw model output is persisted in the audit row.
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

  throw new AIProviderError();
}
