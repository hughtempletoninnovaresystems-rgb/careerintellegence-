import { sql } from "@vercel/postgres";
import { getCareerSql } from "../db/career-sql";
import { findCompetency, verifyRoleOwnership } from "../data/repository";
import { addClarificationRound, stageCapability } from "../data/staging";
import { CareerIntelligenceError } from "../errors";
import {
  recordSuccessGate,
  recordSuccessGateAtomic,
} from "../success-gates";
import { runFinalRoleReview } from "./final-review";
import { promoteRoleToCandidateProfile } from "./profile-promotion";
import { transitionRoleLifecycle } from "./role-lifecycle";
import { loadRoleAssessmentSnapshot } from "./role-snapshot";

export type RoleSubmissionOutcome = {
  assessmentId: string;
  roleAssessmentId: string;
  nextRoleAssessmentId: string | null;
  completed: boolean;
  assessmentCompleted: boolean;
  requiresFurtherReview: boolean;
  message?: string;
  idempotentReplay?: boolean;
};

async function countOpenQuestions(roleAssessmentId: string) {
  const result = await sql`
    SELECT COUNT(*)::int AS count
    FROM career_role_questions
    WHERE role_assessment_id=${roleAssessmentId}
      AND status='open'
  `;

  return Number(result.rows[0]?.count || 0);
}

async function countUnreviewedDemonstratedCapabilities(roleAssessmentId: string) {
  const result = await sql`
    SELECT COUNT(*)::int AS count
    FROM career_role_capabilities
    WHERE role_assessment_id=${roleAssessmentId}
      AND demonstrated=TRUE
      AND capability_status='demonstrated'
      AND (
        assessment_status <> 'assessed'
        OR assessment_status IS NULL
        OR review_status IS NULL
        OR review_status NOT IN ('accepted', 'edited', 'rejected')
        OR reviewed_revision_no IS DISTINCT FROM revision_no
        OR (
          review_status IN ('accepted', 'edited')
          AND NOT EXISTS (
            SELECT 1
            FROM career_capability_evidence_links cel
            WHERE cel.role_capability_id=career_role_capabilities.id
              AND cel.is_current=TRUE
              AND cel.relationship_type='supporting'
          )
        )
      )
  `;

  return Number(result.rows[0]?.count || 0);
}

async function activateNextRole({
  assessmentId,
  roleAssessmentId,
}: {
  assessmentId: string;
  roleAssessmentId: string;
}) {
  const current = await sql`
    SELECT sequence_no
    FROM career_role_assessments
    WHERE id=${roleAssessmentId}
    LIMIT 1
  `;

  const currentSequence = Number(current.rows[0]?.sequence_no || 0);

  
  const next = await sql`
    SELECT id, lifecycle_status
    FROM career_role_assessments
    WHERE assessment_id=${assessmentId}
      AND sequence_no > ${currentSequence}
      AND lifecycle_status <> 'completed'
    ORDER BY sequence_no
    LIMIT 1
  `;

  if (!next.rows.length) {
    return null;
  }

  const nextId = String(next.rows[0].id);
  const nextStatus = String(next.rows[0].lifecycle_status);
  const hasQuestions = (await countOpenQuestions(nextId)) > 0;
  const desiredStatus = hasQuestions ? "in_progress" : "review_ready";

  if (nextStatus !== desiredStatus) {
    await transitionRoleLifecycle({
      roleAssessmentId: nextId,
      to: desiredStatus,
    });
  }

  await recordSuccessGate({
    assessmentId,
    roleAssessmentId: nextId,
    gateKey: "next_role_activated",
  });

  if (!hasQuestions) {
    await recordSuccessGate({
      assessmentId,
      roleAssessmentId: nextId,
      gateKey: "clarification_completed",
    });
  }

  return nextId;
}

async function completeAssessmentIfReady(assessmentId: string) {
  const remaining = await sql`
    SELECT COUNT(*)::int AS count
    FROM career_role_assessments
    WHERE assessment_id=${assessmentId}
      AND lifecycle_status <> 'completed'
  `;

  const completed = Number(remaining.rows[0]?.count || 0) === 0;

  if (completed) {
    await sql`
      UPDATE career_assessments
      SET
        status='completed',
        completed_at=COALESCE(completed_at, NOW()),
        updated_at=NOW()
      WHERE id=${assessmentId}
        AND status <> 'completed'
    `;

    await recordSuccessGate({
      assessmentId,
      gateKey: "assessment_completed",
    });
  }

  return completed;
}

/**
 * Shared final role-submission lifecycle for both CV and manual acquisition.
 * Route adapters are responsible only for mapping this outcome to their
 * established response shape.
 */
export async function submitRoleForProfile({
  userId,
  roleAssessmentId,
}: {
  userId: string;
  roleAssessmentId: string;
}): Promise<RoleSubmissionOutcome> {
  const assessmentId = await verifyRoleOwnership(roleAssessmentId, userId);
  const initial = await loadRoleAssessmentSnapshot(roleAssessmentId);

  /*
   * Repeat submission after successful role completion is recoverable as well
   * as idempotent.
   *
   * Promotion/repository work must not run again, but downstream activation or
   * assessment completion may previously have failed after the atomic role
   * completion transaction committed. Re-running those operations here allows
   * the workflow to recover safely.
   */
  if (initial.lifecycleStatus === "completed") {
    const nextRoleAssessmentId = await activateNextRole({
      assessmentId,
      roleAssessmentId,
    });

    return {
      assessmentId,
      roleAssessmentId,
      nextRoleAssessmentId,
      completed: true,
      assessmentCompleted:
        await completeAssessmentIfReady(assessmentId),
      requiresFurtherReview: false,
      idempotentReplay: true,
    };
  }

  if ((await countOpenQuestions(roleAssessmentId)) > 0) {
    throw new CareerIntelligenceError(
      "Clarification questions remain open.",
      {
        status: 409,
        code: "clarification_remaining",
        expose: true,
      },
    );
  }

  if ((await countUnreviewedDemonstratedCapabilities(roleAssessmentId)) > 0) {
    throw new CareerIntelligenceError(
      "All demonstrated capabilities must be reviewed.",
      {
        status: 409,
        code: "capability_review_remaining",
        expose: true,
      },
    );
  }

  const finalCheck = await runFinalRoleReview(initial);

  if (
    finalCheck.emergingCapabilities.length > 0 ||
    finalCheck.clarifications.length > 0
  ) {
    for (const item of finalCheck.emergingCapabilities) {
      const canonical = await findCompetency(item.name);

      await stageCapability({
        roleAssessmentId,
        competencyId: canonical ? String(canonical.id) : null,
        name: canonical ? String(canonical.name) : item.name,
        sourceType: "final_check",
        evidence: item.evidence,
        confidence: item.confidence,
        evidenceRelationshipType: "context",
        demonstrated: true,
        capabilityStatus: "demonstrated",
        assessmentStatus: "assessed",
      });
    }

    await addClarificationRound(
      roleAssessmentId,
      finalCheck.clarifications,
    );

    if (initial.lifecycleStatus !== "in_progress") {
      await transitionRoleLifecycle({
        roleAssessmentId,
        to: "in_progress",
      });
    }

    return {
      assessmentId,
      roleAssessmentId,
      nextRoleAssessmentId: null,
      completed: false,
      assessmentCompleted: false,
      requiresFurtherReview: true,
      message:
        "Additional evidence has been identified and requires review.",
    };
  }

  await recordSuccessGate({
    assessmentId,
    roleAssessmentId,
    gateKey: "final_submission_check_passed",
  });

  /*
   * CI-DRWP-007 — Atomic / Recoverable Completion Unit
   *
   * The authoritative assessment snapshot has already been loaded above.
   * From BEGIN until COMMIT/ROLLBACK, every persistence operation in the
   * promotion/completion unit must use this connected client.
   *
   * This unit covers:
   * - Repository acquisition
   * - Candidate Profile persistence
   * - Candidate capability reconciliation
   * - role_promoted success state
   * - role lifecycle completion
   * - role_completed success state
   *
   * A failure anywhere in this unit therefore cannot leave Profile/Repository
   * promotion committed while the role remains incomplete.
   */
  const client = await sql.connect();

  try {
    await client.sql`BEGIN`;
    const query = getCareerSql(client);

    // Lock the role and all mutable assessment children before checking the
    // snapshot. Writers that honour these rows cannot change review/evidence
    // state between the check and commit.
    const lockedRole = await query`
      SELECT id
      FROM career_role_assessments
      WHERE id=${roleAssessmentId}
      FOR UPDATE
    `;
    if (!lockedRole.rows.length) {
      throw new CareerIntelligenceError("Role assessment not found.", {
        status: 404,
        code: "role_assessment_not_found",
        expose: true,
      });
    }

    await query`
      SELECT id
      FROM career_role_capabilities
      WHERE role_assessment_id=${roleAssessmentId}
      ORDER BY id
      FOR UPDATE
    `;
    await query`
      SELECT id
      FROM career_role_questions
      WHERE role_assessment_id=${roleAssessmentId}
      ORDER BY id
      FOR UPDATE
    `;
    await query`
      SELECT id
      FROM career_role_answers
      WHERE role_assessment_id=${roleAssessmentId}
      ORDER BY id
      FOR UPDATE
    `;
    await query`
      SELECT cel.evidence_id
      FROM career_capability_evidence_links cel
      JOIN career_role_capabilities crc ON crc.id=cel.role_capability_id
      WHERE crc.role_assessment_id=${roleAssessmentId}
      ORDER BY cel.role_capability_id, cel.evidence_id
      FOR UPDATE OF cel
    `;

    const current = await loadRoleAssessmentSnapshot(roleAssessmentId, client);
    if (current.stateToken !== initial.stateToken) {
      throw new CareerIntelligenceError(
        "The role assessment changed while final review was running. Reload the role and submit it again.",
        {
          status: 409,
          code: "assessment_state_changed",
          expose: true,
        },
      );
    }

    const promotion = await promoteRoleToCandidateProfile({
      roleAssessmentId,
      userId,
      client,
      snapshot: current,
    });

    /*
     * CI-DRWP-006:
     *
     * Promotion itself verifies that every eligible source capability ID
     * belongs to a persisted/reconciled Candidate Profile identity.
     *
     * Do NOT compare eligibleCapabilityIds.length with
     * representedProfileIdentities.length here. Multiple assessment evidence
     * records may legitimately converge on one Candidate Profile capability.
     *
     * A non-empty eligible source set with no represented Profile identity is
     * therefore the relevant defensive completion failure at this boundary.
     */
    if (
      promotion.eligibleCapabilityIds.length > 0 &&
      promotion.representedProfileIdentities.length === 0
    ) {
      throw new CareerIntelligenceError(
        "Candidate capability promotion reconciliation is incomplete.",
        {
          status: 409,
          code: "capability_promotion_incomplete",
          expose: true,
        },
      );
    }

    /*
     * Do not record role_promoted before the corresponding business-state
     * writes have succeeded.
     *
     * The gate itself remains uncommitted until the entire transaction commits.
     */
    await recordSuccessGateAtomic(client, {
      assessmentId,
      roleAssessmentId,
      gateKey: "role_promoted",
    });

    await transitionRoleLifecycle({
      roleAssessmentId,
      to: "completed",
      client,
    });

    /*
     * role_completed is only written after the lifecycle business-state write
     * has succeeded. A gate-write failure propagates and rolls everything back.
     */
    await recordSuccessGateAtomic(client, {
      assessmentId,
      roleAssessmentId,
      gateKey: "role_completed",
    });

    await client.sql`COMMIT`;
  } catch (error) {
    try {
      await client.sql`ROLLBACK`;
    } catch (rollbackError) {
      /*
       * Preserve the original failure. The rollback failure is diagnostic and
       * must not replace the error that caused completion to abort.
       */
      console.error("Unable to roll back role completion transaction", {
        roleAssessmentId,
        errorName:
          rollbackError instanceof Error
            ? rollbackError.name
            : "unknown",
        errorMessage:
          rollbackError instanceof Error
            ? rollbackError.message
            : String(rollbackError),
      });
    }

    throw error;
  } finally {
    client.release();
  }

  /*
   * These operations occur only after the authoritative role completion unit
   * has committed.
   *
   * If either fails, retry enters the completed-role branch above and safely
   * retries downstream activation/completion without repeating Profile or
   * Repository promotion.
   */
  const nextRoleAssessmentId = await activateNextRole({
    assessmentId,
    roleAssessmentId,
  });

  const assessmentCompleted =
    await completeAssessmentIfReady(assessmentId);

  return {
    assessmentId,
    roleAssessmentId,
    nextRoleAssessmentId,
    completed: true,
    assessmentCompleted,
    requiresFurtherReview: false,
  };
}