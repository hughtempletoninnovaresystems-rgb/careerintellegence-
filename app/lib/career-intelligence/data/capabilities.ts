/**
 * Read-only capability queries for the Capabilities dashboard/detail and the
 * Experience/Knowledge relationship views. All records are user-scoped.
 */
import { sql } from '@vercel/postgres';
import { getAuthenticatedUserId } from '@/app/lib/career-intelligence/auth';
import { getCapabilityEvidence, type CapabilityEvidenceRow } from './evidence';

export type CapabilityRow = {
  id: string;
  name: string | null;
  demonstrated: boolean | null;
  capability_status: string | null;
  assessment_status: string | null;
  review_status: string | null;
  evidence_strength: number | null;
  role_count: number | string;
  evidence_count: number | string;
  roles: string | null;
};

export type CapabilityDetailRow = {
  id: string;
  display_name: string | null;
  canonical_name: string | null;
  canonical_competency_id: string | null;
  edited_evidence: string | null;
  evidence: string | null;
  review_status: string | null;
  demonstrated: boolean | null;
  assessment_status: string | null;
  ai_confidence: number | string | null;
};

export type CapabilityRoleRow = {
  id: string;
  proposed_role_title: string | null;
  organisation_name: string | null;
  from_date: string | null;
  to_date: string | null;
  to_date_precision: string | null;
};

export type CapabilityDetail = {
  capability: CapabilityDetailRow;
  roles: CapabilityRoleRow[];
  evidence: CapabilityEvidenceRow[];
  knowledge: string[];
};

export type LinkedCapability = {
  id: string;
  name: string;
  evidence: string | null;
  demonstrated: boolean | null;
  capability_status: string | null;
  assessment_status: string | null;
  review_status: string | null;
  evidence_count: number;
};

export async function getCapabilities(): Promise<CapabilityRow[]> {
  const userId = await getAuthenticatedUserId();
  const result = await sql`
    SELECT
      crc.id::text AS id,
      COALESCE(NULLIF(crc.edited_competency_name, ''), NULLIF(c.name, ''), NULLIF(crc.proposed_competency_name, '')) AS name,
      crc.demonstrated,
      crc.capability_status,
      crc.assessment_status,
      crc.review_status,
      crc.ai_confidence AS evidence_strength,
      COUNT(DISTINCT cra.id)::int AS role_count,
      COUNT(DISTINCT cel.evidence_id) FILTER (WHERE cel.is_current = TRUE)::int AS evidence_count,
      STRING_AGG(DISTINCT CONCAT(COALESCE(cra.proposed_role_title, 'Role not recorded'), ' — ', COALESCE(cra.organisation_name, 'Organisation not recorded')), '||') AS roles
    FROM career_role_capabilities crc
    JOIN career_role_assessments cra ON cra.id = crc.role_assessment_id
    JOIN career_assessments ca ON ca.id = cra.assessment_id
    LEFT JOIN competencies c ON c.id = crc.canonical_competency_id
    LEFT JOIN career_capability_evidence_links cel ON cel.role_capability_id = crc.id
    WHERE ca.user_id = ${userId}
    GROUP BY crc.id, c.name
    ORDER BY CASE WHEN crc.review_status IN ('accepted', 'edited') THEN 0 WHEN crc.demonstrated = TRUE THEN 1 ELSE 2 END,
             COALESCE(NULLIF(crc.edited_competency_name, ''), NULLIF(c.name, ''), NULLIF(crc.proposed_competency_name, '')) ASC
  `;
  return result.rows as CapabilityRow[];
}

export async function getCapabilityDetail(id: string): Promise<CapabilityDetail | null> {
  const userId = await getAuthenticatedUserId();
  const result = await sql`
    SELECT crc.*, COALESCE(NULLIF(crc.edited_competency_name, ''), NULLIF(c.name, ''), NULLIF(crc.proposed_competency_name, '')) AS display_name,
           c.name AS canonical_name
    FROM career_role_capabilities crc
    JOIN career_role_assessments cra ON cra.id = crc.role_assessment_id
    JOIN career_assessments ca ON ca.id = cra.assessment_id
    LEFT JOIN competencies c ON c.id = crc.canonical_competency_id
    WHERE crc.id::text = ${id} AND ca.user_id = ${userId}
    LIMIT 1
  `;
  const capability = result.rows[0] as CapabilityDetailRow | undefined;
  if (!capability) return null;

  const [roleResult, evidence, knowledgeResult] = await Promise.all([
    sql`
      SELECT cra.id::text AS id, cra.proposed_role_title, cra.organisation_name,
             cra.from_date::text AS from_date, cra.to_date::text AS to_date, cra.to_date_precision
      FROM career_role_assessments cra
      JOIN career_assessments ca ON ca.id = cra.assessment_id
      JOIN career_role_capabilities crc ON crc.role_assessment_id = cra.id
      WHERE crc.id::text = ${id} AND ca.user_id = ${userId}
      ORDER BY cra.sequence_no DESC, cra.created_at DESC
    `,
    getCapabilityEvidence(id),
    capability.canonical_competency_id
      ? sql`SELECT name FROM competencies WHERE id = ${capability.canonical_competency_id}`
      : Promise.resolve(null),
  ]);

  return {
    capability,
    roles: roleResult.rows as CapabilityRoleRow[],
    evidence,
    knowledge: knowledgeResult?.rows.map((row) => String(row.name)) || [],
  };
}

export async function getRoleCapabilities(roleId: string): Promise<LinkedCapability[]> {
  const userId = await getAuthenticatedUserId();
  const result = await sql`
    SELECT crc.id::text AS id,
      COALESCE(NULLIF(crc.edited_competency_name, ''), NULLIF(c.name, ''),
        NULLIF(crc.proposed_competency_name, ''), 'Unnamed capability') AS name,
      COALESCE(NULLIF(crc.edited_evidence, ''), crc.evidence) AS evidence,
      crc.demonstrated, crc.capability_status, crc.assessment_status, crc.review_status,
      (SELECT COUNT(DISTINCT cel.evidence_id)::int FROM career_capability_evidence_links cel
        WHERE cel.role_capability_id = crc.id AND cel.is_current = TRUE) AS evidence_count
    FROM career_role_capabilities crc
    JOIN career_role_assessments cra ON cra.id = crc.role_assessment_id
    JOIN career_assessments ca ON ca.id = cra.assessment_id
    LEFT JOIN competencies c ON c.id = crc.canonical_competency_id
    WHERE cra.id::text = ${roleId} AND ca.user_id = ${userId}
    ORDER BY crc.created_at, crc.id
  `;
  return result.rows as LinkedCapability[];
}

export async function getKnowledgeCapabilities(id: string): Promise<LinkedCapability[]> {
  const userId = await getAuthenticatedUserId();
  const result = await sql`
    SELECT crc.id::text AS id,
      COALESCE(NULLIF(crc.edited_competency_name, ''), NULLIF(c.name, ''),
        NULLIF(crc.proposed_competency_name, ''), 'Unnamed capability') AS name,
      COALESCE(NULLIF(crc.edited_evidence, ''), crc.evidence) AS evidence,
      crc.demonstrated, crc.capability_status, crc.assessment_status, crc.review_status,
      (SELECT COUNT(DISTINCT cel.evidence_id)::int FROM career_capability_evidence_links cel
        WHERE cel.role_capability_id = crc.id AND cel.is_current = TRUE) AS evidence_count
    FROM career_role_capabilities crc
    JOIN career_role_assessments cra ON cra.id = crc.role_assessment_id
    JOIN career_assessments ca ON ca.id = cra.assessment_id
    LEFT JOIN competencies c ON c.id = crc.canonical_competency_id
    WHERE crc.canonical_competency_id::text = ${id} AND ca.user_id = ${userId}
    ORDER BY crc.created_at DESC, crc.id
  `;
  return result.rows as LinkedCapability[];
}
