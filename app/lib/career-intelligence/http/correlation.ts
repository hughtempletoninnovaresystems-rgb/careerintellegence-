import { randomUUID } from "node:crypto";

const CORRELATION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export function getCorrelationId(request: Request) {
  const supplied = request.headers.get("x-correlation-id")?.trim();

  if (supplied && CORRELATION_ID_PATTERN.test(supplied)) {
    return supplied;
  }

  return randomUUID();
}

export function withCorrelationId(
  response: Response,
  correlationId: string,
) {
  response.headers.set("x-correlation-id", correlationId);
  return response;
}
