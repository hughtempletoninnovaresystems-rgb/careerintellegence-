import type { ZodType } from "zod";

export class AIOutputValidationError extends Error {
  constructor() {
    super("AI output failed validation.");
    this.name = "AIOutputValidationError";
  }
}

function cleanJson(value: string) {
  return value
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

export function parseValidatedJson<T>(text: string, schema: ZodType<T>): T {
  let parsed: unknown;

  try {
    parsed = JSON.parse(cleanJson(text));
  } catch {
    throw new AIOutputValidationError();
  }

  const validated = schema.safeParse(parsed);

  if (!validated.success) {
    throw new AIOutputValidationError();
  }

  return validated.data;
}
