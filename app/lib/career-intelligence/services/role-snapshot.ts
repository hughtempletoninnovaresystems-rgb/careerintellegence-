import { sql } from "@vercel/postgres";
import { CareerIntelligenceError } from "../errors";
import { getSuccessGates } from "../success-gates";
import { formatDateForInput } from "../utils";

export type RoleCapabilitySnapshot = {
  id: string;
  canonicalCompetencyId: string | null;
  canonicalName: string | null;
  proposedName: string;
  evidence: string;
  confidence: number;
  demonstrated: boolean;
  capabilityStatus: string;
  assessmentStatus: string;
  reviewStatus: string;
  editedName: string | null;
  editedEvidence: string | null;
  sourceType: string;
};

export type RoleQuestionSnapshot = {
  id: string;
  competency: string;
  reason: string;
  question: string;
  status: string;
  roundNo: number;
  answer: string | null;
  answeredAt: string | null;
};

export type RoleAssessmentSnapshot = {
  roleAssessmentId: string;
  assessmentId: string;
  sequenceNo: number;
  canonicalRoleId: string | null;
  organisationName: string;
  roleTitle: string;
  fromDate: string;
  toDate: string;
  fromDatePrecision: string | null;
  toDatePrecision: string | null;
  fromDateOriginal: string | null;
  toDateOriginal: string | null;
  roleDescription: string;
  engagementModel: string;
  employmentContext: string;
  lifecycleStatus: string;
  capabilities: RoleCapabilitySnapshot[];
  questions: RoleQuestionSnapshot[];
  successGates: Awaited<ReturnType<typeof getSuccessGates>>;
};

export async function loadRoleAssessmentSnapshot(
  roleAssessmentId: string,
): Promise<RoleAssessmentSnapshot> {
  const roleResult = await sql`
    SELECT *
    FROM career_role_assessments
    WHERE id=${roleAssessmentId}
    LIMIT 1
  `;

  if (!roleResult.rows.length) {
    throw new CareerIntelligenceError("Role assessment not found.", {
      status: 404,
      code: "role_assessment_not_found",
      expose: true,
    });
  }

  const role = roleResult.rows[0];

  const capabilityResult = await sql`
    SELECT
      crc.*,
      c.name AS canonical_name
    FROM career_role_capabilities crc
    LEFT JOIN competencies c
      ON c.id=crc.canonical_competency_id
    WHERE crc.role_assessment_id=${roleAssessmentId}
    ORDER BY crc.created_at, crc.id
  `;

  const questionResult = await sql`
    SELECT
      q.id,
      q.competency,
      q.reason,
      q.question,
      q.status,
      q.round_no,
      q.created_at,
      q.updated_at,
      (
        SELECT a.answer
        FROM career_role_answers a
        WHERE a.question_id=q.id
        ORDER BY a.created_at DESC
        LIMIT 1
      ) AS answer,
      CASE
        WHEN q.status='answered' THEN q.updated_at
        ELSE NULL
      END AS answered_at
    FROM career_role_questions q
    WHERE q.role_assessment_id=${roleAssessmentId}
    ORDER BY q.round_no, q.created_at, q.id
  `;

  const assessmentId = String(role.assessment_id);
  const successGates = await getSuccessGates(assessmentId, roleAssessmentId);

  return {
    roleAssessmentId: String(role.id),
    assessmentId,
    sequenceNo: Number(role.sequence_no),
    canonicalRoleId: role.canonical_role_id ? String(role.canonical_role_id) : null,
    organisationName: String(role.organisation_name || ""),
    roleTitle: String(role.proposed_role_title || ""),
    fromDate: formatDateForInput(role.from_date),
    toDate:
      role.to_date_precision === "ongoing" ? "" : formatDateForInput(role.to_date),
    fromDatePrecision: role.from_date_precision
      ? String(role.from_date_precision)
      : null,
    toDatePrecision: role.to_date_precision ? String(role.to_date_precision) : null,
    fromDateOriginal: role.from_date_original ? String(role.from_date_original) : null,
    toDateOriginal: role.to_date_original ? String(role.to_date_original) : null,
    roleDescription: String(role.role_description || ""),
    engagementModel: String(role.engagement_model || ""),
    employmentContext: String(role.employment_context || ""),
    lifecycleStatus: String(role.lifecycle_status || ""),
    capabilities: capabilityResult.rows.map((capability) => ({
      id: String(capability.id),
      canonicalCompetencyId: capability.canonical_competency_id
        ? String(capability.canonical_competency_id)
        : null,
      canonicalName: capability.canonical_name
        ? String(capability.canonical_name)
        : null,
      proposedName: String(capability.proposed_competency_name || ""),
      evidence: String(capability.evidence || ""),
      confidence: Number(capability.ai_confidence || 0),
      demonstrated: Boolean(capability.demonstrated),
      capabilityStatus: String(capability.capability_status || ""),
      assessmentStatus: String(capability.assessment_status || ""),
      reviewStatus: String(capability.review_status || ""),
      editedName: capability.edited_competency_name
        ? String(capability.edited_competency_name)
        : null,
      editedEvidence: capability.edited_evidence
        ? String(capability.edited_evidence)
        : null,
      sourceType: String(capability.source_type || ""),
    })),
    questions: questionResult.rows.map((question) => ({
      id: String(question.id),
      competency: String(question.competency || ""),
      reason: String(question.reason || ""),
      question: String(question.question || ""),
      status: String(question.status || ""),
      roundNo: Number(question.round_no || 0),
      answer: question.answer ? String(question.answer) : null,
      answeredAt: question.answered_at
        ? new Date(question.answered_at).toISOString()
        : null,
    })),
    successGates,
  };
}

export async function getCvRolePayload(roleAssessmentId: string) {
  const role = await loadRoleAssessmentSnapshot(roleAssessmentId);

  return {
    roleAssessmentId: role.roleAssessmentId,
    assessmentId: role.assessmentId,
    sequenceNo: role.sequenceNo,
    canonicalRoleId: role.canonicalRoleId,
    organisationName: role.organisationName,
    roleTitle: role.roleTitle,
    fromDate: role.fromDate,
    toDate: role.toDate,
    fromDatePrecision: role.fromDatePrecision,
    toDatePrecision: role.toDatePrecision,
    fromDateOriginal: role.fromDateOriginal,
    toDateOriginal: role.toDateOriginal,
    roleDescription: role.roleDescription,
    engagementModel: role.engagementModel,
    employmentContext: role.employmentContext,
    lifecycleStatus: role.lifecycleStatus,
    stagedCapabilities: role.capabilities.map((capability) => ({
      id: capability.id,
      canonicalCompetencyId: capability.canonicalCompetencyId,
      proposedCompetencyName:
        capability.editedName || capability.canonicalName || capability.proposedName,
      evidence: capability.editedEvidence || capability.evidence,
      confidence: capability.confidence,
      demonstrated: capability.demonstrated,
      capabilityStatus: capability.capabilityStatus,
      assessmentStatus: capability.assessmentStatus,
      reviewStatus: capability.reviewStatus,
      editedCompetencyName: capability.editedName,
      editedEvidence: capability.editedEvidence,
      sourceType: capability.sourceType,
    })),
    gaps: role.questions
      .filter((question) => question.status === "open")
      .map((question) => ({
        id: question.id,
        competency: question.competency,
        reason: question.reason,
        question: question.question,
      })),
    successGates: role.successGates,
  };
}

export async function getManualRolePayload(roleAssessmentId: string) {
  const role = await loadRoleAssessmentSnapshot(roleAssessmentId);

  return {
    id: role.roleAssessmentId,
    assessmentId: role.assessmentId,
    roleIndex: role.sequenceNo,
    canonicalRoleId: role.canonicalRoleId,
    organisation: role.organisationName,
    roleTitle: role.roleTitle,
    fromDate: role.fromDate,
    toDate: role.toDate,
    fromDatePrecision: role.fromDatePrecision,
    toDatePrecision: role.toDatePrecision,
    fromDateOriginal: role.fromDateOriginal,
    toDateOriginal: role.toDateOriginal,
    description: role.roleDescription,
    engagementType: role.engagementModel,
    employmentType: role.employmentContext,
    lifecycleStatus: role.lifecycleStatus,
    capabilities: role.capabilities.map((capability) => ({
      id: capability.id,
      competencyId: capability.canonicalCompetencyId,
      name: capability.canonicalName || capability.proposedName,
      evidence: capability.evidence,
      confidence: capability.confidence,
      capabilityStatus: capability.capabilityStatus,
      assessmentStatus: capability.assessmentStatus,
      reviewStatus: capability.reviewStatus,
      editedName: capability.editedName,
      editedEvidence: capability.editedEvidence,
      source: capability.sourceType,
    })),
    questions: role.questions.map((question) => ({
      id: question.id,
      capability: question.competency,
      question: question.question,
      reason: question.reason,
      answer: question.answer,
      answeredAt: question.answeredAt,
    })),
    successGates: role.successGates,
  };
}
