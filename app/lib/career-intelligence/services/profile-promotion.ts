import { sql } from "@vercel/postgres";
import { proposeRepositoryKnowledge } from "./repository-enrichment";
import { loadRoleAssessmentSnapshot } from "./role-snapshot";

/**
 * Promotes user-approved role knowledge into the candidate profile.
 *
 * Candidate approval and CKM governance are deliberately separate:
 * - candidate profile rows may contain user-approved free-text capability names;
 * - only already-approved canonical role/capability IDs are attached to the
 *   candidate profile;
 * - newly discovered global role/capability intelligence is created only as
 *   proposed repository knowledge through proposeRepositoryKnowledge().
 *
 * This function is repeatable for a role assessment: the profile role is
 * upserted by source_role_assessment_id and its capability/gap snapshot is
 * rebuilt. It is not yet a database transaction; that remains a Gate 5 work
 * item because partial write recovery must be designed against the deployed
 * PostgreSQL/runtime transaction facilities.
 */
export async function promoteRoleToCandidateProfile({
  roleAssessmentId,
  userId,
}: {
  roleAssessmentId: string;
  userId: string;
}) {
  const role = await loadRoleAssessmentSnapshot(roleAssessmentId);
  const originalCanonicalRoleId = role.canonicalRoleId;

  const approvedProfileCapabilities = role.capabilities.filter(
    (capability) =>
      capability.capabilityStatus === "demonstrated" &&
      (capability.reviewStatus === "accepted" ||
        capability.reviewStatus === "edited"),
  );

  const repositoryEnrichment = await proposeRepositoryKnowledge({
    roleTitle: role.roleTitle,
    roleDescription: role.roleDescription,
    source: {
      assessmentId: role.assessmentId,
      roleAssessmentId,
      userId,
    },
    capabilities: approvedProfileCapabilities.map((capability) => ({
      name: capability.editedName || capability.proposedName,
      // loadRoleAssessmentSnapshot only maps canonical competencies already
      // attached by approved-only repository lookup.
      approvedCanonicalCompetencyId: capability.canonicalCompetencyId,
    })),
  });

  const profileResult = await sql`
    INSERT INTO candidate_profile_roles (
      user_id,
      source_role_assessment_id,
      canonical_role_id,
      organisation_name,
      role_title,
      from_date,
      to_date,
      from_date_precision,
      to_date_precision,
      from_date_original,
      to_date_original,
      role_description,
      engagement_model,
      employment_context,
      updated_at
    )
    VALUES (
      ${userId},
      ${roleAssessmentId},
      ${originalCanonicalRoleId},
      ${role.organisationName},
      ${role.roleTitle},
      ${role.fromDate || null},
      ${role.toDatePrecision === "ongoing" ? null : role.toDate || null},
      ${role.fromDatePrecision || "unknown"},
      ${role.toDatePrecision || "unknown"},
      ${role.fromDateOriginal || role.fromDate || null},
      ${
        role.toDatePrecision === "ongoing"
          ? "Present"
          : role.toDateOriginal || role.toDate || null
      },
      ${role.roleDescription || null},
      ${role.engagementModel || null},
      ${role.employmentContext || null},
      NOW()
    )
    ON CONFLICT (source_role_assessment_id)
    DO UPDATE SET
      canonical_role_id=EXCLUDED.canonical_role_id,
      organisation_name=EXCLUDED.organisation_name,
      role_title=EXCLUDED.role_title,
      from_date=EXCLUDED.from_date,
      to_date=EXCLUDED.to_date,
      from_date_precision=EXCLUDED.from_date_precision,
      to_date_precision=EXCLUDED.to_date_precision,
      from_date_original=EXCLUDED.from_date_original,
      to_date_original=EXCLUDED.to_date_original,
      role_description=EXCLUDED.role_description,
      engagement_model=EXCLUDED.engagement_model,
      employment_context=EXCLUDED.employment_context,
      updated_at=NOW()
    RETURNING id
  `;

  const profileRoleId = String(profileResult.rows[0].id);

  await sql`
    DELETE FROM candidate_profile_role_capabilities
    WHERE candidate_profile_role_id=${profileRoleId}
  `;

  await sql`
    DELETE FROM candidate_profile_role_gaps
    WHERE candidate_profile_role_id=${profileRoleId}
  `;

  for (const capability of role.capabilities) {
    const name = capability.editedName || capability.proposedName;
    const evidence = capability.editedEvidence || capability.evidence || null;

    if (
      capability.capabilityStatus === "demonstrated" &&
      (capability.reviewStatus === "accepted" ||
        capability.reviewStatus === "edited")
    ) {
      const competencyId = capability.canonicalCompetencyId || null;

      await sql`
        INSERT INTO candidate_profile_role_capabilities (
          candidate_profile_role_id,
          competency_id,
          capability_name,
          confidence,
          evidence,
          source_type,
          updated_at
        )
        VALUES (
          ${profileRoleId},
          ${competencyId},
          ${name},
          ${capability.confidence || 0},
          ${evidence},
          ${capability.sourceType || "assessment"},
          NOW()
        )
      `;

      // Legacy candidate_knowledge is retained for compatibility but is only
      // populated where BOTH role and capability identities were already
      // approved repository knowledge at assessment time.
      if (originalCanonicalRoleId && competencyId) {
        await sql`
          INSERT INTO candidate_knowledge (
            user_id,
            role_id,
            competency_id,
            confidence,
            updated_at
          )
          VALUES (
            ${userId},
            ${originalCanonicalRoleId},
            ${competencyId},
            ${capability.confidence || 0},
            NOW()
          )
          ON CONFLICT (user_id, role_id, competency_id)
          DO UPDATE SET
            confidence=EXCLUDED.confidence,
            updated_at=NOW()
        `;
      }
    }

    if (capability.capabilityStatus === "gap") {
      await sql`
        INSERT INTO candidate_profile_role_gaps (
          candidate_profile_role_id,
          competency_name,
          evidence
        )
        VALUES (
          ${profileRoleId},
          ${name},
          ${evidence}
        )
      `;
    }
  }

  return {
    profileRoleId,
    repositoryRoleId: repositoryEnrichment.repositoryRoleId,
    governanceConflicts: repositoryEnrichment.governanceConflicts,
  };
}
