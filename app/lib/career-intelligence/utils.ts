export function cleanJson(value: string) {
  return value
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

export function clamp(
  value: number,
  min = 0,
  max = 1,
) {
  return Math.max(min, Math.min(max, value));
}

export function geminiText(response: unknown) {
  const candidate = response as {
    text?: string | (() => string);
  } | null;

  if (typeof candidate?.text === "string") {
    return candidate.text;
  }

  if (typeof candidate?.text === "function") {
    return candidate.text();
  }

  return "";
}

export function formatDateForInput(value: unknown) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);

    if (match) {
      return match[1];
    }
  }

  const date = value instanceof Date ? value : new Date(String(value));

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
}
