import { sql } from "@vercel/postgres";
import { CareerIntelligenceError } from "../errors";
import { findCompetency, verifyRoleOwnership } from "../data/repository";
import { recordSuccessGate } from "../success-gates";
import type { ReviewStatus } from "../types";

export async function reviewRoleCapability({
  userId,
  roleAssessmentId,
  capabilityId,
  reviewStatus,
  editedCompetencyName,
  editedEvidence,
}: {
  userId: string;
  roleAssessmentId: string;
  capabilityId: string;
  reviewStatus: Exclude<ReviewStatus, "proposed">;
  editedCompetencyName?: string | null;
  editedEvidence?: string | null;
}) {
  const assessmentId = await verifyRoleOwnership(roleAssessmentId, userId);

  if (reviewStatus === "edited" && !editedCompetencyName?.trim()) {
    throw new CareerIntelligenceError("Capability name is required when editing.", {
      status: 400,
      code: "edited_capability_name_required",
      expose: true,
    });
  }

  const editedCanonical =
    reviewStatus === "edited" && editedCompetencyName?.trim()
      ? await findCompetency(editedCompetencyName.trim())
      : null;

  const result = await sql`
    UPDATE career_role_capabilities
    SET
      review_status=${reviewStatus},
      edited_competency_name=${
        reviewStatus === "edited" ? editedCompetencyName?.trim() || null : null
      },
      edited_evidence=${
        reviewStatus === "edited" ? editedEvidence?.trim() || null : null
      },
      canonical_competency_id=CASE
        WHEN ${reviewStatus}='edited' THEN ${
          editedCanonical ? String(editedCanonical.id) : null
        }
        ELSE canonical_competency_id
      END,
      updated_at=NOW()
    WHERE id=${capabilityId}
      AND role_assessment_id=${roleAssessmentId}
    RETURNING id
  `;

  if (!result.rows.length) {
    throw new CareerIntelligenceError("Capability not found.", {
      status: 404,
      code: "capability_not_found",
      expose: true,
    });
  }

  await recordSuccessGate({
    assessmentId,
    roleAssessmentId,
    gateKey: "capability_review_completed",
    metadata: {
      capabilityId,
      reviewStatus,
    },
  });

  const remaining = await sql`
    SELECT COUNT(*)::int AS count
    FROM career_role_capabilities
    WHERE role_assessment_id=${roleAssessmentId}
      AND demonstrated=TRUE
      AND capability_status='demonstrated'
      AND review_status='proposed'
  `;

  if (Number(remaining.rows[0]?.count || 0) === 0) {
    await recordSuccessGate({
      assessmentId,
      roleAssessmentId,
      gateKey: "all_demonstrated_capabilities_reviewed",
    });
  }

  return { assessmentId };
}
