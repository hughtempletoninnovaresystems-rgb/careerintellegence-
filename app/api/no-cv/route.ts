import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/app/lib/career-intelligence/auth";
import { findCanonicalRole, findCompetency, getRoleCompetencies } from "@/app/lib/career-intelligence/data/repository";
import { createCareerAssessment, createCareerRoleAssessment } from "@/app/lib/career-intelligence/data/assessments";
import { addClarificationRound as replaceOpenQuestions, stageCapability } from "@/app/lib/career-intelligence/data/staging";
import { generateValidatedJson } from "@/app/lib/career-intelligence/ai/provider";
import { manualRoleAnalysisSchema } from "@/app/lib/career-intelligence/ai/schemas";
import { getSuccessGates, recordSuccessGate } from "@/app/lib/career-intelligence/success-gates";
import { clamp } from "@/app/lib/career-intelligence/utils";
import { noCvActionSchema } from "@/app/lib/career-intelligence/http/request-schemas";
import { errorResponse } from "@/app/lib/career-intelligence/http/error-response";
import { getCorrelationId, withCorrelationId } from "@/app/lib/career-intelligence/http/correlation";
import { reviewRoleCapability } from "@/app/lib/career-intelligence/services/capability-review";
import { transitionRoleLifecycle } from "@/app/lib/career-intelligence/services/role-lifecycle";
import { updateRoleContext } from "@/app/lib/career-intelligence/services/role-context";
import { assessRoleClarifications } from "@/app/lib/career-intelligence/services/clarification";
import { submitRoleForProfile } from "@/app/lib/career-intelligence/services/role-submission";
import { getManualRolePayload } from "@/app/lib/career-intelligence/services/role-snapshot";
import type { DatePrecision, ExtractedCapability, Gap } from "@/app/lib/career-intelligence/types";
import { CAPABILITY_IDENTITY_RULES, EVIDENCE_ASSESSMENT_RULES } from "@/app/lib/career-intelligence/domain/intelligence-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


/* ============================================================
   TYPES
============================================================ */

type ManualRoleInput = {
  organisation: string;
  roleTitle: string;

  fromDate?:
    | string
    | null;

  toDate?:
    | string
    | null;

  fromDatePrecision?:
    | DatePrecision
    | null;

  toDatePrecision?:
    | DatePrecision
    | null;

  fromDateOriginal?:
    | string
    | null;

  toDateOriginal?:
    | string
    | null;

  description: string;

  engagementType?:
    | string
    | null;

  employmentType?:
    | string
    | null;
};

/* ============================================================
   HELPERS
============================================================ */








/* ============================================================
   AUTH
============================================================ */



/* ============================================================
   SUCCESS GATES
============================================================ */





/* ============================================================
   REPOSITORY
============================================================ */







/* ============================================================
   MANUAL ROLE ANALYSIS
============================================================ */

async function analyseManualRole(
  role: ManualRoleInput,
  canonicalRoleId:
    | string
    | null
): Promise<{
  capabilities:
    ExtractedCapability[];
  gaps: Gap[];
}> {
  const expected =
    canonicalRoleId
      ? await getRoleCompetencies(
          canonicalRoleId
        )
      : [];

  const prompt = `
You are assessing manually entered career experience.

Identify demonstrated capabilities and areas requiring evidence enrichment.

${CAPABILITY_IDENTITY_RULES}
${EVIDENCE_ASSESSMENT_RULES}

Return JSON only:

{
  "capabilities": [
    {
      "name": "",
      "evidence": "",
      "confidence": 0.0
    }
  ],
  "gaps": [
    {
      "competency": "",
      "reason": "",
      "question": ""
    }
  ]
}

Rules:

- A demonstrated capability requires evidence of what the candidate actually did.
- A capability keyword or responsibility label by itself is not sufficient evidence.
- Where there is a plausible capability signal but insufficient evidence, place it in gaps and ask a specific clarification question.
- Questions should request what the candidate did, their responsibility and the result where possible.
- Do not invent career experience.
- Confidence must be between 0 and 1.

Candidate-owned evidence rule:
- Write evidence in first-person candidate voice (for example, "I diagnosed...", not "The candidate diagnosed...").
- Do not introduce "the candidate", "they", "he" or "she" unless reproducing an attributable third-party source.
- Improve clarity only; do not alter ownership, scope, certainty, strength or substantive meaning of the source evidence.
- Never invent evidence.

Role:
${JSON.stringify(
  {
    organisation:
      role.organisation,
    roleTitle:
      role.roleTitle,
    description:
      role.description,
    engagementType:
      role.engagementType,
    employmentType:
      role.employmentType,
  }
)}

Canonical expected competencies:
${JSON.stringify(
  expected.map(
    (item) => ({
      name:
        item.name,
      importance:
        item.importance,
    })
  )
)}
`;

  const parsed =
    await generateValidatedJson({
      prompt,
      schema:
        manualRoleAnalysisSchema,
    });

  const capabilities =
    Array.isArray(
      parsed?.capabilities
    )
      ? parsed.capabilities
      : [];

  const gaps =
    Array.isArray(
      parsed?.gaps
    )
      ? parsed.gaps
      : [];

  return {
    capabilities:
      capabilities
        .filter(
          (capability: any) =>
            typeof capability
              ?.name ===
              "string" &&
            capability.name.trim()
        )
        .map(
          (
            capability: any
          ) => ({
            name:
              capability.name.trim(),

            evidence:
              typeof capability
                .evidence ===
              "string"
                ? capability.evidence.trim()
                : "",

            confidence:
              clamp(
                Number(
                  capability.confidence ||
                    0
                )
              ),
          })
        ),

    gaps:
      gaps
        .filter(
          (gap: any) =>
            typeof gap
              ?.competency ===
              "string" &&
            gap.competency.trim() &&
            typeof gap
              ?.question ===
              "string" &&
            gap.question.trim()
        )
        .map(
          (gap: any) => ({
            competency:
              gap.competency.trim(),

            reason:
              typeof gap
                .reason ===
              "string"
                ? gap.reason.trim()
                : "Additional evidence is required.",

            question:
              gap.question.trim(),
          })
        ),
  };
}

/* ============================================================
   ASSESSMENT CREATION
============================================================ */

async function createAssessment(
  userId: string
) {
  return createCareerAssessment({
    userId,
    sourceType: "manual",
  });
}

async function createRoleAssessment(
  assessmentId: string,
  sequenceNo: number,
  role: ManualRoleInput,
  canonicalRoleId:
    | string
    | null,
  lifecycleStatus:
    | "in_progress"
    | "not_started"
) {
  return createCareerRoleAssessment({
    assessmentId,
    sequenceNo,
    canonicalRoleId,
    lifecycleStatus,
    role: {
      organisationName:
        role.organisation,
      roleTitle:
        role.roleTitle,
      fromDate:
        role.fromDate,
      toDate:
        role.toDate,
      fromDatePrecision:
        role.fromDatePrecision,
      toDatePrecision:
        role.toDatePrecision,
      fromDateOriginal:
        role.fromDateOriginal,
      toDateOriginal:
        role.toDateOriginal,
      roleDescription:
        role.description,
      engagementModel:
        role.engagementType,
      employmentContext:
        role.employmentType,
    },
  });
}

/* ============================================================
   CAPABILITIES / QUESTIONS
============================================================ */





/* ============================================================
   ROLE PAYLOAD
============================================================ */

async function getRolePayload(
  roleAssessmentId: string
) {
  return getManualRolePayload(roleAssessmentId);
}

/* ============================================================
   OWNERSHIP
============================================================ */



/* ============================================================
   START MANUAL
============================================================ */

async function handleStartManual(
  body: any,
  userId: string
) {
  const roles =
    Array.isArray(
      body.roles
    )
      ? body.roles
      : [];

  if (
    !roles.length
  ) {
    return NextResponse.json(
      {
        error:
          "At least one role is required.",
      },
      {
        status: 400,
      }
    );
  }

  for (
    const role of roles
  ) {
    if (
      !String(
        role.organisation ||
          ""
      ).trim() ||
      !String(
        role.roleTitle ||
          ""
      ).trim() ||
      !String(
        role.description ||
          ""
      ).trim()
    ) {
      return NextResponse.json(
        {
          error:
            "Organisation, role title and role description are required for every role.",
        },
        {
          status: 400,
        }
      );
    }
  }

  const assessmentId =
    await createAssessment(
      userId
    );

  await recordSuccessGate({
    assessmentId,
    gateKey:
      "assessment_started",
    metadata: {
      sourceType:
        "manual",
    },
  });

  await recordSuccessGate({
    assessmentId,
    gateKey:
      "roles_entered",
    metadata: {
      count:
        roles.length,
    },
  });

  const createdRoles: any[] =
    [];

  for (
    let index = 0;
    index < roles.length;
    index++
  ) {
    const input =
      roles[index];

    const role:
      ManualRoleInput = {
      organisation:
        String(
          input.organisation ||
            ""
        ).trim(),

      roleTitle:
        String(
          input.roleTitle ||
            ""
        ).trim(),

      fromDate:
        input.fromDate ||
        null,

      toDate:
        input.toDatePrecision ===
        "ongoing"
          ? null
          : input.toDate ||
            null,

      fromDatePrecision:
        input.fromDatePrecision ||
        (
          input.fromDate
            ? "day"
            : "unknown"
        ),

      toDatePrecision:
        input.toDatePrecision ===
        "ongoing"
          ? "ongoing"
          : input.toDatePrecision ||
            (
              input.toDate
                ? "day"
                : "unknown"
            ),

      fromDateOriginal:
        input.fromDateOriginal ||
        input.fromDate ||
        null,

      toDateOriginal:
        input.toDatePrecision ===
        "ongoing"
          ? "Present"
          : input.toDateOriginal ||
            input.toDate ||
            null,

      description:
        String(
          input.description ||
            ""
        ).trim(),

      engagementType:
        input.engagementType ||
        null,

      employmentType:
        input.employmentType ||
        null,
    };

    const canonical =
      await findCanonicalRole(
        role.roleTitle
      );

    const roleAssessmentId =
      await createRoleAssessment(
        assessmentId,
        index + 1,
        role,
        canonical
          ? String(
              canonical.id
            )
          : null,
        index === 0
          ? "in_progress"
          : "not_started"
      );

    await recordSuccessGate({
      assessmentId,
      roleAssessmentId,
      gateKey:
        "role_created",
      metadata: {
        sequenceNo:
          index + 1,
      },
    });

    const analysis =
      await analyseManualRole(
        role,
        canonical
          ? String(
              canonical.id
            )
          : null
      );

    for (
      const capability of
      analysis.capabilities
    ) {
      const canonicalCompetency =
        await findCompetency(
          capability.name
        );

      await stageCapability(
        {
          roleAssessmentId,

          competencyId:
            canonicalCompetency
              ? String(
                  canonicalCompetency.id
                )
              : null,

          name:
            canonicalCompetency
              ? String(
                  canonicalCompetency.name
                )
              : capability.name,

          sourceType:
            "manual_role",

          evidence:
            capability.evidence,

          confidence:
            capability.confidence,

          demonstrated:
            true,

          capabilityStatus:
            "demonstrated",

          assessmentStatus:
            "assessed",
        }
      );
    }

    await replaceOpenQuestions(
      roleAssessmentId,
      analysis.gaps
    );

    if (
      index === 0 &&
      !analysis.gaps.length
    ) {
      await transitionRoleLifecycle({
        roleAssessmentId,
        to: "review_ready",
      });

      await recordSuccessGate({
        assessmentId,
        roleAssessmentId,
        gateKey:
          "clarification_completed",
      });
    }

    await recordSuccessGate({
      assessmentId,
      roleAssessmentId,
      gateKey:
        "role_analysis_completed",
      metadata: {
        capabilities:
          analysis
            .capabilities
            .length,

        questions:
          analysis
            .gaps
            .length,
      },
    });

    createdRoles.push(
      await getRolePayload(
        roleAssessmentId
      )
    );
  }

  const successGates =
    await getSuccessGates(
      assessmentId
    );

  return NextResponse.json(
    {
      success: true,
      assessmentId,
      roles:
        createdRoles,
      successGates,
    }
  );
}

/* ============================================================
   EVALUATE CLARIFICATION
============================================================ */

async function handleAssessRole(
  body: any,
  userId: string
) {
  const roleAssessmentId = String(body.roleAssessmentId || "");

  await assessRoleClarifications({
    userId,
    roleAssessmentId,
    answers: body.answers.map((item: any) => ({
      questionId: String(item.questionId || ""),
      answer: String(item.answer || ""),
    })),
  });

  const role = await getRolePayload(roleAssessmentId);

  return NextResponse.json({
    success: true,
    role,
    successGates: role.successGates,
  });
}

/* ============================================================
   CAPABILITY REVIEW
============================================================ */

async function handleReviewCapability(
  body: any,
  userId: string
) {
  const roleAssessmentId =
    String(
      body.roleAssessmentId ||
        ""
    );

  const capabilityId =
    String(
      body.capabilityId ||
        ""
    );

  const reviewStatus =
    String(
      body.reviewStatus ||
        ""
    ) as
      | "accepted"
      | "edited"
      | "rejected";

  await reviewRoleCapability({
    userId,
    roleAssessmentId,
    capabilityId,
    reviewStatus,
    editedCompetencyName:
      body.competencyName ||
      body.name,
    editedEvidence:
      body.evidence,
  });

  const role =
    await getRolePayload(
      roleAssessmentId
    );

  return NextResponse.json(
    {
      success: true,
      role,
      successGates:
        role.successGates,
    }
  );
}

/* ============================================================
   ROLE CONTEXT UPDATE
============================================================ */

async function handleUpdateRole(
  body: any,
  userId: string
) {
  const roleAssessmentId = String(body.roleAssessmentId || "");

  await updateRoleContext({
    userId,
    roleAssessmentId,
    update: {
      organisationName: body.organisation,
      roleTitle: body.roleTitle,
      roleDescription: body.description,
      fromDate: body.fromDate,
      toDate: body.toDate,
      fromDatePrecision: body.fromDatePrecision,
      toDatePrecision: body.toDatePrecision,
      fromDateOriginal: body.fromDateOriginal,
      toDateOriginal: body.toDateOriginal,
      engagementModel: body.engagementType,
      employmentContext: body.employmentType,
    },
  });

  const role = await getRolePayload(roleAssessmentId);

  return NextResponse.json({
    success: true,
    role,
    successGates: role.successGates,
  });
}

/* ============================================================
   SUBMIT ROLE — THIN ROUTE ADAPTER
============================================================ */

async function handleSubmitRole(
  body: any,
  userId: string
) {
  const roleAssessmentId = String(body.roleAssessmentId || "");

  const outcome = await submitRoleForProfile({
    userId,
    roleAssessmentId,
  });

  const role = await getRolePayload(roleAssessmentId);
  const nextRole = outcome.nextRoleAssessmentId
    ? await getRolePayload(outcome.nextRoleAssessmentId)
    : null;

  return NextResponse.json({
    success: true,
    completed: outcome.completed,
    assessmentCompleted: outcome.assessmentCompleted,
    requiresFurtherReview: outcome.requiresFurtherReview,
    message: outcome.message,
    role,
    nextRole,
    successGates: role.successGates,
  });
}

/* ============================================================
   POST
============================================================ */

export async function POST(
  request: Request
) {
  const correlationId =
    getCorrelationId(request);

  try {
    const userId =
      await getAuthenticatedUserId();

    let rawBody: unknown;

    try {
      rawBody =
        await request.json();
    } catch {
      return NextResponse.json(
        {
          error:
            "Invalid JSON request.",
          correlationId,
        },
        {
          status: 400,
          headers: {
            "x-correlation-id":
              correlationId,
          },
        }
      );
    }

    const parsed =
      noCvActionSchema.safeParse(
        rawBody
      );

    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            "Invalid request payload.",
          correlationId,
        },
        {
          status: 400,
          headers: {
            "x-correlation-id":
              correlationId,
          },
        }
      );
    }

    const body =
      parsed.data;

    switch (
      body.action
    ) {
      case "start_manual":
        return withCorrelationId(
          await handleStartManual(
            body,
            userId
          ),
          correlationId
        );

      case "assess_role":
        return withCorrelationId(
          await handleAssessRole(
            body,
            userId
          ),
          correlationId
        );

      case "review_capability":
        return withCorrelationId(
          await handleReviewCapability(
            body,
            userId
          ),
          correlationId
        );

      case "update_role_context":
        return withCorrelationId(
          await handleUpdateRole(
            body,
            userId
          ),
          correlationId
        );

      case "submit_role":
        return withCorrelationId(
          await handleSubmitRole(
            body,
            userId
          ),
          correlationId
        );
    }
  } catch (error) {
    return errorResponse(
      error,
      correlationId
    );
  }
}