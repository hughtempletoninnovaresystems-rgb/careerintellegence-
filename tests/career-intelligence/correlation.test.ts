import test from "node:test";
import assert from "node:assert/strict";
import { getCorrelationId } from "../../app/lib/career-intelligence/http/correlation.ts";

test("correlation id preserves a valid caller id", () => {
  const request = new Request("https://example.test/api", {
    headers: { "x-correlation-id": "ci-test_123:abc" },
  });

  assert.equal(getCorrelationId(request), "ci-test_123:abc");
});

test("correlation id rejects unsafe caller values and generates a UUID", () => {
  const request = new Request("https://example.test/api", {
    headers: { "x-correlation-id": "contains spaces" },
  });

  assert.match(
    getCorrelationId(request),
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
});
