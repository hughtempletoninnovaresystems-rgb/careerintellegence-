/**
 * Knowledge is read from the user's persisted candidate_knowledge records,
 * supplemented by competencies explicitly linked to their assessed and
 * promoted profile capabilities. A competency is not a 'knowledge domain':
 * domain groupings are purely presentational until a taxonomy is persisted.
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
  recorded_role_names: string[];
  knowledge_record_count: number;
  confidence: number | null;
  profile_capability_count: number;
};

export type ProfileKnowledgeCapability = {
  id: string;
  name: string;
  evidence: string | null;
  role_title: string;
  organisation_name: string;
};

export async function getKnowledgeAreas(): Promise<KnowledgeItem[]> {
  const userId = await getAuthenticatedUserId();
  // Independent correlated projections avoid multiplication across three
  // different evidence sources. In particular, candidate_knowledge is a
  // first-class source even if no career assessment has been created.
  const result = await sql`
    WITH owned_competencies AS (
      SELECT ck.competency_id AS id FROM candidate_knowledge ck WHERE ck.user_id = ${userId}
      UNION
      SELECT crc.canonical_competency_id AS id
      FROM career_role_capabilities crc
      JOIN career_role_assessments cra ON cra.id = crc.role_assessment_id
      JOIN career_assessments ca ON ca.id = cra.assessment_id
      WHERE ca.user_id = ${userId} AND crc.canonical_competency_id IS NOT NULL
        AND crc.review_status <> 'rejected'
      UNION
      SELECT prc.competency_id AS id
      FROM candidate_profile_role_capabilities prc
      JOIN candidate_profile_roles pr ON pr.id = prc.candidate_profile_role_id
      WHERE pr.user_id = ${userId} AND prc.active = TRUE AND prc.competency_id IS NOT NULL
    )
    SELECT c.id::text AS id, c.name, c.description,
      (SELECT COUNT(*)::int FROM candidate_knowledge ck
        WHERE ck.user_id = ${userId} AND ck.competency_id = c.id) AS knowledge_record_count,
      (SELECT MAX(ck.confidence)::float8 FROM candidate_knowledge ck
        WHERE ck.user_id = ${userId} AND ck.competency_id = c.id) AS confidence,
      (SELECT COUNT(*)::int FROM candidate_profile_role_capabilities prc
        JOIN candidate_profile_roles pr ON pr.id = prc.candidate_profile_role_id
        WHERE pr.user_id = ${userId} AND prc.active = TRUE AND prc.competency_id = c.id) AS profile_capability_count,
      (SELECT COUNT(*)::int FROM career_role_capabilities crc
        JOIN career_role_assessments cra ON cra.id = crc.role_assessment_id
        JOIN career_assessments ca ON ca.id = cra.assessment_id
        WHERE ca.user_id = ${userId} AND crc.canonical_competency_id = c.id
          AND crc.review_status <> 'rejected') AS assessed_capability_count,
      (SELECT COUNT(DISTINCT cel.evidence_id)::int
        FROM career_capability_evidence_links cel
        JOIN career_role_capabilities crc ON crc.id = cel.role_capability_id
        JOIN career_role_assessments cra ON cra.id = crc.role_assessment_id
        JOIN career_assessments ca ON ca.id = cra.assessment_id
        WHERE ca.user_id = ${userId} AND crc.canonical_competency_id = c.id
          AND cel.is_current = TRUE) AS assessment_evidence_count,
      (SELECT COUNT(*)::int FROM knowledge_evidence ke
        JOIN candidate_knowledge ck ON ck.id = ke.candidate_knowledge_id
        WHERE ck.user_id = ${userId} AND ck.competency_id = c.id) AS direct_evidence_count,
      (SELECT COUNT(*)::int FROM candidate_profile_role_capabilities prc
        JOIN candidate_profile_roles pr ON pr.id = prc.candidate_profile_role_id
        WHERE pr.user_id = ${userId} AND prc.active = TRUE AND prc.competency_id = c.id
          AND NULLIF(TRIM(prc.evidence), '') IS NOT NULL) AS profile_evidence_count,
      ARRAY(
        SELECT DISTINCT role_link.role_id FROM (
          SELECT cra.id::text AS role_id
          FROM career_role_capabilities crc
          JOIN career_role_assessments cra ON cra.id = crc.role_assessment_id
          JOIN career_assessments ca ON ca.id = cra.assessment_id
          WHERE ca.user_id = ${userId} AND crc.canonical_competency_id = c.id
            AND crc.review_status <> 'rejected'
          UNION
          SELECT cra.id::text
          FROM candidate_knowledge ck
          JOIN career_role_assessments cra ON cra.canonical_role_id = ck.role_id
          JOIN career_assessments ca ON ca.id = cra.assessment_id
          WHERE ca.user_id = ${userId} AND ck.user_id = ${userId}
            AND ck.competency_id = c.id
          UNION
          SELECT pr.source_role_assessment_id::text
          FROM candidate_profile_role_capabilities prc
          JOIN candidate_profile_roles pr ON pr.id = prc.candidate_profile_role_id
          JOIN career_role_assessments cra ON cra.id = pr.source_role_assessment_id
          JOIN career_assessments ca ON ca.id = cra.assessment_id
          WHERE pr.user_id = ${userId} AND ca.user_id = ${userId}
            AND prc.active = TRUE AND prc.competency_id = c.id
        ) role_link WHERE role_link.role_id IS NOT NULL
      ) AS experience_ids,
      ARRAY(
        SELECT DISTINCT COALESCE(NULLIF(r.job_title, ''), r.name)
        FROM candidate_knowledge ck
        JOIN roles r ON r.id = ck.role_id
        WHERE ck.user_id = ${userId} AND ck.competency_id = c.id
        ORDER BY 1
      ) AS recorded_role_names
    FROM competencies c
    JOIN owned_competencies owned ON owned.id = c.id
    ORDER BY c.name ASC
  `;
  return result.rows.map((row) => {
    const experienceIds = (row.experience_ids || []).map(String);
    const recordedRoleNames = (row.recorded_role_names || []).map(String);
    return {
      id: String(row.id), name: String(row.name), description: row.description ?? null,
      knowledge_record_count: Number(row.knowledge_record_count || 0),
      confidence: row.confidence == null ? null : Number(row.confidence),
      profile_capability_count: Number(row.profile_capability_count || 0),
      capability_count: Number(row.assessed_capability_count || 0) + Number(row.profile_capability_count || 0),
      experience_count: Math.max(experienceIds.length, recordedRoleNames.length),
      evidence_count: Number(row.assessment_evidence_count || 0) + Number(row.direct_evidence_count || 0) + Number(row.profile_evidence_count || 0),
      experience_ids: experienceIds,
      recorded_role_names: recordedRoleNames,
    };
  });
}

export async function getKnowledgeArea(id: string): Promise<KnowledgeItem | null> {
  const areas = await getKnowledgeAreas();
  return areas.find((area) => area.id === id) || null;
}

export async function getRoleKnowledge(roleId: string): Promise<KnowledgeItem[]> {
  const areas = await getKnowledgeAreas();
  return areas.filter((area) => area.experience_ids.includes(roleId));
}

export async function getKnowledgeProfileCapabilities(id: string): Promise<ProfileKnowledgeCapability[]> {
  const userId = await getAuthenticatedUserId();
  const result = await sql`
    SELECT prc.id::text AS id, prc.capability_name AS name, prc.evidence,
           pr.role_title, pr.organisation_name
    FROM candidate_profile_role_capabilities prc
    JOIN candidate_profile_roles pr ON pr.id = prc.candidate_profile_role_id
    WHERE pr.user_id = ${userId} AND prc.active = TRUE AND prc.competency_id::text = ${id}
    ORDER BY pr.role_title, prc.capability_name
  `;
  return result.rows as ProfileKnowledgeCapability[];
}
