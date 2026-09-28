import { sql } from "@vercel/postgres";
import type { AssessmentStatus, CapabilityStatus, Gap } from "../types";
import { clamp } from "../utils";

export async function stageCapability({
  roleAssessmentId,
  competencyId = null,
  name,
  sourceType,
  sourceSection = null,
  evidence = "",
  confidence = 0,
  demonstrated,
  capabilityStatus,
  assessmentStatus,
}: {
  roleAssessmentId: string;
  competencyId?: string | null;
  name: string;
  sourceType: string;
  sourceSection?: string | null;
  evidence?: string;
  confidence?: number;
  demonstrated: boolean | null;
  capabilityStatus: CapabilityStatus;
  assessmentStatus: AssessmentStatus;
}) {
  const result = await sql`
    INSERT INTO career_role_capabilities (
      role_assessment_id,
      canonical_competency_id,
      proposed_competency_name,
      source_type,
      source_section,
      evidence,
      ai_confidence,
      demonstrated,
      capability_status,
      assessment_status,
      review_status,
      created_at,
      updated_at
    )
    VALUES (
      ${roleAssessmentId},
      ${competencyId},
      ${name},
      ${sourceType},
      ${sourceSection},
      ${evidence || null},
      ${clamp(confidence)},
      ${demonstrated},
      ${capabilityStatus},
      ${assessmentStatus},
      'proposed',
      NOW(),
      NOW()
    )
    RETURNING id
  `;

  return result.rows[0]?.id ? String(result.rows[0].id) : null;
}

export async function addClarificationRound(
  roleAssessmentId: string,
  gaps: Gap[],
) {
  if (!gaps.length) {
    return;
  }

  const roundResult = await sql`
    SELECT COALESCE(MAX(round_no), 0) AS max_round
    FROM career_role_questions
    WHERE role_assessment_id=${roleAssessmentId}
  `;

  const roundNo = Number(roundResult.rows[0]?.max_round || 0) + 1;

  for (const gap of gaps) {
    await sql`
      INSERT INTO career_role_questions (
        role_assessment_id,
        round_no,
        competency,
        reason,
        question,
        status,
        created_at,
        updated_at
      )
      VALUES (
        ${roleAssessmentId},
        ${roundNo},
        ${gap.competency},
        ${gap.reason},
        ${gap.question},
        'open',
        NOW(),
        NOW()
      )
    `;
  }
}
