import { sql } from "@vercel/postgres";
import { findCompetency, verifyRoleOwnership } from "../data/repository";
import { addClarificationRound, stageCapability } from "../data/staging";
import { CareerIntelligenceError } from "../errors";
import { recordSuccessGate } from "../success-gates";
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
        OR review_status NOT IN ('accepted', 'rejected')
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
      SET status='completed', completed_at=COALESCE(completed_at, NOW()), updated_at=NOW()
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

  // Repeat submission after a successful completion is idempotent and avoids
  // an additional AI/provider call or duplicate profile/repository work.
  if (initial.lifecycleStatus === "completed") {
    return {
      assessmentId,
      roleAssessmentId,
      nextRoleAssessmentId: null,
      completed: true,
      assessmentCompleted: await completeAssessmentIfReady(assessmentId),
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
        demonstrated: true,
        capabilityStatus: "demonstrated",
        assessmentStatus: "assessed",
      });
    }

    await addClarificationRound(roleAssessmentId, finalCheck.clarifications);

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

  const promotion = await promoteRoleToCandidateProfile({
    roleAssessmentId,
    userId,
  });

  /*
   * CI-DRWP-006:
   *
   * Promotion itself verifies that every eligible source capability ID belongs
   * to a persisted/reconciled Candidate Profile identity.
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

  await recordSuccessGate({
    assessmentId,
    roleAssessmentId,
    gateKey: "role_promoted",
  });

  await transitionRoleLifecycle({
    roleAssessmentId,
    to: "completed",
  });

  await recordSuccessGate({
    assessmentId,
    roleAssessmentId,
    gateKey: "role_completed",
  });

  const nextRoleAssessmentId = await activateNextRole({
    assessmentId,
    roleAssessmentId,
  });

  const assessmentCompleted = await completeAssessmentIfReady(assessmentId);

  return {
    assessmentId,
    roleAssessmentId,
    nextRoleAssessmentId,
    completed: true,
    assessmentCompleted,
    requiresFurtherReview: false,
  };
}