/**
 * Read-only Knowledge page projections, scoped to the signed-in user.
 * Knowledge areas are canonical competencies linked to role capabilities;
 * no persisted knowledge-domain taxonomy exists in the current schema.
 */
import { sql } from '@vercel/postgres';
import { getAuthenticatedUserId } from '@/app/lib/career-intelligence/auth';

export type KnowledgeItem = {
  id: string;
  name: string;
  description: string | null;
  capability_count: number;
  experience_count: number;
  evidence_count: number;
  experience_ids: string[];
};

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

export async function getRoleKnowledge(roleId: string): Promise<KnowledgeItem[]> {
  const areas = await getKnowledgeAreas();
  return areas.filter((area) => area.experience_ids.includes(roleId));
}
