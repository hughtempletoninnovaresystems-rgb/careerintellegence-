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

    await sql`
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
    `;

    const capabilityName = evaluation.competency || answer.competency;
    const canonical = await findCompetency(capabilityName);

    if (evaluation.status === "demonstrated" || evaluation.status === "gap") {
      await stageCapability({
        roleAssessmentId,
        competencyId: canonical ? String(canonical.id) : null,
        name: canonical ? String(canonical.name) : capabilityName,
        sourceType: "clarification",
        sourceSection: "candidate_answer",
        evidence: evaluation.evidence,
        confidence: evaluation.confidence,
        demonstrated: evaluation.status === "demonstrated",
        capabilityStatus:
          evaluation.status === "demonstrated" ? "demonstrated" : "gap",
        assessmentStatus: "assessed",
      });
    }

    if (evaluation.status === "needs_clarification") {
      followUps.push({
        competency: capabilityName,
        reason: evaluation.followUpReason || "Further evidence is required.",
        question: evaluation.followUpQuestion!,
      });
    }

    for (const emerging of evaluation.emergingCapabilities || []) {
      const mapped = await findCompetency(emerging.name);

      await stageCapability({
        roleAssessmentId,
        competencyId: mapped ? String(mapped.id) : null,
        name: mapped ? String(mapped.name) : emerging.name,
        sourceType: "clarification",
        sourceSection: "emerging_capability",
        evidence: emerging.evidence,
        confidence: emerging.confidence,
        demonstrated: true,
        capabilityStatus: "demonstrated",
        assessmentStatus: "assessed",
      });
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
