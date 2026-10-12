/**
 * Profile dashboard projections. SQL stays in Career Intelligence's data
 * layer; the React page handles presentation only.
 */
import { sql } from '@vercel/postgres';
import { getAuthenticatedUserId } from '@/app/lib/career-intelligence/auth';
import { getProfileEvidenceCount } from './evidence';

export type ProfileRole = {
  id: string;
  organisation_name: string | null;
  proposed_role_title: string | null;
  from_date: string | null;
  to_date: string | null;
  to_date_precision: string | null;
  lifecycle_status: string | null;
  role_description: string | null;
  assessment_id: string;
};

export type CareerProfileData = {
  roles: ProfileRole[];
  capabilityCount: number;
  knowledgeCount: number;
  evidenceCount: number;
  evidencedCount: number;
  needsEvidenceCount: number;
  awaitingReviewCount: number;
};

export async function getCareerProfileData(): Promise<CareerProfileData> {
  const userId = await getAuthenticatedUserId();
  const [roleResult, counts, knowledge, evidenceCount] = await Promise.all([
    sql`
      SELECT cra.id, cra.assessment_id, cra.organisation_name, cra.proposed_role_title,
             cra.from_date::text AS from_date, cra.to_date::text AS to_date,
             cra.to_date_precision, cra.lifecycle_status, cra.role_description
      FROM career_role_assessments cra
      JOIN career_assessments ca ON ca.id = cra.assessment_id
      WHERE ca.user_id = ${userId}
      ORDER BY cra.sequence_no DESC, cra.created_at DESC
    `,
    sql`
      SELECT
        COUNT(*)::int AS capability_count,
        COUNT(*) FILTER (WHERE crc.demonstrated = TRUE AND crc.capability_status = 'demonstrated' AND crc.assessment_status = 'assessed')::int AS evidenced_count,
        COUNT(*) FILTER (WHERE crc.demonstrated IS NULL OR crc.capability_status IN ('signal', 'needs_clarification') OR crc.assessment_status = 'needs_clarification')::int AS needs_evidence_count,
        COUNT(*) FILTER (WHERE crc.demonstrated = TRUE AND (crc.review_status IS NULL OR crc.review_status NOT IN ('accepted', 'edited', 'rejected')))::int AS awaiting_review_count
      FROM career_role_capabilities crc
      JOIN career_role_assessments cra ON cra.id = crc.role_assessment_id
      JOIN career_assessments ca ON ca.id = cra.assessment_id
      WHERE ca.user_id = ${userId}
    `,
    sql`
      SELECT COUNT(DISTINCT c.id)::int AS knowledge_count
      FROM career_role_capabilities crc
      JOIN career_role_assessments cra ON cra.id = crc.role_assessment_id
      JOIN career_assessments ca ON ca.id = cra.assessment_id
      LEFT JOIN competencies c ON c.id = crc.canonical_competency_id
      WHERE ca.user_id = ${userId} AND c.id IS NOT NULL
    `,
    getProfileEvidenceCount(),
  ]);

  const row = counts.rows[0] || {};
  return {
    roles: roleResult.rows as ProfileRole[],
    capabilityCount: Number(row.capability_count || 0),
    knowledgeCount: Number(knowledge.rows[0]?.knowledge_count || 0),
    evidenceCount,
    evidencedCount: Number(row.evidenced_count || 0),
    needsEvidenceCount: Number(row.needs_evidence_count || 0),
    awaitingReviewCount: Number(row.awaiting_review_count || 0),
  };
}
