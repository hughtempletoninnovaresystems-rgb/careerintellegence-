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

export async function generateValidatedJson<T>({
  prompt,
  schema,
  model = careerIntelligenceConfig.aiModel,
  timeoutMs = careerIntelligenceConfig.aiTimeoutMs,
}: {
  prompt: string;
  schema: ZodType<T>;
  model?: string;
  timeoutMs?: number;
}): Promise<T> {
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
    if (error instanceof AIProviderError) {
      throw error;
    }

    throw new AIProviderError("The AI assessment service is unavailable.");
  }

  try {
    return parseValidatedJson(
      geminiText(response),
      schema,
    );
  } catch (error) {
    if (error instanceof AIOutputValidationError) {
      throw new AIProviderError();
    }

    throw error;
  }
}
