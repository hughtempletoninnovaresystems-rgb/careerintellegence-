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
          followUpQuestion: null,
          followUpReason: null,
          emergingCapabilities: [],
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
            followUpQuestion: null,
            followUpReason: null,
            emergingCapabilities: [],
          },
        ],
      }),
      evaluationListSchema,
    ),
  );
});


test("resolved output permits explicit nulls and rejects missing or artificial follow-up", () => {
  const base = { questionId: "q1", competency: "Scheduling", status: "demonstrated",
    evidence: "I scheduled the staff roster.", confidence: 0.8, emergingCapabilities: [] };
  for (const evaluation of [base, { ...base, followUpQuestion: "Why?", followUpReason: "Reason" }]) {
    assert.throws(() => parseValidatedJson(JSON.stringify({ evaluations: [evaluation] }), evaluationListSchema));
  }
  const parsed = parseValidatedJson(JSON.stringify({ evaluations: [{ ...base, followUpQuestion: null, followUpReason: null }] }), evaluationListSchema);
  assert.equal(parsed.evaluations[0].followUpQuestion, null);
});

test("required follow-up has both meaningful question and reason", () => {
  const answer = { questionId: "q1", competency: "Scheduling", status: "needs_clarification",
    evidence: "", confidence: 0.5, emergingCapabilities: [], followUpQuestion: "What did you schedule?", followUpReason: null };
  assert.throws(() => parseValidatedJson(JSON.stringify({ evaluations: [answer] }), evaluationListSchema));
  const result = parseValidatedJson(JSON.stringify({ evaluations: [{ ...answer, followUpReason: "The person did not describe their part." }] }), evaluationListSchema);
  assert.equal(result.evaluations[0].status, "needs_clarification");
});
