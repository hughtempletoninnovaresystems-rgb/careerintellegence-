import type { ZodType } from "zod";

export class AIOutputValidationError extends Error {
  readonly kind: "json" | "schema";
  readonly paths: string[];

  constructor(kind: "json" | "schema", paths: string[] = []) {
    super("AI output failed validation.");
    this.name = "AIOutputValidationError";
    this.kind = kind;
    // Field paths only; never include candidate text or model output.
    this.paths = paths;
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
    throw new AIOutputValidationError("json");
  }

  const validated = schema.safeParse(parsed);

  if (!validated.success) {
    throw new AIOutputValidationError(
      "schema",
      validated.error.issues.map((issue) => issue.path.join(".")).slice(0, 8),
    );
  }

  return validated.data;
}
