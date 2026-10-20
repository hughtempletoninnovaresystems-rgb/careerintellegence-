import { sql } from "@vercel/postgres";
import type { CareerQueryClient } from "./query-client";
import { getCareerSql } from "../db/career-sql";
import { ObjectAccessError } from "../errors";

export async function findCanonicalRole(roleTitle: string) {
  const result = await sql`
    SELECT
      id,
      name,
      job_title,
      description,
      lifecycle_status
    FROM roles
    WHERE (LOWER(name)=LOWER(${roleTitle})
      OR LOWER(job_title)=LOWER(${roleTitle}))
      AND lifecycle_status='approved'
    ORDER BY created_at
    LIMIT 1
  `;

  return result.rows[0] || null;
}

export async function findCompetency(name: string, client?: CareerQueryClient) {
  const query = getCareerSql(client);
  const result = await query`
    SELECT
      id,
      name,
      lifecycle_status
    FROM competencies
    WHERE LOWER(name)=LOWER(${name})
      AND lifecycle_status='approved'
    ORDER BY created_at
    LIMIT 1
  `;

  return result.rows[0] || null;
}

export async function getRoleCompetencies(roleId: string) {
  const result = await sql`
    SELECT
      c.id,
      c.name,
      rc.importance
    FROM role_competencies rc
    INNER JOIN competencies c
      ON c.id=rc.competency_id
    WHERE rc.role_id=${roleId}
      AND COALESCE(rc.lifecycle_status, 'approved') = 'approved'
      AND COALESCE(c.lifecycle_status, 'approved') = 'approved'
    ORDER BY rc.importance DESC NULLS LAST, c.name
  `;

  return result.rows;
}

export async function verifyRoleOwnership(
  roleAssessmentId: string,
  userId: string,
) {
  const result = await sql`
    SELECT cra.assessment_id
    FROM career_role_assessments cra
    INNER JOIN career_assessments ca
      ON ca.id=cra.assessment_id
    WHERE cra.id=${roleAssessmentId}
      AND ca.user_id=${userId}
    LIMIT 1
  `;

  if (!result.rows.length) {
    throw new ObjectAccessError();
  }

  return String(result.rows[0].assessment_id);
}
