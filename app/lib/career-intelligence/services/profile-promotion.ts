import { sql } from "@vercel/postgres";
import type { CareerQueryClient } from "../data/query-client";
import { getCareerSql } from "../db/career-sql";
import { proposeRepositoryKnowledge } from "./repository-enrichment";
import { isPromotionEligible } from "./promotion-eligibility";
export { isPromotionEligible } from "./promotion-eligibility";
import {
  loadRoleAssessmentSnapshot,
  type RoleAssessmentSnapshot,
} from "./role-snapshot";
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
 * The function remains repeatable for a role assessment. When supplied with
 * a connected client by the role-completion service, all Profile and
 * Repository writes participate in the caller's transaction.
 */

export type PromotionResult = {
  profileRoleId: string;
  repositoryRoleId: string | null;
  eligibleCapabilityIds: string[];
  representedProfileIdentities: string[];
  repositoryMappings: {
    capabilityId: string;
    competencyId: string;
  }[];
};

type ReconciledCapability = {
  identity: string;
  name: string;
  canonicalCompetencyId: string | null;
  confidence: number;
  evidence: string | null;
  sourceType: string;
  sourceCapabilityIds: string[];
};

function normaliseCapabilityName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function finalCapabilityName(capability: any) {
  return String(
    capability.editedName || capability.proposedName || "",
  ).trim();
}

function finalCapabilityEvidence(capability: any) {
  const value = capability.editedEvidence || capability.evidence;

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

/**
 * Candidate capability identity reconciliation.
 *
 * An already-approved canonical competency ID is the strongest available
 * identity. Otherwise the final candidate-approved display name is compared
 * using exact normalisation only.
 *
 * Deliberately no fuzzy or semantic matching is performed here.
 */
function reconcileEligibleCapabilities(
  capabilities: any[],
): ReconciledCapability[] {
  const reconciled = new Map<string, ReconciledCapability>();

  for (const capability of capabilities) {
    const name = finalCapabilityName(capability);

    if (!name) {
      continue;
    }

    const canonicalCompetencyId = capability.canonicalCompetencyId
      ? String(capability.canonicalCompetencyId)
      : null;

    const normalisedName = normaliseCapabilityName(name);

    let identity: string;
    let existing: ReconciledCapability | undefined;

    if (canonicalCompetencyId) {
      identity = `canonical:${canonicalCompetencyId}`;
      existing = reconciled.get(identity);

      /*
       * A capability previously encountered without a canonical ID may have
       * the same exact final display name. Once an approved canonical identity
       * is available, promote that exact-name group to the stronger identity.
       */
      if (!existing) {
        const nameIdentity = `name:${normalisedName}`;
        const nameMatch = reconciled.get(nameIdentity);

        if (nameMatch && !nameMatch.canonicalCompetencyId) {
          reconciled.delete(nameIdentity);
          nameMatch.identity = identity;
          nameMatch.canonicalCompetencyId = canonicalCompetencyId;
          reconciled.set(identity, nameMatch);
          existing = nameMatch;
        }
      }
    } else {
      const canonicalMatch = Array.from(reconciled.values()).find(
        (item) =>
          item.canonicalCompetencyId !== null &&
          normaliseCapabilityName(item.name) === normalisedName,
      );

      if (canonicalMatch) {
        identity = canonicalMatch.identity;
        existing = canonicalMatch;
      } else {
        identity = `name:${normalisedName}`;
        existing = reconciled.get(identity);
      }
    }

    const evidence = finalCapabilityEvidence(capability);
    const capabilityId = String(capability.id);
    const confidence = Number(capability.confidence || 0);
    const sourceType = capability.sourceType || "assessment";

    if (!existing) {
      reconciled.set(identity, {
        identity,
        name,
        canonicalCompetencyId,
        confidence,
        evidence,
        sourceType,
        sourceCapabilityIds: [capabilityId],
      });

      continue;
    }

    existing.sourceCapabilityIds.push(capabilityId);
    existing.confidence = Math.max(existing.confidence, confidence);

    if (!existing.canonicalCompetencyId && canonicalCompetencyId) {
      existing.canonicalCompetencyId = canonicalCompetencyId;
    }

    /*
     * Preserve all material candidate evidence without inventing a provenance
     * schema. Assessment rows remain the authoritative source provenance.
     */
    if (evidence) {
      const existingEvidence = existing.evidence
        ? existing.evidence
            .split("\n\n")
            .map((item) => item.trim())
            .filter(Boolean)
        : [];

      if (!existingEvidence.includes(evidence)) {
        existing.evidence = [...existingEvidence, evidence].join("\n\n");
      }
    }
  }

  return Array.from(reconciled.values());
}

export async function promoteRoleToCandidateProfile({
    roleAssessmentId,
    userId,
    client,
    snapshot,
  }: {
    roleAssessmentId: string;
    userId: string;
    client?: CareerQueryClient;
    snapshot?: RoleAssessmentSnapshot;
  }): Promise<PromotionResult> {
  const query = getCareerSql(client);

  /*
   * When called inside the atomic completion unit, the caller supplies the
   * authoritative pre-transaction snapshot so promotion performs no
   * pool/global queries after BEGIN.
   */
  const role =
    snapshot || (await loadRoleAssessmentSnapshot(roleAssessmentId));

  const originalCanonicalRoleId = role.canonicalRoleId;

  /*
   * CI-DRWP-006:
   * This is the single authoritative eligible capability set consumed by both
   * Candidate Profile promotion and Repository acquisition.
   */
  const eligibleCapabilities = role.capabilities.filter(isPromotionEligible);

  const eligibleCapabilityIds = eligibleCapabilities.map((capability) =>
    String(capability.id),
  );

  const reconciledCapabilities =
    reconcileEligibleCapabilities(eligibleCapabilities);

  /*
   * Every eligible source capability must belong to a reconciled identity.
   * Multiple source capabilities may legitimately resolve to one identity, so
   * count equality between source rows and Profile identities is invalid.
   */
  const representedSourceCapabilityIds = new Set(
    reconciledCapabilities.flatMap(
      (capability) => capability.sourceCapabilityIds,
    ),
  );

  const missingCapabilityIds = eligibleCapabilityIds.filter(
    (capabilityId) => !representedSourceCapabilityIds.has(capabilityId),
  );

  if (missingCapabilityIds.length > 0) {
    throw new Error(
      `Candidate capability reconciliation failed for: ${missingCapabilityIds.join(
        ", ",
      )}`,
    );
  }

  /*
   * Repository acquisition consumes the same reconciled eligible identity set
   * as Candidate Profile persistence.
   */
  const repositoryEnrichment = await proposeRepositoryKnowledge({
    roleTitle: role.roleTitle,
    roleDescription: role.roleDescription,
    source: {
      assessmentId: role.assessmentId,
      roleAssessmentId,
      userId,
    },
    capabilities: reconciledCapabilities.map((capability) => ({
      name: capability.name,
      approvedCanonicalCompetencyId:
        capability.canonicalCompetencyId,
    })),
    client,
  });

  const profileResult = await query`
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

  await query`
    DELETE FROM candidate_profile_role_capabilities
    WHERE candidate_profile_role_id=${profileRoleId}
  `;

  await query`
    DELETE FROM candidate_profile_role_gaps
    WHERE candidate_profile_role_id=${profileRoleId}
  `;

  const representedProfileIdentities: string[] = [];

  /*
   * Persist reconciled Candidate Profile identities rather than raw assessment
   * capability rows.
   */
  for (const capability of reconciledCapabilities) {
    await query`
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
        ${capability.canonicalCompetencyId},
        ${capability.name},
        ${capability.confidence},
        ${capability.evidence},
        ${capability.sourceType},
        NOW()
      )
      ON CONFLICT (candidate_profile_role_id, capability_name)
      DO UPDATE SET
        competency_id=COALESCE(
          EXCLUDED.competency_id,
          candidate_profile_role_capabilities.competency_id
        ),
        confidence=GREATEST(
          candidate_profile_role_capabilities.confidence,
          EXCLUDED.confidence
        ),
        evidence=EXCLUDED.evidence,
        source_type=EXCLUDED.source_type,
        updated_at=NOW()
    `;

    representedProfileIdentities.push(capability.identity);

    /*
     * Legacy candidate_knowledge is retained for compatibility but is only
     * populated where BOTH role and capability identities were already
     * approved repository knowledge at assessment time.
     */
    if (originalCanonicalRoleId && capability.canonicalCompetencyId) {
      await query`
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
          ${capability.canonicalCompetencyId},
          ${capability.confidence},
          NOW()
        )
        ON CONFLICT (user_id, role_id, competency_id)
        DO UPDATE SET
          confidence=GREATEST(
            candidate_knowledge.confidence,
            EXCLUDED.confidence
          ),
          updated_at=NOW()
      `;
    }
  }

  /*
   * Gaps are not part of Candidate Profile capability identity reconciliation.
   * Preserve the existing gap behaviour.
   */
  for (const capability of role.capabilities) {
    if (capability.capabilityStatus !== "gap") {
      continue;
    }

    const name = finalCapabilityName(capability);
    const evidence = finalCapabilityEvidence(capability);

    await query`
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

  /*
   * Repository mappings describe the approved canonical identity represented
   * by each eligible source capability. Several source IDs may validly map to
   * the same competency ID.
   */
  const repositoryMappings = reconciledCapabilities.flatMap((capability) => {
    if (!capability.canonicalCompetencyId) {
      return [];
    }

    return capability.sourceCapabilityIds.map((capabilityId) => ({
      capabilityId,
      competencyId: capability.canonicalCompetencyId as string,
    }));
  });

  return {
    profileRoleId,
    repositoryRoleId: repositoryEnrichment.repositoryRoleId,
    eligibleCapabilityIds,
    representedProfileIdentities,
    repositoryMappings,
  };
}