import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { editedCapabilityReassessmentSchema } from "../../app/lib/career-intelligence/ai/schemas.ts";
import { AIOutputValidationError, parseValidatedJson } from "../../app/lib/career-intelligence/ai/parse-json.ts";

test("a demonstrated edit does not require a clarification question", () => {
  const output = parseValidatedJson(JSON.stringify({
    outcome: "demonstrated",
    evidence: "I built and tested the solution.",
    confidence: 0.85,
    clarification: { reason: "", question: "" },
  }), editedCapabilityReassessmentSchema);
  assert.equal(output.outcome, "demonstrated");
  assert.equal(output.clarification?.question, "");
  assert.deepEqual(output.emergingCapabilities, []);
});

test("an assessed gap may omit AI-authored evidence", () => {
  const output = parseValidatedJson(JSON.stringify({
    outcome: "gap",
    evidence: "",
    confidence: 0.32,
    clarification: null,
    emergingCapabilities: [],
  }), editedCapabilityReassessmentSchema);
  assert.equal(output.evidence, "");
});

test("clarification must supply a focused question", () => {
  assert.throws(() => parseValidatedJson(JSON.stringify({
    outcome: "needs_clarification",
    evidence: "",
    confidence: 0.5,
    clarification: { reason: "", question: "" },
  }), editedCapabilityReassessmentSchema), (error: unknown) => {
    assert.ok(error instanceof AIOutputValidationError);
    assert.equal(error.kind, "schema");
    assert.ok(error.paths.includes("clarification.question"));
    return true;
  });
});

test("demonstrated evidence cannot be blank", () => {
  assert.throws(() => parseValidatedJson(JSON.stringify({
    outcome: "demonstrated",
    evidence: " ",
    confidence: 0.9,
  }), editedCapabilityReassessmentSchema));
});

test("malformed JSON is identified without logging candidate text", () => {
  assert.throws(() => parseValidatedJson("not-json", editedCapabilityReassessmentSchema),
    (error: unknown) => error instanceof AIOutputValidationError && error.kind === "json" && error.paths.length === 0);
});

test("neither edit route contains nonbreaking-space SQL indentation", () => {
  for (const action of ["analyse-cv", "no-cv"]) {
    const source = readFileSync(`app/api/${action}/route.ts`, "utf8");
    const start = source.indexOf("async function reassessEditedCapability(");
    const end = source.indexOf("async function handleReviewCapability(", start);
    assert.ok(start >= 0 && end > start);
    for (const match of source.slice(start, end).matchAll(/sql`[\s\S]*?`/g)) {
      assert.equal(match[0].includes("\u00a0"), false, `${action} edit SQL contains U+00A0`);
    }
  }
});
