/**
 * Read-only career profile projections for the Experience and Knowledge pages.
 * All queries are scoped to the signed-in user's career_assessments.
 *
 * The current schema has no dedicated knowledge-area/domain or CareerExperience
 * model. Knowledge is represented here by canonical competencies referenced
 * by assessed role capabilities; experience timeline entries are role records.
 */
import { sql } from '@vercel/postgres';
import { getAuthenticatedUserId } from '@/app/lib/career-intelligence/auth';

export type ExperienceItem = {
  id: string;
  proposed_role_title: string | null;
  organisation_name: string | null;
  role_description: string | null;
  from_date: string | null;
  to_date: string | null;
  to_date_precision: string | null;
  lifecycle_status: string | null;
  capability_count: number;
  knowledge_count: number;
  evidence_count: number;
  needs_attention_count: number;
  confirmed_count: number;
};

export type KnowledgeItem = {
  id: string;
  name: string;
  description: string | null;
  capability_count: number;
  experience_count: number;
  evidence_count: number;
  experience_ids: string[];
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

export type LinkedEvidence = {
  id: string;
  evidence_text: string | null;
  source_type: string | null;
  relationship_type: string | null;
  role_id: string | null;
};

// Keeping count subqueries in SQL avoids multiplying rows when a capability
// has both multiple evidence records and multiple other relationships.
export async function getExperiences(): Promise<ExperienceItem[]> {
  const userId = await getAuthenticatedUserId();
  const result = await sql`
    SELECT cra.id::text AS id, cra.proposed_role_title, cra.organisation_name,
      cra.role_description, cra.from_date::text AS from_date,
      cra.to_date::text AS to_date, cra.to_date_precision, cra.lifecycle_status,
      (SELECT COUNT(*)::int FROM career_role_capabilities crc
        WHERE crc.role_assessment_id = cra.id) AS capability_count,
      (SELECT COUNT(DISTINCT crc.canonical_competency_id)::int
        FROM career_role_capabilities crc
        WHERE crc.role_assessment_id = cra.id AND crc.canonical_competency_id IS NOT NULL) AS knowledge_count,
      (SELECT COUNT(DISTINCT cel.evidence_id)::int
        FROM career_role_capabilities crc
        JOIN career_capability_evidence_links cel ON cel.role_capability_id = crc.id
        WHERE crc.role_assessment_id = cra.id AND cel.is_current = TRUE) AS evidence_count,
      (SELECT COUNT(*)::int FROM career_role_capabilities crc
        WHERE crc.role_assessment_id = cra.id
          AND (crc.capability_status = 'needs_clarification'
            OR crc.assessment_status = 'needs_clarification'
            OR crc.demonstrated IS NULL)) AS needs_attention_count,
      (SELECT COUNT(*)::int FROM career_role_capabilities crc
        WHERE crc.role_assessment_id = cra.id AND crc.review_status IN ('accepted', 'edited')) AS confirmed_count
    FROM career_role_assessments cra
    JOIN career_assessments ca ON ca.id = cra.assessment_id
    WHERE ca.user_id = ${userId}
    ORDER BY cra.from_date DESC NULLS LAST, cra.sequence_no DESC, cra.created_at DESC
  `;
  return result.rows as ExperienceItem[];
}

export async function getExperience(id: string): Promise<ExperienceItem | null> {
  const roles = await getExperiences();
  return roles.find((role) => role.id === id) || null;
}

export async function getKnowledgeAreas(): Promise<KnowledgeItem[]> {
  const userId = await getAuthenticatedUserId();
  const result = await sql`
    SELECT c.id::text AS id, c.name, c.description,
      COUNT(DISTINCT crc.id)::int AS capability_count,
      COUNT(DISTINCT cra.id)::int AS experience_count,
      COUNT(DISTINCT cel.evidence_id) FILTER (WHERE cel.is_current = TRUE)::int AS evidence_count,
      ARRAY_AGG(DISTINCT cra.id::text) AS experience_ids
    FROM competencies c
    JOIN career_role_capabilities crc ON crc.canonical_competency_id = c.id
    JOIN career_role_assessments cra ON cra.id = crc.role_assessment_id
    JOIN career_assessments ca ON ca.id = cra.assessment_id
    LEFT JOIN career_capability_evidence_links cel ON cel.role_capability_id = crc.id
    WHERE ca.user_id = ${userId}
    GROUP BY c.id, c.name, c.description
    ORDER BY c.name ASC
  `;
  return result.rows.map((row) => ({
    ...row,
    experience_ids: (row.experience_ids || []).map(String),
  })) as KnowledgeItem[];
}

export async function getKnowledgeArea(id: string): Promise<KnowledgeItem | null> {
  const areas = await getKnowledgeAreas();
  return areas.find((area) => area.id === id) || null;
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

export async function getRoleKnowledge(roleId: string): Promise<KnowledgeItem[]> {
  const areas = await getKnowledgeAreas();
  return areas.filter((area) => area.experience_ids.includes(roleId));
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
    WHERE cra.id::text = ${roleId} AND ca.user_id = ${userId} AND cel.is_current = TRUE
    ORDER BY ce.id::text, cel.relationship_type
  `;
  return result.rows as LinkedEvidence[];
}

export async function getKnowledgeEvidence(id: string): Promise<LinkedEvidence[]> {
  const userId = await getAuthenticatedUserId();
  const result = await sql`
    SELECT DISTINCT ce.id::text AS id, ce.evidence_text, ce.source_type,
      cel.relationship_type, cra.id::text AS role_id
    FROM career_capability_evidence_links cel
    JOIN career_capability_evidence ce ON ce.id = cel.evidence_id
    JOIN career_role_capabilities crc ON crc.id = cel.role_capability_id
    JOIN career_role_assessments cra ON cra.id = crc.role_assessment_id
    JOIN career_assessments ca ON ca.id = cra.assessment_id
    WHERE crc.canonical_competency_id::text = ${id}
      AND ca.user_id = ${userId} AND cel.is_current = TRUE
    ORDER BY ce.id::text, cel.relationship_type
  `;
  return result.rows as LinkedEvidence[];
}

export function displayDate(value: string | null, precision?: string | null) {
  if (precision === 'ongoing') return 'Present';
  if (!value) return 'Date not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

export function experienceDateRange(role: ExperienceItem) {
  return `${displayDate(role.from_date)} – ${displayDate(role.to_date, role.to_date_precision)}`;
}

export function needsEvidence(item: LinkedCapability) {
  return item.demonstrated == null || item.capability_status === 'needs_clarification' || item.assessment_status === 'needs_clarification';
}

// Display-only grouping derived from the names in this user's profile. There
// is no persisted domain taxonomy in the supplied database schema.
export function knowledgeDomain(name: string): string {
  if (/change|transformation|organisation|organiz|operating model|culture|adoption/i.test(name)) return 'Transformation & Change';
  if (/programme|program |project|delivery|risk|governance|benefit|portfolio|assurance|planning/i.test(name)) return 'Programme & Delivery';
  if (/leadership|stakeholder|people|team|communication|coaching|talent|management/i.test(name)) return 'Leadership & People';
  if (/technolog|digital|data|system|technical|method|tool|architecture|engineering/i.test(name)) return 'Technology & Methods';
  return 'Other knowledge';
}
