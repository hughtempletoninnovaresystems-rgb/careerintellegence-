import assert from "node:assert/strict";
import test from "node:test";
import { revisedAIEnvelopeSchema, validateRevisedOutputAgainstInput } from "../../app/lib/career-intelligence/ai/revised-contract.ts";

const empty = {
  contractVersion: "CI-AI-12-v0.1", operation: "initial_evidence", runReference: "run-1",
  identities: [], decisions: [], assessments: [], unresolvedSignals: [], governanceItems: [],
  priorities: [], followUps: [], sourceCoverage: [],
};
const e3 = {
  assessmentRef: "assessment-1", roleRef: "role-1", identityRef: "c1", definitionRevision: "v1",
  disposition: "assessed", evidenceGrade: "E3", sourceRefs: ["cv-1"],
  personalApplication: "I calibrated the unit.", justification: "Specific personal work with context.",
  applicationLimits: "Supervised calibration on site", missingElement: null, holdRefs: [],
  sourceRelationships: [{ sourceRef: "cv-1", relationship: "supporting" }],
};
function parse(x: unknown) { return revisedAIEnvelopeSchema.safeParse(x); }

test("E3 requires attributable personal work, source and application limit", () => {
  assert.equal(parse({ ...empty, assessments: [e3] }).success, true);
  assert.equal(parse({ ...empty, assessments: [{ ...e3, applicationLimits: "" }] }).success, false);
  assert.equal(parse({ ...empty, assessments: [{ ...e3, sourceRefs: [] }] }).success, false);
});
test("row hold needs null grade and recorded linked issue", () => {
  const held = { ...e3, disposition: "hold", evidenceGrade: null, holdRefs: ["hold-1"] };
  assert.equal(parse({ ...empty, assessments: [held] }).success, false);
  assert.equal(parse({ ...empty, assessments: [held], unresolvedSignals: [
    { signalRef: "hold-1", exactWording: "supported", sourceRef: "cv-1", reason: "Unknown contributor",
      roleRef: "role-1", uncertainty: "personal_contribution", alternatives: [],
      possibleIdentityRefs: [], proposedAction: "candidate_clarification" },
  ] }).success, true);
});
test("evidence-only operation rejects identity mutations", () => {
  assert.equal(parse({ ...empty, identities: [{ identityRef: "c1", definitionRevision: "v1", name: "X", definition: "X", decisionRefs: [], attributes: [], supersedesRef: null }] }).success, false);
});
test("server rejects unknown frozen identity or source", () => {
  const output = revisedAIEnvelopeSchema.parse({ ...empty, assessments: [e3] });
  assert.throws(() => validateRevisedOutputAgainstInput(output, { operation: "initial_evidence", frozenIdentities: [], roleRefs: ["role-1"], sourceRefs: ["cv-1"], questionRefs: [], requiredSourceRefs: [] }));
  assert.doesNotThrow(() => validateRevisedOutputAgainstInput(output, { operation: "initial_evidence", frozenIdentities: [{ identityRef: "c1", definitionRevision: "v1" }], roleRefs: ["role-1"], sourceRefs: ["cv-1"], questionRefs: [], requiredSourceRefs: [] }));
});
test("no-follow-up fields have exact nullable outcome semantics", () => {
  const follow = { targetQuestionRef: "q1", roleRef: "role-1", identityRef: "c1", definitionRevision: "v1", outcome: "resolved", question: null, reason: null, assessmentRefs: [], emergingIdentityRefs: [] };
  assert.equal(parse({ ...empty, operation: "clarification", followUps: [follow] }).success, true);
  assert.equal(parse({ ...empty, operation: "clarification", followUps: [{ ...follow, question: "Why?" }] }).success, false);
  assert.equal(parse({ ...empty, operation: "clarification", followUps: [{ ...follow, outcome: "follow_up_required", question: "What did you do?", reason: "Missing personal contribution" }] }).success, true);
});
