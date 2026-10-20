import { sql } from "@vercel/postgres";
import { stageCapability } from "../data/staging";
import { getCareerSql } from "../db/career-sql";
import { CareerIntelligenceError } from "../errors";

/** Candidate-authored proposal is not an assessed or approved capability. */
export async function addCandidateCapability({
  userId, roleAssessmentId, name, evidence,
}: { userId: string; roleAssessmentId: string; name: string; evidence: string }) {
  const title = name.trim();
  const statement = evidence.trim();
  if (!title || !statement || title.length > 500 || statement.length > 20_000) {
    throw new CareerIntelligenceError("Provide a capability name and your own supporting description.",
      { status: 400, code: "candidate_capability_input_invalid", expose: true });
  }
  const client = await sql.connect();
  const query = getCareerSql(client);
  try {
    await client.sql`BEGIN`;
    const role = await query`
      SELECT cra.id FROM career_role_assessments cra
      JOIN career_assessments ca ON ca.id=cra.assessment_id
      WHERE cra.id=${roleAssessmentId} AND ca.user_id=${userId}
        AND cra.lifecycle_status IN ('in_progress', 'review_ready')
      FOR UPDATE OF cra
    `;
    if (!role.rows.length) {
      throw new CareerIntelligenceError("This role is not available for changes.",
        { status: 409, code: "candidate_role_not_editable", expose: true });
    }
    const existing = await query`
      SELECT id FROM career_role_capabilities
      WHERE role_assessment_id=${roleAssessmentId}
        AND LOWER(TRIM(COALESCE(NULLIF(edited_competency_name, ''), proposed_competency_name)))=LOWER(${title})
      LIMIT 1
    `;
    if (existing.rows.length) {
      throw new CareerIntelligenceError("This capability already appears on the role. Edit it to add further evidence.",
        { status: 409, code: "candidate_capability_exists", expose: true });
    }
    const id = await stageCapability({
      roleAssessmentId, client, name: title, sourceType: "candidate_statement",
      sourceSection: "candidate_addition", evidence: statement,
      evidenceRelationshipType: "context", demonstrated: null,
      capabilityStatus: "signal", assessmentStatus: "proposed",
    });
    await client.sql`COMMIT`;
    return id;
  } catch (error) {
    try { await client.sql`ROLLBACK`; } catch { /* preserve original error */ }
    throw error;
  } finally {
    client.release();
  }
}
