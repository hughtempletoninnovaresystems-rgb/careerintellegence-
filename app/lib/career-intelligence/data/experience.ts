/**
 * Read-only Experience page projections, scoped to the signed-in user.
 * Timeline entries come from career_role_assessments: the current schema
 * does not contain a separate career experience table.
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

// Independent count subqueries prevent evidence relationships multiplying rows.
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
