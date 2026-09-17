import { generateValidatedJson } from "../ai/provider";
import { finalSubmissionCheckSchema } from "../ai/schemas";
import {
  CAPABILITY_IDENTITY_RULES,
  EVIDENCE_ASSESSMENT_RULES,
} from "../domain/intelligence-contract";
import type { ExtractedCapability, Gap } from "../types";
import type { RoleAssessmentSnapshot } from "./role-snapshot";

/**
 * Performs the final AI consistency check through the provider boundary.
 * The result is still proposition/evidence-acquisition output; it is never
 * promoted directly to approved profile or CKM knowledge by this function.
 */
export async function runFinalRoleReview(
  role: RoleAssessmentSnapshot,
): Promise<{
  emergingCapabilities: ExtractedCapability[];
  clarifications: Gap[];
}> {
  const prompt = `
Perform a final consistency check on this career role before it is promoted to the candidate profile.

${CAPABILITY_IDENTITY_RULES}
${EVIDENCE_ASSESSMENT_RULES}

Return JSON only:

{
  "emergingCapabilities": [
    {
      "name": "",
      "evidence": "",
      "confidence": 0.0
    }
  ],
  "clarifications": [
    {
      "competency": "",
      "reason": "",
      "question": ""
    }
  ]
}

Rules:
- Look across role context, accepted/edited capabilities, rejected capabilities and clarification evidence.
- Identify an emerging capability only where evidence genuinely supports it.
- If there is a plausible capability signal but insufficient evidence, return a clarification question.
- Do not reopen rejected capabilities without new evidence.
- Do not duplicate capabilities already represented.
- A keyword alone is insufficient evidence.
- Return empty arrays when no further work is required.

Role:
${JSON.stringify({
  organisationName: role.organisationName,
  roleTitle: role.roleTitle,
  fromDate: role.fromDate,
  toDate: role.toDate,
  roleDescription: role.roleDescription,
  engagementModel: role.engagementModel,
  employmentContext: role.employmentContext,
  lifecycleStatus: role.lifecycleStatus,
  capabilities: role.capabilities,
  clarificationHistory: role.questions,
})}
`;

  const parsed = await generateValidatedJson({
    prompt,
    schema: finalSubmissionCheckSchema,
  });

  return {
    emergingCapabilities: parsed.emergingCapabilities.map((item) => ({
      name: item.name.trim(),
      evidence: item.evidence.trim(),
      confidence: item.confidence,
    })),
    clarifications: parsed.clarifications.map((item) => ({
      competency: item.competency.trim(),
      reason: item.reason.trim() || "Additional evidence is required.",
      question: item.question.trim(),
    })),
  };
}
