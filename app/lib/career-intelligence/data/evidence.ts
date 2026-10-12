/**
 * User-scoped evidence audit trail across Career Intelligence assessments,
 * persisted candidate knowledge, and promoted profile capabilities.
 * Neither evidence reviews nor assessment quality ratings are invented:
 * statuses are derived from recorded capability reviews and link currency.
 */
import { sql } from '@vercel/postgres';
import { getAuthenticatedUserId } from '@/app/lib/career-intelligence/auth';

export type EvidenceCapability = {
  id: string | null;
  name: string;
  role_id?: string | null;
  competency_id?: string | null;
  review_status: string | null;
  relationship_type: string | null;
  is_current: boolean;
  evidence_state: string | null;
};
export type EvidenceKnowledgeArea = { id: string; name: string };

export type EvidenceRecord = {
  id: string; // career-UUID, knowledge-UUID, or profile-UUID
  evidence_text: string;
  source_type: string;
  source_section: string | null;
  source_family: 'career' | 'knowledge' | 'profile';
  created_at: string;
  experience_id: string | null;
  experience_key: string;
  experience_label: string;
  organisation_name: string | null;
  capabilities: EvidenceCapability[];
  knowledge_areas: EvidenceKnowledgeArea[];
  relationship_type: string | null;
  status: 'reviewed' | 'linked' | 'superseded' | 'unlinked' | 'recorded' | 'profile';
  confidence: number | null;
  provenance: Record<string, unknown> | null;
  evaluation_status: string | null;
  evaluation_confidence: number | null;
};

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

const text = (v: unknown, fallback = ''): string => typeof v === 'string' && v.trim() ? v : fallback;
const items = <T>(value: unknown): T[] => Array.isArray(value) ? value as T[] : [];

export async function getEvidenceRecords(): Promise<EvidenceRecord[]> {
  const userId = await getAuthenticatedUserId();
  const [career, knowledge, profile] = await Promise.all([
    sql`
      SELECT ce.id::text AS id, ce.evidence_text, ce.source_type,
        ce.created_at::text AS created_at, ce.provenance,
        COALESCE(ce.role_assessment_id, linked_role.id)::text AS experience_id,
        COALESCE(cra.proposed_role_title, linked_role.proposed_role_title) AS proposed_role_title,
        COALESCE(cra.organisation_name, linked_role.organisation_name) AS organisation_name,
        answer.evaluation_status, answer.evaluation_confidence::float8,
        COALESCE((SELECT jsonb_agg(DISTINCT jsonb_build_object(
          'id', crc.id::text,
          'role_id', linked_role.id::text,
          'competency_id', crc.canonical_competency_id::text,
          'name', COALESCE(NULLIF(crc.edited_competency_name,''), NULLIF(c.name,''), crc.proposed_competency_name),
          'review_status', crc.review_status,
          'relationship_type', cel.relationship_type,
          'is_current', cel.is_current,
          'evidence_state', crc.evidence_state
        ))
          FROM career_capability_evidence_links cel
          JOIN career_role_capabilities crc ON crc.id = cel.role_capability_id
          JOIN career_role_assessments linked_role ON linked_role.id = crc.role_assessment_id
          JOIN career_assessments linked_assessment ON linked_assessment.id = linked_role.assessment_id
          LEFT JOIN competencies c ON c.id = crc.canonical_competency_id
          WHERE cel.evidence_id = ce.id AND linked_assessment.user_id = ${userId}), '[]'::jsonb) AS capabilities,
        COALESCE((SELECT jsonb_agg(DISTINCT jsonb_build_object('id', c.id::text, 'name', c.name))
          FROM career_capability_evidence_links cel
          JOIN career_role_capabilities crc ON crc.id = cel.role_capability_id
          JOIN career_role_assessments linked_role ON linked_role.id = crc.role_assessment_id
          JOIN career_assessments linked_assessment ON linked_assessment.id = linked_role.assessment_id
          JOIN competencies c ON c.id = crc.canonical_competency_id
          WHERE cel.evidence_id = ce.id AND linked_assessment.user_id = ${userId}), '[]'::jsonb) AS knowledge_areas
      FROM career_capability_evidence ce
      JOIN career_assessments ca ON ca.id = ce.assessment_id
      LEFT JOIN career_role_assessments cra ON cra.id = ce.role_assessment_id AND cra.assessment_id = ca.id
      LEFT JOIN LATERAL (
        SELECT linked_cra.id, linked_cra.proposed_role_title, linked_cra.organisation_name
        FROM career_capability_evidence_links cel
        JOIN career_role_capabilities crc ON crc.id = cel.role_capability_id
        JOIN career_role_assessments linked_cra ON linked_cra.id = crc.role_assessment_id
        WHERE cel.evidence_id = ce.id AND linked_cra.assessment_id = ca.id
        ORDER BY cel.is_current DESC, linked_cra.created_at DESC LIMIT 1
      ) linked_role ON TRUE
      LEFT JOIN career_role_answers answer ON answer.id = ce.source_answer_id
      WHERE ca.user_id = ${userId}
    `,
    sql`
      SELECT ke.id::text AS id, ke.evidence AS evidence_text, ke.source_type,
        ke.source_section, ke.confidence::float8, ke.created_at::text AS created_at,
        ck.role_id::text AS canonical_role_id, c.id::text AS competency_id, c.name AS competency_name,
        COALESCE(NULLIF(r.job_title, ''), r.name) AS role_title,
        linked_role.id::text AS experience_id
      FROM knowledge_evidence ke
      JOIN candidate_knowledge ck ON ck.id = ke.candidate_knowledge_id
      JOIN competencies c ON c.id = ck.competency_id
      JOIN roles r ON r.id = ck.role_id
      LEFT JOIN LATERAL (
        SELECT cra.id FROM career_role_assessments cra
        JOIN career_assessments ca ON ca.id = cra.assessment_id
        WHERE ca.user_id = ${userId} AND cra.canonical_role_id = ck.role_id
        ORDER BY cra.created_at DESC LIMIT 1
      ) linked_role ON TRUE
      WHERE ck.user_id = ${userId}
    `,
    sql`
      SELECT prc.id::text AS id, prc.evidence AS evidence_text, prc.source_type,
        prc.confidence::float8, prc.created_at::text AS created_at,
        prc.capability_name, prc.competency_id::text AS competency_id,
        c.name AS competency_name, pr.id::text AS profile_role_id,
        pr.role_title, pr.organisation_name,
        linked_role.id::text AS experience_id
      FROM candidate_profile_role_capabilities prc
      JOIN candidate_profile_roles pr ON pr.id = prc.candidate_profile_role_id
      LEFT JOIN competencies c ON c.id = prc.competency_id
      LEFT JOIN career_role_assessments linked_role ON linked_role.id = pr.source_role_assessment_id
      LEFT JOIN career_assessments linked_assessment ON linked_assessment.id = linked_role.assessment_id
      WHERE pr.user_id = ${userId} AND prc.active = TRUE
        AND NULLIF(TRIM(prc.evidence), '') IS NOT NULL
        AND (linked_role.id IS NULL OR linked_assessment.user_id = ${userId})
    `,
  ]);

  const careerRecords: EvidenceRecord[] = career.rows.map((row) => {
    const capabilities = items<EvidenceCapability>(row.capabilities);
    const current = capabilities.filter((capability) => capability.is_current);
    const status = current.some((capability) => ['accepted', 'edited'].includes(capability.review_status || ''))
      ? 'reviewed' : current.length ? 'linked' : capabilities.length ? 'superseded' : 'unlinked';
    const roleName = text(row.proposed_role_title, 'Career assessment');
    const organisation = text(row.organisation_name);
    return {
      id: `career-${row.id}`, evidence_text: text(row.evidence_text),
      source_type: text(row.source_type, 'Not recorded'), source_section: null,
      source_family: 'career', created_at: text(row.created_at),
      experience_id: row.experience_id ? String(row.experience_id) : null,
      experience_key: row.experience_id ? `assessment:${row.experience_id}` : 'assessment:unassigned',
      experience_label: organisation ? `${roleName} — ${organisation}` : roleName,
      organisation_name: row.organisation_name ?? null, capabilities,
      knowledge_areas: items<EvidenceKnowledgeArea>(row.knowledge_areas),
      relationship_type: current[0]?.relationship_type || capabilities[0]?.relationship_type || null,
      status, confidence: null,
      provenance: row.provenance && typeof row.provenance === 'object' && !Array.isArray(row.provenance) ? row.provenance : null,
      evaluation_status: row.evaluation_status ?? null,
      evaluation_confidence: row.evaluation_confidence == null ? null : Number(row.evaluation_confidence),
    };
  });

  const knowledgeRecords: EvidenceRecord[] = knowledge.rows.map((row) => ({
    id: `knowledge-${row.id}`, evidence_text: text(row.evidence_text),
    source_type: text(row.source_type, 'Knowledge record'), source_section: row.source_section ?? null,
    source_family: 'knowledge', created_at: text(row.created_at),
    experience_id: row.experience_id ? String(row.experience_id) : null,
    experience_key: row.experience_id ? `assessment:${row.experience_id}` : `role:${row.canonical_role_id}`,
    experience_label: text(row.role_title, 'Recorded role'), organisation_name: null,
    capabilities: [], knowledge_areas: [{ id: String(row.competency_id), name: String(row.competency_name) }],
    relationship_type: 'supporting', status: 'recorded',
    confidence: row.confidence == null ? null : Number(row.confidence),
    provenance: null, evaluation_status: null, evaluation_confidence: null,
  }));

  const profileRecords: EvidenceRecord[] = profile.rows.map((row) => ({
    id: `profile-${row.id}`, evidence_text: text(row.evidence_text),
    source_type: text(row.source_type, 'Profile capability'), source_section: null,
    source_family: 'profile', created_at: text(row.created_at),
    experience_id: row.experience_id ? String(row.experience_id) : null,
    experience_key: row.experience_id ? `assessment:${row.experience_id}` : `profile:${row.profile_role_id}`,
    experience_label: [text(row.role_title, 'Profile role'), text(row.organisation_name)].filter(Boolean).join(' — '),
    organisation_name: row.organisation_name ?? null,
    capabilities: [{ id: null, name: text(row.capability_name, 'Profile capability'), role_id: row.experience_id || null, competency_id: row.competency_id || null, review_status: null,
      relationship_type: 'supporting', is_current: true, evidence_state: null }],
    knowledge_areas: row.competency_id && row.competency_name
      ? [{ id: String(row.competency_id), name: String(row.competency_name) }] : [],
    relationship_type: 'supporting', status: 'profile',
    confidence: row.confidence == null ? null : Number(row.confidence),
    provenance: null, evaluation_status: null, evaluation_confidence: null,
  }));

  return [...careerRecords, ...knowledgeRecords, ...profileRecords]
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Unknown or other users' IDs are not resolved: ownership is established by getEvidenceRecords. */
export async function getEvidenceRecord(id: string): Promise<EvidenceRecord | null> {
  if (!/^(career|knowledge|profile)-[0-9a-fA-F-]{36}$/.test(id)) return null;
  const records = await getEvidenceRecords();
  return records.find((item) => item.id === id) || null;
}

export async function getProfileEvidenceCount(): Promise<number> {
  const userId = await getAuthenticatedUserId();
  const result = await sql`
    SELECT (
      (SELECT COUNT(*) FROM career_capability_evidence ce
        JOIN career_assessments ca ON ca.id = ce.assessment_id WHERE ca.user_id = ${userId})
      + (SELECT COUNT(*) FROM knowledge_evidence ke
        JOIN candidate_knowledge ck ON ck.id = ke.candidate_knowledge_id WHERE ck.user_id = ${userId})
      + (SELECT COUNT(*) FROM candidate_profile_role_capabilities prc
        JOIN candidate_profile_roles pr ON pr.id = prc.candidate_profile_role_id
        WHERE pr.user_id = ${userId} AND prc.active = TRUE
          AND NULLIF(TRIM(prc.evidence),'') IS NOT NULL)
    )::int AS evidence_count
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
    JOIN career_capability_evidence ce ON ce.id = cel.evidence_id AND ce.assessment_id = ca.id
    WHERE crc.id::text = ${capabilityId} AND ca.user_id = ${userId}
      AND cel.is_current = TRUE
    ORDER BY cel.relationship_type, cel.evidence_id
  `;
  return result.rows as CapabilityEvidenceRow[];
}

export async function getRoleEvidence(roleId: string): Promise<LinkedEvidence[]> {
  const records = await getEvidenceRecords();
  return records.filter((item) => item.experience_id === roleId).map((item) => ({
    id: item.id, evidence_text: item.evidence_text, source_type: item.source_type,
    relationship_type: item.relationship_type, role_id: roleId,
  }));
}

export async function getKnowledgeEvidence(knowledgeId: string): Promise<LinkedEvidence[]> {
  const records = await getEvidenceRecords();
  return records.filter((item) => item.source_family === 'career'
    ? item.capabilities.some((capability) => capability.is_current && capability.competency_id === knowledgeId)
    : item.knowledge_areas.some((area) => area.id === knowledgeId))
    .map((item) => ({
      id: item.id, evidence_text: item.evidence_text, source_type: item.source_type,
      relationship_type: item.relationship_type, role_id: item.experience_id,
    }));
}
