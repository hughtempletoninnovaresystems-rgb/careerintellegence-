import { sql } from "@vercel/postgres";
import type { CareerQueryClient } from "./data/query-client";
import type { SuccessGate } from "./types";
import { getCareerSql } from "./db/career-sql";

type RecordSuccessGateInput = {
  assessmentId: string;
  roleAssessmentId?: string | null;
  gateKey: string;
  metadata?: Record<string, unknown>;
};

/**
 * Common SQL executor type used by both:
 * - the global @vercel/postgres sql tagged-template function
 * - a correctly bound transactional client.sql method
 */
type CareerSqlExecutor = CareerQueryClient["sql"];

async function writeSuccessGate(
  query: CareerSqlExecutor,
  {
    assessmentId,
    roleAssessmentId = null,
    gateKey,
    metadata = {},
  }: RecordSuccessGateInput,
) {
  const scopeKey = roleAssessmentId
    ? `role:${roleAssessmentId}`
    : `assessment:${assessmentId}`;

  await query`
    INSERT INTO career_success_gates (
      assessment_id,
      role_assessment_id,
      scope_key,
      gate_key,
      status,
      metadata,
      achieved_at,
      created_at,
      updated_at
    )
    VALUES (
      ${assessmentId},
      ${roleAssessmentId},
      ${scopeKey},
      ${gateKey},
      'achieved',
      CAST(${JSON.stringify(metadata)} AS jsonb),
      NOW(),
      NOW(),
      NOW()
    )
    ON CONFLICT (scope_key, gate_key)
    DO UPDATE SET
      status = 'achieved',
      metadata = EXCLUDED.metadata,
      achieved_at = NOW(),
      updated_at = NOW()
  `;
}

export async function recordSuccessGate(
  input: RecordSuccessGateInput,
) {
  try {
    await writeSuccessGate(sql, input);
  } catch (error) {
    // Traceability must not break ordinary assessment workflow.
    // Do not log metadata.
    console.error("Unable to record career success gate", {
      gateKey: input.gateKey,
      errorName:
        error instanceof Error
          ? error.name
          : "unknown",
      errorMessage:
        error instanceof Error
          ? error.message
          : String(error),
    });
  }
}

/**
 * Transactional success-gate writer.
 *
 * Failures deliberately propagate so the surrounding transaction
 * can roll back.
 *
 * IMPORTANT:
 * Never pass client.sql directly to writeSuccessGate().
 *
 * @vercel/postgres client.sql is an instance method and must retain
 * its client receiver. getCareerSql() returns the correctly bound
 * transactional executor.
 */
export async function recordSuccessGateAtomic(
  client: CareerQueryClient,
  input: RecordSuccessGateInput,
) {
  const query = getCareerSql(client);

  await writeSuccessGate(query, input);
}

export async function getSuccessGates(
  assessmentId: string,
  roleAssessmentId?: string,
  client?: CareerQueryClient,
): Promise<SuccessGate[]> {
  const query = getCareerSql(client);
  const result = roleAssessmentId
    ? await query`
        SELECT
          id,
          assessment_id,
          role_assessment_id,
          scope_key,
          gate_key,
          status,
          metadata,
          achieved_at
        FROM career_success_gates
        WHERE assessment_id = ${assessmentId}
          AND role_assessment_id = ${roleAssessmentId}
        ORDER BY achieved_at, id
      `
    : await query`
        SELECT
          id,
          assessment_id,
          role_assessment_id,
          scope_key,
          gate_key,
          status,
          metadata,
          achieved_at
        FROM career_success_gates
        WHERE assessment_id = ${assessmentId}
          AND role_assessment_id IS NULL
        ORDER BY achieved_at, id
      `;

  return result.rows.map((row) => ({
    id: String(row.id),
    assessmentId: String(row.assessment_id),
    roleAssessmentId:
      row.role_assessment_id != null
        ? String(row.role_assessment_id)
        : null,
    scopeKey: String(row.scope_key),
    gateKey: String(row.gate_key),
    status: String(row.status),
    metadata: row.metadata || {},
    achievedAt: row.achieved_at
      ? new Date(row.achieved_at).toISOString()
      : "",
  }));
}