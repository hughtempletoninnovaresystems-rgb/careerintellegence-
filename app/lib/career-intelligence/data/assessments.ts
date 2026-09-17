import { sql } from "@vercel/postgres";
import type { DatePrecision } from "../types";
import type { RoleLifecycleStatus } from "../domain/workflow";

export type AssessmentSourceType = "cv" | "manual";

export async function createCareerAssessment({
  userId,
  sourceType,
  candidateName,
}: {
  userId: string;
  sourceType: AssessmentSourceType;
  candidateName?: string | null;
}) {
  const result = await sql`
    INSERT INTO career_assessments (
      user_id,
      source_type,
      status,
      candidate_name,
      updated_at
    )
    VALUES (
      ${userId},
      ${sourceType},
      'in_progress',
      ${candidateName || null},
      NOW()
    )
    RETURNING id
  `;

  return String(result.rows[0].id);
}

export type CareerRoleAssessmentInput = {
  organisationName: string;
  roleTitle: string;
  fromDate?: string | null;
  toDate?: string | null;
  fromDatePrecision?: DatePrecision | null;
  toDatePrecision?: DatePrecision | null;
  fromDateOriginal?: string | null;
  toDateOriginal?: string | null;
  roleDescription?: string | null;
  engagementModel?: string | null;
  employmentContext?: string | null;
};

export async function createCareerRoleAssessment({
  assessmentId,
  sequenceNo,
  role,
  canonicalRoleId,
  lifecycleStatus,
}: {
  assessmentId: string;
  sequenceNo: number;
  role: CareerRoleAssessmentInput;
  canonicalRoleId: string | null;
  lifecycleStatus: Extract<RoleLifecycleStatus, "in_progress" | "not_started">;
}) {
  const current = role.toDatePrecision === "ongoing";

  const fromDatePrecision =
    role.fromDatePrecision || (role.fromDate ? "day" : "unknown");

  const toDatePrecision = current
    ? "ongoing"
    : role.toDatePrecision || (role.toDate ? "day" : "unknown");

  const result = await sql`
    INSERT INTO career_role_assessments (
      assessment_id,
      sequence_no,
      canonical_role_id,
      organisation_name,
      proposed_role_title,
      from_date,
      to_date,
      from_date_precision,
      to_date_precision,
      from_date_original,
      to_date_original,
      role_description,
      engagement_model,
      employment_context,
      lifecycle_status,
      updated_at
    )
    VALUES (
      ${assessmentId},
      ${sequenceNo},
      ${canonicalRoleId},
      ${role.organisationName},
      ${role.roleTitle},
      ${role.fromDate || null},
      ${current ? null : role.toDate || null},
      ${fromDatePrecision},
      ${toDatePrecision},
      ${role.fromDateOriginal || role.fromDate || null},
      ${current ? "Present" : role.toDateOriginal || role.toDate || null},
      ${role.roleDescription || null},
      ${role.engagementModel || null},
      ${role.employmentContext || null},
      ${lifecycleStatus},
      NOW()
    )
    RETURNING id
  `;

  return String(result.rows[0].id);
}
