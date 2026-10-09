import { createHash } from "node:crypto";

/** Hash the exact capability content and current supporting source IDs reviewed by a person. */
export function hashCapabilityReviewContent(input: {
  canonicalCompetencyId: string | null;
  proposedName: string;
  editedName: string | null;
  evidence: string | null;
  editedEvidence: string | null;
  demonstrated: boolean | null;
  capabilityStatus: string | null;
  assessmentStatus: string | null;
  revisionNo: number;
  supportingEvidenceIds: string[];
}) {
  const canonical = JSON.stringify({
    canonicalCompetencyId: input.canonicalCompetencyId,
    proposedName: input.proposedName,
    editedName: input.editedName,
    evidence: input.evidence,
    editedEvidence: input.editedEvidence,
    demonstrated: input.demonstrated,
    capabilityStatus: input.capabilityStatus,
    assessmentStatus: input.assessmentStatus,
    revisionNo: input.revisionNo,
    supportingEvidenceIds: [...input.supportingEvidenceIds].sort(),
  });

  return createHash("sha256").update(canonical).digest("hex");
}
