/**
 * Read-only evidence projections used by Profile, Capabilities, Experience,
 * and Knowledge. Every query is scoped to the signed-in user's assessments.
 */
import { sql } from '@vercel/postgres';
import { getAuthenticatedUserId } from '@/app/lib/career-intelligence/auth';

export type LinkedEvidence = {
  id: string;
  evidence_text: string | null;
  source_type: string | null;
  relationship_type: string | null;
  role_id: string | null;
};

export type CapabilityEvidenceRow = {
  evidence_id: string;
  evidence_text: string | null;
  relationship_type: string | null;
  source_type: string | null;
};

export async function getProfileEvidenceCount(): Promise<number> {
  const userId = await getAuthenticatedUserId();
  const result = await sql`
    SELECT COUNT(DISTINCT ccel.evidence_id)::int AS evidence_count
    FROM career_capability_evidence_links ccel
    JOIN career_role_capabilities crc ON crc.id = ccel.role_capability_id
    JOIN career_role_assessments cra ON cra.id = crc.role_assessment_id
    JOIN career_assessments ca ON ca.id = cra.assessment_id
    WHERE ca.user_id = ${userId} AND ccel.is_current = TRUE
  `;
  return Number(result.rows[0]?.evidence_count || 0);
}

export async function getCapabilityEvidence(capabilityId: string): Promise<CapabilityEvidenceRow[]> {
  const userId = await getAuthenticatedUserId();
  const result = await sql`
    SELECT cel.evidence_id::text AS evidence_id, ce.evidence_text,
      cel.relationship_type, ce.source_type
    FROM career_capability_evidence_links cel
    JOIN career_role_capabilities crc ON crc.id = cel.role_capability_id
    JOIN career_role_assessments cra ON cra.id = crc.role_assessment_id
    JOIN career_assessments ca ON ca.id = cra.assessment_id
    LEFT JOIN career_capability_evidence ce ON ce.id = cel.evidence_id
    WHERE crc.id::text = ${capabilityId} AND ca.user_id = ${userId}
      AND cel.is_current = TRUE
    ORDER BY cel.relationship_type, cel.evidence_id
  `;
  return result.rows as CapabilityEvidenceRow[];
}

export async function getRoleEvidence(roleId: string): Promise<LinkedEvidence[]> {
  const userId = await getAuthenticatedUserId();
  const result = await sql`
    SELECT DISTINCT ce.id::text AS id, ce.evidence_text, ce.source_type,
      cel.relationship_type, cra.id::text AS role_id
    FROM career_capability_evidence_links cel
    JOIN career_capability_evidence ce ON ce.id = cel.evidence_id
    JOIN career_role_capabilities crc ON crc.id = cel.role_capability_id
    JOIN career_role_assessments cra ON cra.id = crc.role_assessment_id
    JOIN career_assessments ca ON ca.id = cra.assessment_id
    WHERE cra.id::text = ${roleId} AND ca.user_id = ${userId}
      AND cel.is_current = TRUE
    ORDER BY ce.id::text, cel.relationship_type
  `;
  return result.rows as LinkedEvidence[];
}

export async function getKnowledgeEvidence(knowledgeId: string): Promise<LinkedEvidence[]> {
  const userId = await getAuthenticatedUserId();
  const result = await sql`
    SELECT DISTINCT ce.id::text AS id, ce.evidence_text, ce.source_type,
      cel.relationship_type, cra.id::text AS role_id
    FROM career_capability_evidence_links cel
    JOIN career_capability_evidence ce ON ce.id = cel.evidence_id
    JOIN career_role_capabilities crc ON crc.id = cel.role_capability_id
    JOIN career_role_assessments cra ON cra.id = crc.role_assessment_id
    JOIN career_assessments ca ON ca.id = cra.assessment_id
    WHERE crc.canonical_competency_id::text = ${knowledgeId}
      AND ca.user_id = ${userId} AND cel.is_current = TRUE
    ORDER BY ce.id::text, cel.relationship_type
  `;
  return result.rows as LinkedEvidence[];
}
