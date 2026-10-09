import { sql } from "@vercel/postgres";
import { CareerIntelligenceError } from "../errors";
import { findCompetency, verifyRoleOwnership } from "../data/repository";
import { getCareerSql } from "../db/career-sql";
import { recordSuccessGateAtomic } from "../success-gates";
import type { ReviewStatus } from "../types";
import { hashCapabilityReviewContent } from "./provenance";

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
  if (reviewStatus === "edited" && !editedEvidence?.trim()) {
    throw new CareerIntelligenceError("Capability evidence is required when editing.", {
      status: 400,
      code: "edited_capability_evidence_required",
      expose: true,
    });
  }

  const editedCanonical =
    reviewStatus === "edited" && editedCompetencyName?.trim()
      ? await findCompetency(editedCompetencyName.trim())
      : null;
  const client = await sql.connect();
  const query = getCareerSql(client);

  try {
    await client.sql`BEGIN`;

    // Recheck ownership inside the transaction and serialise review against edits.
    const owned = await query`
      SELECT cra.assessment_id
      FROM career_role_assessments cra
      JOIN career_assessments ca ON ca.id=cra.assessment_id
      WHERE cra.id=${roleAssessmentId}
        AND ca.user_id=${userId}
      FOR UPDATE OF cra
    `;
    if (!owned.rows.length || String(owned.rows[0].assessment_id) !== assessmentId) {
      throw new CareerIntelligenceError("Role assessment is not available to this user.", {
        status: 404,
        code: "role_assessment_not_found",
        expose: true,
      });
    }

    const currentResult = await query`
      SELECT id, canonical_competency_id, edited_competency_name, edited_evidence
      FROM career_role_capabilities
      WHERE id=${capabilityId}
        AND role_assessment_id=${roleAssessmentId}
      FOR UPDATE
    `;
    if (!currentResult.rows.length) {
      throw new CareerIntelligenceError("Capability not found.", {
        status: 404,
        code: "capability_not_found",
        expose: true,
      });
    }

    const current = currentResult.rows[0];
    // Preserve a previously reassessed candidate edit when the next action is
    // Accept/Reject. Read it from the locked row to avoid overwriting a concurrent edit.
    const targetEditedName =
      reviewStatus === "edited"
        ? editedCompetencyName?.trim() || null
        : current.edited_competency_name == null
          ? null
          : String(current.edited_competency_name);
    const targetEditedEvidence =
      reviewStatus === "edited"
        ? editedEvidence?.trim() || null
        : current.edited_evidence == null
          ? null
          : String(current.edited_evidence);
    const currentCanonicalId = current.canonical_competency_id
      ? String(current.canonical_competency_id)
      : null;
    const targetCanonicalId =
      reviewStatus === "edited"
        ? editedCanonical
          ? String(editedCanonical.id)
          : null
        : currentCanonicalId;
    const contentWillChange =
      (current.edited_competency_name ?? null) !== targetEditedName ||
      (current.edited_evidence ?? null) !== targetEditedEvidence ||
      currentCanonicalId !== targetCanonicalId;

    const result = await query`
      UPDATE career_role_capabilities
      SET
        review_status=${reviewStatus},
        edited_competency_name=${targetEditedName},
        edited_evidence=${targetEditedEvidence},
        canonical_competency_id=${targetCanonicalId},
        reviewed_revision_no=CASE
          WHEN ${contentWillChange} THEN revision_no + 1
          ELSE revision_no
        END,
        updated_at=NOW()
      WHERE id=${capabilityId}
        AND role_assessment_id=${roleAssessmentId}
      RETURNING
        id,
        revision_no,
        reviewed_revision_no,
        review_status,
        canonical_competency_id,
        proposed_competency_name,
        edited_competency_name,
        evidence,
        edited_evidence,
        demonstrated,
        capability_status,
        assessment_status
    `;

    if (!result.rows.length) {
      throw new CareerIntelligenceError("Capability not found.", {
        status: 404,
        code: "capability_not_found",
        expose: true,
      });
    }

    const reviewed = result.rows[0];
    if (Number(reviewed.reviewed_revision_no) !== Number(reviewed.revision_no)) {
      throw new CareerIntelligenceError(
        "The capability changed while it was being reviewed. Please reload and review it again.",
        { status: 409, code: "capability_review_revision_conflict", expose: true },
      );
    }

    const evidenceResult = await query`
      SELECT evidence_id
      FROM career_capability_evidence_links
      WHERE role_capability_id=${capabilityId}
        AND is_current=TRUE
        AND relationship_type='supporting'
      ORDER BY evidence_id
    `;
    const sourceEvidenceIds = evidenceResult.rows.map((row) => String(row.evidence_id));
    const effectiveName = String(
      reviewed.edited_competency_name || reviewed.proposed_competency_name || "",
    ).trim();
    const effectiveEvidence = String(
      reviewed.edited_evidence || reviewed.evidence || "",
    ).trim() || null;
    const contentHash = hashCapabilityReviewContent({
      canonicalCompetencyId: reviewed.canonical_competency_id
        ? String(reviewed.canonical_competency_id)
        : null,
      proposedName: String(reviewed.proposed_competency_name || ""),
      editedName: reviewed.edited_competency_name
        ? String(reviewed.edited_competency_name)
        : null,
      evidence: reviewed.evidence ? String(reviewed.evidence) : null,
      editedEvidence: reviewed.edited_evidence
        ? String(reviewed.edited_evidence)
        : null,
      demonstrated: reviewed.demonstrated == null ? null : Boolean(reviewed.demonstrated),
      capabilityStatus: reviewed.capability_status
        ? String(reviewed.capability_status)
        : null,
      assessmentStatus: reviewed.assessment_status
        ? String(reviewed.assessment_status)
        : null,
      revisionNo: Number(reviewed.revision_no),
      supportingEvidenceIds: sourceEvidenceIds,
    });

    await query`
      INSERT INTO career_capability_review_snapshots (
        role_capability_id,
        revision_no,
        review_status,
        actor_user_id,
        content_hash,
        effective_name,
        effective_evidence,
        demonstrated,
        capability_status,
        assessment_status,
        canonical_competency_id,
        source_evidence_ids,
        metadata,
        created_at
      )
      VALUES (
        ${capabilityId},
        ${Number(reviewed.revision_no)},
        ${reviewStatus},
        ${userId},
        ${contentHash},
        ${effectiveName},
        ${effectiveEvidence},
        ${reviewed.demonstrated},
        ${reviewed.capability_status},
        ${reviewed.assessment_status},
        ${targetCanonicalId},
        ARRAY(
          SELECT evidence_id
          FROM career_capability_evidence_links
          WHERE role_capability_id=${capabilityId}
            AND is_current=TRUE
            AND relationship_type='supporting'
          ORDER BY evidence_id
        ),
        CAST(${JSON.stringify({
          operation: "candidate_capability_review",
          contentHashAlgorithm: "sha256",
          reviewedRevisionNo: Number(reviewed.revision_no),
        })} AS jsonb),
        NOW()
      )
    `;

    await recordSuccessGateAtomic(client, {
      assessmentId,
      roleAssessmentId,
      gateKey: "capability_review_completed",
      metadata: { capabilityId, reviewStatus, revisionNo: Number(reviewed.revision_no) },
    });

    const remaining = await query`
      SELECT COUNT(*)::int AS count
      FROM career_role_capabilities
      WHERE role_assessment_id=${roleAssessmentId}
        AND demonstrated=TRUE
        AND capability_status='demonstrated'
        AND (
          assessment_status <> 'assessed'
          OR assessment_status IS NULL
          OR review_status='proposed'
          OR reviewed_revision_no IS DISTINCT FROM revision_no
          OR (
            review_status IN ('accepted', 'edited')
            AND NOT EXISTS (
              SELECT 1
              FROM career_capability_evidence_links cel
              WHERE cel.role_capability_id=career_role_capabilities.id
                AND cel.is_current=TRUE
                AND cel.relationship_type='supporting'
            )
          )
        )
    `;

    if (Number(remaining.rows[0]?.count || 0) === 0) {
      await recordSuccessGateAtomic(client, {
        assessmentId,
        roleAssessmentId,
        gateKey: "all_demonstrated_capabilities_reviewed",
      });
    }

    await client.sql`COMMIT`;
    return { assessmentId, revisionNo: Number(reviewed.revision_no), contentHash };
  } catch (error) {
    try { await client.sql`ROLLBACK`; } catch { /* preserve original failure */ }
    throw error;
  } finally {
    client.release();
  }
}
