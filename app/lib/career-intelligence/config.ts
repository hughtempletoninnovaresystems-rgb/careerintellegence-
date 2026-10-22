function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

export const careerIntelligenceConfig = {
  aiProvider: "openai" as const,
  aiModel: "gpt-6.1-sol",
  aiReasoningEffort: "medium" as const,
  aiTimeoutMs: positiveInteger(process.env.CAREER_AI_TIMEOUT_MS, 45_000),
  maxCvFileBytes: positiveInteger(
    process.env.CAREER_CV_MAX_FILE_BYTES,
    10 * 1024 * 1024,
  ),
  maxCvTextChars: positiveInteger(
    process.env.CAREER_CV_MAX_TEXT_CHARS,
    200_000,
  ),
};
