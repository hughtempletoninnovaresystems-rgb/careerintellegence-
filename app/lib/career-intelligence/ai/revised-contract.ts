/**
 * CI-AI-12-v0.1 logical/semantic contract for an isolated revised-IC pilot.
 * NOT mapped to persisted legacy rows and NOT enabled for domain writes.
 * Every source identifier must resolve to server-authorised input records.
 */
import { z } from "zod";

export const REVISED_AI_CONTRACT_VERSION = "CI-AI-12-v0.1" as const;
const ref = z.string().trim().min(1).max(256);
const requiredText = z.string().trim().min(1).max(20_000);
const text = z.string().max(20_000);
const refs = z.array(ref).max(250);

const identity = z.object({
  identityRef: ref, definitionRevision: ref, name: requiredText,
  definition: requiredText, decisionRefs: refs,
  attributes: z.array(z.object({ kind: ref, value: requiredText })).max(100),
  supersedesRef: ref.nullable(),
}).strict();
const decision = z.object({
  decisionRef: ref, exactExpression: requiredText, sourceRef: ref,
  constituentDefinitions: z.array(requiredText).max(100),
  counterfactual: z.enum(["yes", "no", "not_required", "ambiguous"]),
  subsumption: z.enum(["independent", "same_ability", "method", "tool", "context", "step", "ambiguous"]),
  decision: z.enum(["accept", "split", "subsume", "governance"]),
  resultingIdentityRefs: refs, justification: requiredText,
}).strict();
const assessment = z.object({
  assessmentRef: ref, roleRef: ref, identityRef: ref, definitionRevision: ref,
  disposition: z.enum(["assessed", "hold", "not_applicable"]),
  evidenceGrade: z.enum(["E0", "E1", "E2", "E3"]).nullable(),
  sourceRefs: refs, personalApplication: text, justification: requiredText,
  applicationLimits: text, missingElement: requiredText.nullable(),
  holdRefs: refs,
  sourceRelationships: z.array(z.object({
    sourceRef: ref, relationship: z.enum(["supporting", "contradictory", "inconclusive"]),
  }).strict()).max(250),
}).strict();
const unresolved = z.object({
  signalRef: ref, exactWording: requiredText, sourceRef: ref, reason: requiredText,
  roleRef: ref.nullable(),
  uncertainty: z.enum(["source_mapping", "role_attribution", "personal_contribution", "definition_scope"]),
  alternatives: z.array(requiredText).max(50), possibleIdentityRefs: refs,
  proposedAction: z.enum(["candidate_clarification", "governance_review", "defer"]),
}).strict();
const governance = z.object({
  governanceRef: ref, expression: requiredText, reason: requiredText,
  decisionNeeded: requiredText, sourceRefs: refs,
  alternativeDefinitions: z.array(requiredText).max(100), affectedIdentityRefs: refs,
}).strict();
const priority = z.object({
  priorityRef: ref, targetRef: ref, treatment: z.enum(["investigate_now", "defer"]),
  materialityReason: requiredText,
}).strict();
const followUp = z.object({
  targetQuestionRef: ref, roleRef: ref, identityRef: ref, definitionRevision: ref,
  outcome: z.enum(["resolved", "follow_up_required", "closed_unresolved", "review_hold"]),
  question: requiredText.nullable(), reason: requiredText.nullable(),
  assessmentRefs: refs, emergingIdentityRefs: refs,
}).strict();
const coverage = z.object({
  sourceRef: ref, disposition: z.enum(["represented", "context_only", "unresolved"]),
  decisionRefs: refs, signalRefs: refs, governanceRefs: refs, reason: text,
}).strict();

export const revisedAIEnvelopeProviderSchema = z.object({
  contractVersion: z.literal(REVISED_AI_CONTRACT_VERSION),
  operation: z.enum(["extraction", "identity", "initial_evidence", "question_planning", "clarification", "edit", "final_submission"]),
  runReference: ref,
  identities: z.array(identity).max(200),
  decisions: z.array(decision).max(300),
  assessments: z.array(assessment).max(300),
  unresolvedSignals: z.array(unresolved).max(300),
  governanceItems: z.array(governance).max(200),
  priorities: z.array(priority).max(300),
  followUps: z.array(followUp).max(200),
  sourceCoverage: z.array(coverage).max(500),
}).strict();

export const revisedAIEnvelopeSchema = revisedAIEnvelopeProviderSchema.superRefine((result, context) => {
  const issue = (path: (string | number)[], message: string) =>
    context.addIssue({ code: z.ZodIssueCode.custom, path, message });
  const unique = (values: string[], key: string) => {
    if (new Set(values).size !== values.length) issue([key], "Duplicate identifiers are not allowed.");
  };
  for (const [key, values] of [
    ["identities", result.identities.map((x) => x.identityRef)],
    ["decisions", result.decisions.map((x) => x.decisionRef)],
    ["assessments", result.assessments.map((x) => x.assessmentRef)],
    ["unresolvedSignals", result.unresolvedSignals.map((x) => x.signalRef)],
    ["governanceItems", result.governanceItems.map((x) => x.governanceRef)],
    ["priorities", result.priorities.map((x) => x.priorityRef)],
    ["followUps", result.followUps.map((x) => x.targetQuestionRef)],
    ["sourceCoverage", result.sourceCoverage.map((x) => x.sourceRef)],
  ] as Array<[string, string[]]>) unique(values, key);
  const identityMap = new Map(result.identities.map((x) => [x.identityRef, x]));
  const issues = new Set([...result.unresolvedSignals.map((x) => x.signalRef), ...result.governanceItems.map((x) => x.governanceRef)]);
  const assessmentRefs = new Set(result.assessments.map((x) => x.assessmentRef));
  const followUps = new Set(result.followUps.map((x) => x.targetQuestionRef));
  const isIdentityStage = result.operation === "identity" || result.operation === "extraction";
  const mayAssess = ["initial_evidence", "clarification", "edit"].includes(result.operation);
  if (!isIdentityStage && result.decisions.length) issue(["decisions"], "Identity mutation is not permitted in this stage.");
  if (!isIdentityStage && result.identities.length) issue(["identities"], "Identity mutation is not permitted in this stage.");
  if (!mayAssess && result.assessments.length) issue(["assessments"], "Evidence grading not permitted in this stage.");
  if (result.operation !== "clarification" && result.followUps.length) issue(["followUps"], "Follow-ups not permitted in this stage.");
  const refsForThisRun = new Set(result.identities.map((x) => x.identityRef));
  result.decisions.forEach((item, index) => {
    for (const r of item.resultingIdentityRefs) if (!refsForThisRun.has(r)) issue(["decisions", index, "resultingIdentityRefs"], "Unknown identity result.");
  });
  result.assessments.forEach((a, i) => {
    if (a.disposition === "assessed" && a.evidenceGrade === null ||
        a.disposition !== "assessed" && a.evidenceGrade !== null)
      issue(["assessments", i, "evidenceGrade"], "Disposition and evidence grade disagree.");
    if (a.disposition === "hold" && !a.holdRefs.length)
      issue(["assessments", i, "holdRefs"], "A row hold must reference a recorded issue.");
    for (const r of a.holdRefs) if (!issues.has(r)) issue(["assessments", i, "holdRefs"], "Hold reference not found.");
    if (a.disposition === "not_applicable" && !a.justification.trim())
      issue(["assessments", i, "justification"], "Scope reason is required.");
    if (a.evidenceGrade === "E3" && (!a.sourceRefs.length || !a.personalApplication.trim() || !a.applicationLimits.trim()))
      issue(["assessments", i, "evidenceGrade"], "E3 requires attributable source, personal application and application limits.");
    if (a.evidenceGrade === "E2" && !a.missingElement)
      issue(["assessments", i, "missingElement"], "E2 must explain the essential missing element.");
    if (a.evidenceGrade === "E1" && !a.sourceRefs.length)
      issue(["assessments", i, "sourceRefs"], "E1 must identify an indirect source.");
    if (a.evidenceGrade === "E0" && a.personalApplication.trim())
      issue(["assessments", i, "personalApplication"], "E0 cannot assert personal application.");
    for (const item of a.sourceRelationships) if (!a.sourceRefs.includes(item.sourceRef))
      issue(["assessments", i, "sourceRelationships"], "Unreferenced source relationship.");
  });
  result.followUps.forEach((f, i) => {
    if (f.outcome === "resolved" && (f.question !== null || f.reason !== null) ||
        f.outcome === "follow_up_required" && (f.question === null || f.reason === null) ||
        ["closed_unresolved", "review_hold"].includes(f.outcome) && (f.question !== null || f.reason === null))
      issue(["followUps", i], "Follow-up outcome requires the correct nullable question/reason pair.");
    for (const r of f.assessmentRefs) if (!assessmentRefs.has(r))
      issue(["followUps", i, "assessmentRefs"], "Unknown assessment reference.");
  });
  void identityMap;
  void followUps;
});

export type RevisedAIEnvelope = z.infer<typeof revisedAIEnvelopeSchema>;

/** Server context is trusted, never generated by the model. */
export function validateRevisedOutputAgainstInput(
  output: RevisedAIEnvelope,
  input: { operation: RevisedAIEnvelope["operation"]; frozenIdentities: Array<{ identityRef: string; definitionRevision: string }>;
    roleRefs: string[]; sourceRefs: string[]; questionRefs: string[]; requiredSourceRefs: string[] },
): void {
  if (output.operation !== input.operation) throw new Error("AI operation mismatch.");
  const identitySet = new Set(input.frozenIdentities.map((x) => `${x.identityRef}:${x.definitionRevision}`));
  const roles = new Set(input.roleRefs);
  const sources = new Set(input.sourceRefs);
  const questions = new Set(input.questionRefs);
  for (const a of output.assessments) {
    if (!identitySet.has(`${a.identityRef}:${a.definitionRevision}`) || !roles.has(a.roleRef)) throw new Error("Unknown identity revision/role.");
    if (a.sourceRefs.some((r) => !sources.has(r))) throw new Error("Assessment source is not in trusted input.");
  }
  for (const x of output.followUps) {
    if (!questions.has(x.targetQuestionRef) || !identitySet.has(`${x.identityRef}:${x.definitionRevision}`) || !roles.has(x.roleRef))
      throw new Error("Invalid question/identity/role target.");
  }
  for (const x of output.sourceCoverage) if (!sources.has(x.sourceRef)) throw new Error("Unknown source coverage reference.");
  const covered = new Set(output.sourceCoverage.map((x) => x.sourceRef));
  if (input.requiredSourceRefs.some((r) => !covered.has(r))) throw new Error("Source coverage incomplete.");
}
