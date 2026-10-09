import { sql } from "@vercel/postgres";
import type { CareerQueryClient } from "../data/query-client";
import { getCareerSql } from "../db/career-sql";
export { hashCapabilityReviewContent } from "./review-hash";

export type CapabilityEvidenceRelationship =
  | "supporting"
  | "contradictory"
  | "currency"
  | "context";

export type RecordCapabilityEvidenceInput = {
  roleAssessmentId: string;
  roleCapabilityId: string;
  sourceType: string;
  evidenceText: string;
  sourceQuestionId?: string | null;
  sourceAnswerId?: string | null;
  relationshipType?: CapabilityEvidenceRelationship;
  provenance?: Record<string, unknown>;
  client?: CareerQueryClient;
  supersedeCurrent?: boolean;
};

/**
 * Persist a real source record and connect it to one capability revision.
 * Current links are projections; superseded rows remain available for audit.
 */
export async function recordCapabilityEvidence({
  roleAssessmentId,
  roleCapabilityId,
  sourceType,
  evidenceText,
  sourceQuestionId = null,
  sourceAnswerId = null,
  relationshipType = "supporting",
  provenance = {},
  client,
  supersedeCurrent = true,
}: RecordCapabilityEvidenceInput): Promise<string | null> {
  const text = evidenceText.trim();
  if (!text) return null;

  if (!client) {
    const transactionClient = await sql.connect();
    try {
      await transactionClient.sql`BEGIN`;
      const evidenceId = await recordCapabilityEvidence({
        roleAssessmentId,
        roleCapabilityId,
        sourceType,
        evidenceText: text,
        sourceQuestionId,
        sourceAnswerId,
        relationshipType,
        provenance,
        client: transactionClient,
        supersedeCurrent,
      });
      await transactionClient.sql`COMMIT`;
      return evidenceId;
    } catch (error) {
      try { await transactionClient.sql`ROLLBACK`; } catch { /* preserve original failure */ }
      throw error;
    } finally {
      transactionClient.release();
    }
  }

  const query = getCareerSql(client);
  const capability = await query`
    SELECT cra.assessment_id, crc.revision_no
    FROM career_role_capabilities crc
    JOIN career_role_assessments cra
      ON cra.id=crc.role_assessment_id
    WHERE crc.id=${roleCapabilityId}
      AND crc.role_assessment_id=${roleAssessmentId}
    LIMIT 1
    FOR UPDATE OF crc
  `;

  if (!capability.rows.length) {
    throw new Error("Cannot record evidence for a capability outside this role assessment.");
  }

  const assessmentId = String(capability.rows[0].assessment_id);
  const evidence = await query`
    INSERT INTO career_capability_evidence (
      assessment_id,
      role_assessment_id,
      source_question_id,
      source_answer_id,
      source_type,
      evidence_text,
      provenance,
      created_at
    )
    VALUES (
      ${assessmentId},
      ${roleAssessmentId},
      ${sourceQuestionId},
      ${sourceAnswerId},
      ${sourceType},
      ${text},
      CAST(${JSON.stringify({
        locatorAvailable: Boolean(sourceQuestionId || sourceAnswerId),
        ...provenance,
      })} AS jsonb),
      NOW()
    )
    RETURNING id
  `;

  const evidenceId = evidence.rows[0]?.id
    ? String(evidence.rows[0].id)
    : null;
  if (!evidenceId) {
    throw new Error("The capability evidence record was not persisted.");
  }

  if (supersedeCurrent) {
    await query`
      UPDATE career_capability_evidence_links
      SET
        is_current=FALSE,
        superseded_at=NOW(),
        superseded_by_evidence_id=${evidenceId}
      WHERE role_capability_id=${roleCapabilityId}
        AND is_current=TRUE
    `;
  }

  // A change in the evidence relationship changes what the human reviewed.
  // Advance the revision and require a fresh review even when the capability's
  // visible text itself did not change.
  const revisionResult = await query`
    UPDATE career_role_capabilities
    SET
      revision_no=revision_no + 1,
      reviewed_revision_no=NULL,
      review_status='proposed',
      updated_at=NOW()
    WHERE id=${roleCapabilityId}
      AND role_assessment_id=${roleAssessmentId}
    RETURNING revision_no
  `;
  const revisionNo = Number(revisionResult.rows[0]?.revision_no || 0);
  if (revisionNo < 1) {
    throw new Error("The capability evidence revision could not be advanced.");
  }

  await query`
    INSERT INTO career_capability_evidence_links (
      role_capability_id,
      evidence_id,
      relationship_type,
      is_current,
      capability_revision,
      created_at
    )
    VALUES (
      ${roleCapabilityId},
      ${evidenceId},
      ${relationshipType},
      TRUE,
      ${revisionNo},
      NOW()
    )
  `;

  return evidenceId;
}
