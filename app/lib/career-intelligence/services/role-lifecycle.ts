import { sql } from "@vercel/postgres";
import type { CareerQueryClient } from "../data/query-client";
import { getCareerSql } from "../db/career-sql";
import { CareerIntelligenceError } from "../errors";
import {
  canTransitionRoleLifecycle,
  type RoleLifecycleStatus,
} from "../domain/workflow";

export async function transitionRoleLifecycle({
  roleAssessmentId,
  to,
  client,
}: {
  roleAssessmentId: string;
  to: RoleLifecycleStatus;
  client?: CareerQueryClient;
}) {
  const query = getCareerSql(client);

  const currentResult = await query`
    SELECT lifecycle_status
    FROM career_role_assessments
    WHERE id=${roleAssessmentId}
    LIMIT 1
  `;

  if (!currentResult.rows.length) {
    throw new CareerIntelligenceError("Role assessment not found.", {
      status: 404,
      code: "role_assessment_not_found",
      expose: true,
    });
  }

  const from = String(
    currentResult.rows[0].lifecycle_status,
  ) as RoleLifecycleStatus;

  if (!canTransitionRoleLifecycle(from, to)) {
    throw new CareerIntelligenceError(
      `Role workflow cannot move from ${from} to ${to}.`,
      {
        status: 409,
        code: "invalid_role_lifecycle_transition",
        expose: true,
      },
    );
  }

  const updateResult = await query`
    UPDATE career_role_assessments
    SET
      lifecycle_status=${to},
      completed_at=CASE
        WHEN ${to}='completed' THEN NOW()
        ELSE completed_at
      END,
      updated_at=NOW()
    WHERE id=${roleAssessmentId}
      AND lifecycle_status=${from}
    RETURNING id
  `;

  if (!updateResult.rows.length) {
    throw new CareerIntelligenceError(
      "Role workflow changed while the request was being processed.",
      {
        status: 409,
        code: "role_lifecycle_concurrency_conflict",
        expose: true,
      },
    );
  }

  return { from, to };
}