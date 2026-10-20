/**
 * Bounded REVISED-IC PREVIEW, not the deployed application assessment path.
 * Requires the user of this function to pass server-authorised, frozen inputs.
 * No candidate/profile domain writes take place here. The invocation audit is
 * recorded by the provider; the caller must store controlled comparison data.
 */
import { generateValidatedJson } from "../ai/provider";
import {
  revisedAIEnvelopeSchema, validateRevisedOutputAgainstInput,
  type RevisedAIEnvelope,
} from "../ai/revised-contract";
import {
  REVISED_CAPABILITY_IDENTITY_RULES,
  REVISED_EVIDENCE_ASSESSMENT_RULES,
  REVISED_CANDIDATE_OWNED_EVIDENCE_RULES,
  ENRICHMENT_AND_REVIEW_RULES,
  INTELLIGENCE_POLICY_VERSION,
} from "../domain/revised-intelligence-contract";
import { CareerIntelligenceError } from "../errors";

export type FrozenPilotInput = {
  operation: RevisedAIEnvelope["operation"];
  sourceText: string;
  roleRefs: string[];
  sourceRefs: string[];
  questionRefs: string[];
  requiredSourceRefs: string[];
  frozenIdentities: Array<{ identityRef: string; definitionRevision: string; definition: string }>;
};

export async function runRevisedIntelligencePreview({
  input, provider = "google", runReference,
}: {
  input: FrozenPilotInput;
  provider?: "google" | "openai";
  runReference: string;
}): Promise<RevisedAIEnvelope> {
  if (process.env.CAREER_REVISED_PILOT_ENABLED !== "true") {
    throw new CareerIntelligenceError("The revised contract pilot is not enabled.",
      { status: 403, code: "revised_pilot_disabled", expose: true });
  }
  if (!runReference || !input.sourceText.trim() || !input.sourceRefs.length) {
    throw new CareerIntelligenceError("The pilot needs the frozen source bundle.",
      { status: 400, code: "pilot_input_incomplete", expose: true });
  }
  const policy = [REVISED_CAPABILITY_IDENTITY_RULES, REVISED_EVIDENCE_ASSESSMENT_RULES,
    REVISED_CANDIDATE_OWNED_EVIDENCE_RULES, ENRICHMENT_AND_REVIEW_RULES].join("\n\n");
  const prompt = `Return one JSON object conforming to the explicit CI-AI-12-v0.1 envelope.\n
This is a PREVIEW; do not claim candidate review or canonical approval.\n
Policy version: ${INTELLIGENCE_POLICY_VERSION}\n${policy}\n
Operation: ${input.operation}; run reference: ${runReference}\n
Use the EXACT provided frozen definitions/revisions for evidence-only operations.\n
Preserve source mapping and uncertainty. Never fill a missing grade with E0.\n
All nine envelope arrays are REQUIRED even if empty. No markdown.\n
Trusted input bundle:\n${JSON.stringify(input)}`;
  const output = await generateValidatedJson({
    prompt,
    schema: revisedAIEnvelopeSchema,
    pilotProvider: provider,
    context: { operation: "revised_ic_preview" },
  });
  if (output.runReference !== runReference) throw new Error("Pilot run reference mismatch.");
  validateRevisedOutputAgainstInput(output, input);
  return output;
}
