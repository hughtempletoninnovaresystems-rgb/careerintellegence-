import assert from "node:assert/strict";
import test from "node:test";
import { parseValidatedJson } from "../../app/lib/career-intelligence/ai/parse-json.ts";
import { evaluationListSchema, finalSubmissionCheckSchema } from "../../app/lib/career-intelligence/ai/schemas.ts";

test("valid structured AI evaluation output is accepted", () => {
  const result = parseValidatedJson(
    JSON.stringify({
      evaluations: [
        {
          questionId: "q1",
          competency: "Clinical Escalation",
          status: "demonstrated",
          evidence: "Raised the concern and initiated escalation.",
          confidence: 0.82,
        },
      ],
    }),
    evaluationListSchema,
  );

  assert.equal(result.evaluations.length, 1);
  assert.equal(result.evaluations[0].status, "demonstrated");
});

test("malformed AI JSON is rejected", () => {
  assert.throws(() => parseValidatedJson("not-json", finalSubmissionCheckSchema));
});

test("AI confidence outside the contract is rejected", () => {
  assert.throws(() =>
    parseValidatedJson(
      JSON.stringify({
        evaluations: [
          {
            questionId: "q1",
            competency: "Clinical Escalation",
            status: "demonstrated",
            evidence: "example",
            confidence: 1.5,
          },
        ],
      }),
      evaluationListSchema,
    ),
  );
});
