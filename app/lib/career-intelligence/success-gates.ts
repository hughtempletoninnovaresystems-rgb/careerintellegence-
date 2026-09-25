import { sql } from "@vercel/postgres";
import type { CareerQueryClient } from "./data/query-client";
import type { SuccessGate } from "./types";

type RecordSuccessGateInput = {
  assessmentId: string;
  roleAssessmentId?: string | null;
  gateKey: string;
  metadata?: Record<string, unknown>;
};

async function writeSuccessGate(
  query: CareerQueryClient["sql"],
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
      status='achieved',
      metadata=EXCLUDED.metadata,
      achieved_at=NOW(),
      updated_at=NOW()
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
      errorName: error instanceof Error ? error.name : "unknown",
    });
  }
}

/**
 * Transactional success-gate writer.
 *
 * Unlike recordSuccessGate(), failures deliberately propagate so the
 * surrounding business transaction can roll back.
 */
export async function recordSuccessGateAtomic(
  client: CareerQueryClient,
  input: RecordSuccessGateInput,
) {
  await writeSuccessGate(client.sql, input);
}

export async function getSuccessGates(
  assessmentId: string,
  roleAssessmentId?: string,
): Promise<SuccessGate[]> {
  const result = roleAssessmentId
    ? await sql`
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
        WHERE assessment_id=${assessmentId}
          AND role_assessment_id=${roleAssessmentId}
        ORDER BY achieved_at, id
      `
    : await sql`
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
        WHERE assessment_id=${assessmentId}
          AND role_assessment_id IS NULL
        ORDER BY achieved_at, id
      `;

  return result.rows.map((row) => ({
    id: String(row.id),
    assessmentId: String(row.assessment_id),
    roleAssessmentId: row.role_assessment_id
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