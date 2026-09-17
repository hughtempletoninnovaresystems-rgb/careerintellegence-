import { sql } from "@vercel/postgres";
import type { SuccessGate } from "./types";

export async function recordSuccessGate({
  assessmentId,
  roleAssessmentId = null,
  gateKey,
  metadata = {},
}: {
  assessmentId: string;
  roleAssessmentId?: string | null;
  gateKey: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    const scopeKey = roleAssessmentId
      ? `role:${roleAssessmentId}`
      : `assessment:${assessmentId}`;

    await sql`
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
  } catch (error) {
    // Traceability must not break the assessment workflow. Do not log metadata.
    console.error("Unable to record career success gate", {
      gateKey,
      errorName: error instanceof Error ? error.name : "unknown",
    });
  }
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
    achievedAt: row.achieved_at ? new Date(row.achieved_at).toISOString() : "",
  }));
}
