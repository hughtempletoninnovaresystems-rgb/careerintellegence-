import { sql } from "@vercel/postgres";
import { generateValidatedJson } from "../ai/provider";
import { evaluationListSchema } from "../ai/schemas";
import { findCompetency, verifyRoleOwnership } from "../data/repository";
import { addClarificationRound, stageCapability } from "../data/staging";
import {
  CAPABILITY_IDENTITY_RULES,
  EVIDENCE_ASSESSMENT_RULES,
} from "../domain/intelligence-contract";
import { AIProviderError, CareerIntelligenceError } from "../errors";
import { recordSuccessGate } from "../success-gates";
import type { Evaluation, Gap } from "../types";
import { clamp } from "../utils";
import { recordCapabilityEvidence } from "./provenance";
import { transitionRoleLifecycle } from "./role-lifecycle";
import { loadRoleAssessmentSnapshot } from "./role-snapshot";

export type ClarificationAnswerInput = {
  questionId: string;
  answer: string;
};

type TrustedClarificationAnswer = ClarificationAnswerInput & {
  competency: string;
  question: string;
};

type StagedCapabilityIdentity = {
  id: string;
  canonicalCompetencyId: string | null;
  name: string;
  capabilityStatus: string;
  assessmentStatus: string;
};

async function evaluateAnswers(
  role: Awaited<ReturnType<typeof loadRoleAssessmentSnapshot>>,
  answers: TrustedClarificationAnswer[],
): Promise<Evaluation[]> {
  const prompt = `
You are assessing clarification evidence for a career role.

${CAPABILITY_IDENTITY_RULES}
${EVIDENCE_ASSESSMENT_RULES}

Return JSON only:

{
  "evaluations": [
    {
      "questionId": "question uuid",
      "competency": "capability name",
      "status": "demonstrated | gap | needs_clarification",
      "evidence": "evidence supported by the candidate answer",
      "confidence": 0.0,
      "followUpQuestion": "optional follow-up",
      "followUpReason": "optional reason",
      "emergingCapabilities": [
        {
          "name": "capability name",
          "evidence": "supporting evidence",
          "confidence": 0.0
        }
      ]
    }
  ]
}

Rules:
- Demonstrated requires meaningful evidence of what the person personally did.
- A capability keyword alone is not sufficient evidence.
- Gap means the answer does not establish demonstration and further questioning is not reasonably useful.
- Needs clarification means there is a plausible signal but more evidence could establish it; provide a coherent follow-up question.
- When an answer evidences an additional independently assessable capability, return it under emergingCapabilities.
- Assess every supplied question independently even where one occupational episode supports several capabilities.
- Do not invent evidence.
- Confidence must be between 0 and 1.

Role:
${JSON.stringify({
  organisation: role.organisationName,
  roleTitle: role.roleTitle,
  description: role.roleDescription,
})}

Questions and answers:
${JSON.stringify(answers)}
`;

  const parsed = await generateValidatedJson({
    prompt,
    schema: evaluationListSchema,
    context: {
      assessmentId: role.assessmentId,
      roleAssessmentId: role.roleAssessmentId,
      operation: "clarification_evaluation",
    },
  });

  const submittedIds = new Set(answers.map((answer) => answer.questionId));
  const evaluationById = new Map<string, Evaluation>();

  for (const evaluation of parsed.evaluations) {
    const questionId = String(evaluation.questionId);

    if (!submittedIds.has(questionId) || evaluationById.has(questionId)) {
      throw new AIProviderError(
        "The AI assessment service returned an inconsistent clarification response.",
      );
    }

    if (
      evaluation.status === "needs_clarification" &&
      !evaluation.followUpQuestion?.trim()
    ) {
      throw new AIProviderError(
        "The AI assessment service returned an incomplete clarification response.",
      );
    }

    evaluationById.set(questionId, {
      questionId,
      competency: evaluation.competency.trim(),
      status: evaluation.status,
      evidence: evaluation.evidence.trim(),
      confidence: evaluation.confidence,
      followUpQuestion: evaluation.followUpQuestion?.trim() || undefined,
      followUpReason: evaluation.followUpReason?.trim() || undefined,
      emergingCapabilities: evaluation.emergingCapabilities.map((capability) => ({
        name: capability.name.trim(),
        evidence: capability.evidence.trim(),
        confidence: capability.confidence,
      })),
    });
  }

  for (const answer of answers) {
    if (!evaluationById.has(answer.questionId)) {
      throw new AIProviderError(
        "The AI assessment service did not evaluate every clarification response.",
      );
    }
  }

  return answers.map((answer) => evaluationById.get(answer.questionId)!);
}

/*
 * CI-DRWP-002
 *
 * Capability identity comparison for clarification resolution.
 *
 * Canonical competency identity takes precedence where available. For
 * unresolved/non-canonical capabilities, compare the effective capability
 * name: edited_competency_name || proposed_competency_name.
 */
function normaliseCapabilityName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function loadStagedCapabilityIdentities(
  roleAssessmentId: string,
): Promise<StagedCapabilityIdentity[]> {
  const result = await sql`
    SELECT
      id,
      canonical_competency_id,
      COALESCE(
        NULLIF(TRIM(edited_competency_name), ''),
        proposed_competency_name
      ) AS effective_name,
      capability_status,
      assessment_status
    FROM career_role_capabilities
    WHERE role_assessment_id=${roleAssessmentId}
    ORDER BY created_at, id
  `;

  return result.rows.map((row) => ({
    id: String(row.id),
    canonicalCompetencyId: row.canonical_competency_id
      ? String(row.canonical_competency_id)
      : null,
    name: String(row.effective_name || ""),
    capabilityStatus: String(row.capability_status || ""),
    assessmentStatus: String(row.assessment_status || ""),
  }));
}

function findMatchingCapability(
  staged: StagedCapabilityIdentity[],
  name: string,
  canonicalCompetencyId: string | null,
  unresolvedOnly = false,
) {
  const normalisedName = normaliseCapabilityName(name);

  return staged.find((capability) => {
    if (
      unresolvedOnly &&
      capability.capabilityStatus !== "signal" &&
      capability.assessmentStatus !== "needs_clarification"
    ) {
      return false;
    }

    if (
      canonicalCompetencyId &&
      capability.canonicalCompetencyId &&
      canonicalCompetencyId === capability.canonicalCompetencyId
    ) {
      return true;
    }

    return (
      Boolean(normalisedName) &&
      normaliseCapabilityName(capability.name) === normalisedName
    );
  });
}

export async function assessRoleClarifications({
  userId,
  roleAssessmentId,
  answers,
}: {
  userId: string;
  roleAssessmentId: string;
  answers: ClarificationAnswerInput[];
}) {
  const assessmentId = await verifyRoleOwnership(roleAssessmentId, userId);

  if (!answers.length) {
    throw new CareerIntelligenceError(
      "At least one clarification answer is required.",
      {
        status: 400,
        code: "clarification_answer_required",
        expose: true,
      },
    );
  }

  const openQuestionResult = await sql`
    SELECT id, competency, question
    FROM career_role_questions
    WHERE role_assessment_id=${roleAssessmentId}
      AND status='open'
    ORDER BY round_no, created_at, id
  `;

  const openQuestions = new Map(
    openQuestionResult.rows.map((row) => [String(row.id), row]),
  );

  const seen = new Set<string>();
  const trustedAnswers: TrustedClarificationAnswer[] = [];

  for (const answer of answers) {
    const questionId = String(answer.questionId);
    const question = openQuestions.get(questionId);

    if (!question || seen.has(questionId)) {
      throw new CareerIntelligenceError(
        "One or more clarification questions are no longer available for response.",
        {
          status: 409,
          code: "clarification_question_conflict",
          expose: true,
        },
      );
    }

    seen.add(questionId);
    trustedAnswers.push({
      questionId,
      competency: String(question.competency || ""),
      question: String(question.question || ""),
      answer: answer.answer.trim(),
    });
  }

  const role = await loadRoleAssessmentSnapshot(roleAssessmentId);
  const evaluations = await evaluateAnswers(role, trustedAnswers);
  const followUps: Gap[] = [];

  /*
   * Keep a local identity snapshot throughout this clarification pass.
   *
   * New capabilities staged below are added to this collection immediately so
   * emerging intelligence from later evaluations cannot create duplicate
   * staged identities during the same request.
   */
  const stagedCapabilities =
    await loadStagedCapabilityIdentities(roleAssessmentId);

  for (let index = 0; index < trustedAnswers.length; index += 1) {
    const answer = trustedAnswers[index];
    const evaluation = evaluations[index];

    await sql`
      UPDATE career_role_questions
      SET status='answered', updated_at=NOW()
      WHERE id=${answer.questionId}
        AND role_assessment_id=${roleAssessmentId}
        AND status='open'
    `;

    const savedAnswer = await sql`
      INSERT INTO career_role_answers (
        question_id,
        role_assessment_id,
        answer,
        evaluation_status,
        evaluation_evidence,
        evaluation_confidence,
        created_at
      )
      VALUES (
        ${answer.questionId},
        ${roleAssessmentId},
        ${answer.answer},
        ${evaluation.status},
        ${evaluation.evidence || null},
        ${evaluation.confidence},
        NOW()
      )
      RETURNING id
    `;
    const sourceAnswerId = savedAnswer.rows[0]?.id
      ? String(savedAnswer.rows[0].id)
      : null;
    if (!sourceAnswerId) {
      throw new CareerIntelligenceError(
        "The clarification answer could not be linked to its assessment evidence.",
        { status: 500, code: "answer_provenance_persistence_failed", expose: true },
      );
    }

    const capabilityName =
      evaluation.competency || answer.competency;

    const canonical =
      await findCompetency(capabilityName);

    const canonicalCompetencyId =
      canonical ? String(canonical.id) : null;

    const effectiveCapabilityName =
      canonical ? String(canonical.name) : capabilityName;

    /*
     * CI-DRWP-002:
     *
     * Resolve the signal that generated the clarification rather than
     * automatically staging another capability with the same identity.
     */
    const existingSignal = findMatchingCapability(
      stagedCapabilities,
      effectiveCapabilityName,
      canonicalCompetencyId,
      true,
    );

    if (evaluation.status === "demonstrated") {
      if (existingSignal) {
        await sql`
          UPDATE career_role_capabilities
          SET
            canonical_competency_id=COALESCE(
              ${canonicalCompetencyId},
              canonical_competency_id
            ),
            evidence=${evaluation.evidence || null},
            ai_confidence=${clamp(evaluation.confidence)},
            demonstrated=TRUE,
            capability_status='demonstrated',
            assessment_status='assessed',
            review_status='proposed',
            updated_at=NOW()
          WHERE id=${existingSignal.id}
            AND role_assessment_id=${roleAssessmentId}
        `;

        await recordCapabilityEvidence({
          roleAssessmentId,
          roleCapabilityId: existingSignal.id,
          sourceType: "clarification_answer",
          evidenceText: evaluation.evidence,
          sourceQuestionId: answer.questionId,
          sourceAnswerId,
          relationshipType: "supporting",
          provenance: {
            evaluationStatus: evaluation.status,
            confidence: clamp(evaluation.confidence),
            sourceAnswerTextLength: answer.answer.trim().length,
          },
        });

        existingSignal.canonicalCompetencyId =
          canonicalCompetencyId ||
          existingSignal.canonicalCompetencyId;

        existingSignal.name = effectiveCapabilityName;
        existingSignal.capabilityStatus = "demonstrated";
        existingSignal.assessmentStatus = "assessed";
      } else {
        const capabilityId = await stageCapability({
          roleAssessmentId,
          competencyId: canonicalCompetencyId,
          name: effectiveCapabilityName,
          sourceType: "clarification",
          sourceSection: "candidate_answer",
          evidence: evaluation.evidence,
          confidence: evaluation.confidence,
          sourceQuestionId: answer.questionId,
          sourceAnswerId,
          evidenceRelationshipType: "supporting",
          demonstrated: true,
          capabilityStatus: "demonstrated",
          assessmentStatus: "assessed",
        });

        if (capabilityId) {
          stagedCapabilities.push({
            id: capabilityId,
            canonicalCompetencyId,
            name: effectiveCapabilityName,
            capabilityStatus: "demonstrated",
            assessmentStatus: "assessed",
          });
        }
      }
    }

    if (evaluation.status === "gap") {
      if (existingSignal) {
        await sql`
          UPDATE career_role_capabilities
          SET
            canonical_competency_id=COALESCE(
              ${canonicalCompetencyId},
              canonical_competency_id
            ),
            evidence=${evaluation.evidence || null},
            ai_confidence=${clamp(evaluation.confidence)},
            demonstrated=FALSE,
            capability_status='gap',
            assessment_status='assessed',
            review_status='accepted',
            updated_at=NOW()
          WHERE id=${existingSignal.id}
            AND role_assessment_id=${roleAssessmentId}
        `;

        await recordCapabilityEvidence({
          roleAssessmentId,
          roleCapabilityId: existingSignal.id,
          sourceType: "clarification_answer",
          evidenceText: evaluation.evidence,
          sourceQuestionId: answer.questionId,
          sourceAnswerId,
          relationshipType: "contradictory",
          provenance: {
            evaluationStatus: evaluation.status,
            confidence: clamp(evaluation.confidence),
          },
        });

        existingSignal.canonicalCompetencyId =
          canonicalCompetencyId ||
          existingSignal.canonicalCompetencyId;

        existingSignal.name = effectiveCapabilityName;
        existingSignal.capabilityStatus = "gap";
        existingSignal.assessmentStatus = "assessed";
      } else {
        /*
         * stageCapability() deliberately defaults review_status to proposed.
         * A confirmed gap is already accepted by the clarification lifecycle,
         * so set it to accepted immediately after insertion.
         */
        const capabilityId = await stageCapability({
          roleAssessmentId,
          competencyId: canonicalCompetencyId,
          name: effectiveCapabilityName,
          sourceType: "clarification",
          sourceSection: "candidate_answer",
          evidence: evaluation.evidence,
          confidence: evaluation.confidence,
          sourceQuestionId: answer.questionId,
          sourceAnswerId,
          evidenceRelationshipType: "contradictory",
          demonstrated: false,
          capabilityStatus: "gap",
          assessmentStatus: "assessed",
        });

        if (capabilityId) {
          await sql`
            UPDATE career_role_capabilities
            SET
              review_status='accepted',
              updated_at=NOW()
            WHERE id=${capabilityId}
              AND role_assessment_id=${roleAssessmentId}
          `;

          stagedCapabilities.push({
            id: capabilityId,
            canonicalCompetencyId,
            name: effectiveCapabilityName,
            capabilityStatus: "gap",
            assessmentStatus: "assessed",
          });
        }
      }
    }

    if (evaluation.status === "needs_clarification") {
      /*
       * Deliberately do not mutate the existing signal. Its unresolved
       * lifecycle is retained while the focused follow-up is created.
       */
      followUps.push({
        competency: effectiveCapabilityName,
        reason:
          evaluation.followUpReason ||
          "Further evidence is required.",
        question: evaluation.followUpQuestion!,
      });
    }

    /*
     * Emerging capabilities remain new intelligence, but must not create a
     * duplicate staged identity.
     */
    for (const emerging of evaluation.emergingCapabilities || []) {
      const mapped =
        await findCompetency(emerging.name);

      const mappedCompetencyId =
        mapped ? String(mapped.id) : null;

      const emergingName =
        mapped ? String(mapped.name) : emerging.name;

      const existingEmerging = findMatchingCapability(
        stagedCapabilities,
        emergingName,
        mappedCompetencyId,
      );

      if (existingEmerging) {
        continue;
      }

      const capabilityId = await stageCapability({
        roleAssessmentId,
        competencyId: mappedCompetencyId,
        name: emergingName,
        sourceType: "clarification",
        sourceSection: "emerging_capability",
        evidence: emerging.evidence,
        confidence: emerging.confidence,
        sourceQuestionId: answer.questionId,
        sourceAnswerId,
        evidenceRelationshipType: "supporting",
        demonstrated: true,
        capabilityStatus: "demonstrated",
        assessmentStatus: "assessed",
      });

      if (capabilityId) {
        stagedCapabilities.push({
          id: capabilityId,
          canonicalCompetencyId: mappedCompetencyId,
          name: emergingName,
          capabilityStatus: "demonstrated",
          assessmentStatus: "assessed",
        });
      }
    }
  }

  await addClarificationRound(roleAssessmentId, followUps);

  await recordSuccessGate({
    assessmentId,
    roleAssessmentId,
    gateKey: "clarification_evaluation_completed",
  });

  const remaining = await sql`
    SELECT COUNT(*)::int AS count
    FROM career_role_questions
    WHERE role_assessment_id=${roleAssessmentId}
      AND status='open'
  `;

  const openCount = Number(remaining.rows[0]?.count || 0);

  await transitionRoleLifecycle({
    roleAssessmentId,
    to: openCount > 0 ? "in_progress" : "review_ready",
  });

  if (openCount === 0) {
    await recordSuccessGate({
      assessmentId,
      roleAssessmentId,
      gateKey: "clarification_completed",
    });
  }

  return {
    assessmentId,
    openQuestionCount: openCount,
  };
}