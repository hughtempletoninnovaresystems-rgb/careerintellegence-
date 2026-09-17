import { sql } from "@vercel/postgres";
import { CareerIntelligenceError } from "../errors";
import { findCanonicalRole, verifyRoleOwnership } from "../data/repository";
import { recordSuccessGate } from "../success-gates";
import type { DatePrecision } from "../types";

export type RoleContextUpdate = {
  organisationName: string;
  roleTitle: string;
  roleDescription: string;
  fromDate?: string | null;
  toDate?: string | null;
  fromDatePrecision?: DatePrecision | null;
  toDatePrecision?: DatePrecision | null;
  fromDateOriginal?: string | null;
  toDateOriginal?: string | null;
  engagementModel?: string | null;
  employmentContext?: string | null;
};

export async function updateRoleContext({
  userId,
  roleAssessmentId,
  update,
}: {
  userId: string;
  roleAssessmentId: string;
  update: RoleContextUpdate;
}) {
  const assessmentId = await verifyRoleOwnership(roleAssessmentId, userId);

  const organisationName = update.organisationName.trim();
  const roleTitle = update.roleTitle.trim();
  const roleDescription = update.roleDescription.trim();

  if (!organisationName || !roleTitle || !roleDescription) {
    throw new CareerIntelligenceError(
      "Organisation, role title and role description are required.",
      {
        status: 400,
        code: "invalid_role_context",
        expose: true,
      },
    );
  }

  const canonical = await findCanonicalRole(roleTitle);
  const fromDate = update.fromDate || null;
  const fromDatePrecision =
    update.fromDatePrecision || (fromDate ? "day" : "unknown");
  const toDatePrecision =
    update.toDatePrecision || (update.toDate ? "day" : "unknown");
  const toDate = toDatePrecision === "ongoing" ? null : update.toDate || null;

  const result = await sql`
    UPDATE career_role_assessments
    SET
      canonical_role_id=${canonical ? String(canonical.id) : null},
      organisation_name=${organisationName},
      proposed_role_title=${roleTitle},
      from_date=${fromDate},
      to_date=${toDate},
      from_date_precision=${fromDatePrecision},
      to_date_precision=${toDatePrecision},
      from_date_original=${update.fromDateOriginal || fromDate || null},
      to_date_original=${
        toDatePrecision === "ongoing"
          ? "Present"
          : update.toDateOriginal || toDate || null
      },
      role_description=${roleDescription},
      engagement_model=${update.engagementModel || null},
      employment_context=${update.employmentContext || null},
      updated_at=NOW()
    WHERE id=${roleAssessmentId}
      AND lifecycle_status NOT IN ('submitted', 'completed')
    RETURNING id
  `;

  if (!result.rows.length) {
    throw new CareerIntelligenceError(
      "A submitted or completed role cannot be edited.",
      {
        status: 409,
        code: "role_context_immutable",
        expose: true,
      },
    );
  }

  await recordSuccessGate({
    assessmentId,
    roleAssessmentId,
    gateKey: "role_context_updated",
  });

  return { assessmentId };
}
