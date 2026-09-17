import { createCareerAssessment, createCareerRoleAssessment } from "@/app/lib/career-intelligence/data/assessments";
import { NextResponse } from "next/server";
import mammoth from "mammoth";
import extract from "pdf-extraction";
import { getAuthenticatedUserId } from "@/app/lib/career-intelligence/auth";
import { findCanonicalRole, findCompetency, getRoleCompetencies } from "@/app/lib/career-intelligence/data/repository";
import { addClarificationRound as replaceOpenQuestions, stageCapability } from "@/app/lib/career-intelligence/data/staging";
import { generateValidatedJson } from "@/app/lib/career-intelligence/ai/provider";
import { cvExtractionSchema, gapListSchema } from "@/app/lib/career-intelligence/ai/schemas";
import { getSuccessGates, recordSuccessGate } from "@/app/lib/career-intelligence/success-gates";
import { clamp } from "@/app/lib/career-intelligence/utils";
import { analyseCvActionSchema } from "@/app/lib/career-intelligence/http/request-schemas";
import { errorResponse } from "@/app/lib/career-intelligence/http/error-response";
import { getCorrelationId, withCorrelationId } from "@/app/lib/career-intelligence/http/correlation";
import { reviewRoleCapability } from "@/app/lib/career-intelligence/services/capability-review";
import { transitionRoleLifecycle } from "@/app/lib/career-intelligence/services/role-lifecycle";
import { updateRoleContext } from "@/app/lib/career-intelligence/services/role-context";
import { assessRoleClarifications } from "@/app/lib/career-intelligence/services/clarification";
import { submitRoleForProfile } from "@/app/lib/career-intelligence/services/role-submission";
import { getCvRolePayload } from "@/app/lib/career-intelligence/services/role-snapshot";
import { careerIntelligenceConfig } from "@/app/lib/career-intelligence/config";
import type { DatePrecision, ExtractedCapability, Gap } from "@/app/lib/career-intelligence/types";
import { CAPABILITY_IDENTITY_RULES, EVIDENCE_ASSESSMENT_RULES } from "@/app/lib/career-intelligence/domain/intelligence-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


/* ============================================================
   TYPES
============================================================ */

type ExtractedRole = {
  organisationName: string;
  roleTitle: string;

  fromDate: string;
  toDate: string;

  fromDatePrecision: DatePrecision;
  toDatePrecision: DatePrecision;

  fromDateOriginal: string;
  toDateOriginal: string;

  roleDescription: string;
  engagementModel: string;
  employmentContext: string;

  capabilities: ExtractedCapability[];
};

/* ============================================================
   BASIC HELPERS
============================================================ */






/* ============================================================
   DATE HELPERS
============================================================ */

function monthNumber(
  name: string
) {
  const months: Record<
    string,
    string
  > = {
    jan: "01",
    january: "01",

    feb: "02",
    february: "02",

    mar: "03",
    march: "03",

    apr: "04",
    april: "04",

    may: "05",

    jun: "06",
    june: "06",

    jul: "07",
    july: "07",

    aug: "08",
    august: "08",

    sep: "09",
    sept: "09",
    september: "09",

    oct: "10",
    october: "10",

    nov: "11",
    november: "11",

    dec: "12",
    december: "12",
  };

  return (
    months[
      name.toLowerCase()
    ] || null
  );
}

function normaliseCVDate(
  value: unknown,
  isToDate = false
): {
  date: string;
  precision: DatePrecision;
  original: string;
} {
  if (
    typeof value !==
      "string" ||
    !value.trim()
  ) {
    return {
      date: "",
      precision: "unknown",
      original: "",
    };
  }

  const original =
    value.trim();

  if (
    isToDate &&
    /^(present|current|ongoing|now|today)$/i.test(
      original
    )
  ) {
    return {
      date: "",
      precision: "ongoing",
      original,
    };
  }

  if (
    /^\d{4}-\d{2}-\d{2}$/.test(
      original
    )
  ) {
    return {
      date: original,
      precision: "day",
      original,
    };
  }

  const isoMonth =
    original.match(
      /^(\d{4})-(\d{1,2})$/
    );

  if (isoMonth) {
    return {
      date:
        `${isoMonth[1]}-${isoMonth[2].padStart(
          2,
          "0"
        )}-01`,

      precision: "month",
      original,
    };
  }

  if (
    /^\d{4}$/.test(
      original
    )
  ) {
    return {
      date:
        `${original}-01-01`,

      precision: "year",
      original,
    };
  }

  const monthYear =
    original.match(
      /^([A-Za-z]+)[\s/-]+(\d{4})$/
    );

  if (monthYear) {
    const month =
      monthNumber(
        monthYear[1]
      );

    if (month) {
      return {
        date:
          `${monthYear[2]}-${month}-01`,

        precision: "month",
        original,
      };
    }
  }

  const yearMonthName =
    original.match(
      /^(\d{4})[\s/-]+([A-Za-z]+)$/
    );

  if (yearMonthName) {
    const month =
      monthNumber(
        yearMonthName[2]
      );

    if (month) {
      return {
        date:
          `${yearMonthName[1]}-${month}-01`,

        precision: "month",
        original,
      };
    }
  }

  const parsed =
    new Date(original);

  if (
    !Number.isNaN(
      parsed.getTime()
    )
  ) {
    return {
      date:
        parsed
          .toISOString()
          .slice(0, 10),

      precision: "day",
      original,
    };
  }

  return {
    date: "",
    precision: "unknown",
    original,
  };
}



/* ============================================================
   AUTH
============================================================ */



/* ============================================================
   SUCCESS GATES
============================================================ */







/* ============================================================
   FILE EXTRACTION
============================================================ */

async function extractPdfText(
  buffer: Buffer
) {
  const result =
    await extract(buffer);

  return String(
    result?.text || ""
  ).trim();
}

async function extractDocxText(
  buffer: Buffer
) {
  const result =
    await mammoth.extractRawText(
      {
        buffer,
      }
    );

  return String(
    result.value || ""
  ).trim();
}

/* ============================================================
   AI — CV EXTRACTION
============================================================ */

async function extractCareerHistory(
  cvText: string
): Promise<{
  candidateName: string;
  roles: ExtractedRole[];
}> {
  const prompt = `
You are analysing a CV for Career Intelligence.

Extract the candidate's career history.

${CAPABILITY_IDENTITY_RULES}
${EVIDENCE_ASSESSMENT_RULES}

Return JSON only.

Required structure:

{
  "candidateName": "",
  "roles": [
    {
      "organisationName": "",
      "roleTitle": "",

      "fromDate": "",
      "toDate": "",

      "fromDateOriginal": "",
      "toDateOriginal": "",

      "roleDescription": "",
      "engagementModel": "",
      "employmentContext": "",

      "capabilities": [
        {
          "name": "",
          "evidence": "",
          "confidence": 0.0
        }
      ]
    }
  ]
}

DATE RULES:

- Keep the exact source wording in fromDateOriginal and toDateOriginal.
- Return fromDate and toDate in YYYY-MM-DD format where an exact date is known.
- If only a month and year are supplied, use the first day of that month.
- Example: "March 2020" becomes "2020-03-01".
- If only a year is supplied, use January 1.
- Example: "2018" becomes "2018-01-01".
- If a role is current, present or ongoing:
    toDate must be ""
    toDateOriginal should preserve the CV wording such as "Present".
- Never invent a different month or year.
- Use "" where a date cannot reasonably be determined.

CAPABILITY RULES:

- A capability must be supported by actual career evidence.
- Do not treat a capability keyword by itself as sufficient evidence.
- Evidence should describe what the candidate actually did.
- Keep capability names concise.
- Confidence must be between 0 and 1.
- Do not invent experience not present in the CV.

CV:

${cvText}
`;

  const parsed =
    await generateValidatedJson({
      prompt,
      schema:
        cvExtractionSchema,
    });

  const roles =
    Array.isArray(
      parsed?.roles
    )
      ? parsed.roles
      : [];

  const normalisedRoles:
    ExtractedRole[] =
    roles
      .filter(
        (role: any) =>
          typeof role
            ?.roleTitle ===
            "string" &&
          role.roleTitle.trim()
      )
      .map(
        (role: any) => {
          const from =
            normaliseCVDate(
              role.fromDateOriginal ||
                role.fromDate,
              false
            );

          const to =
            normaliseCVDate(
              role.toDateOriginal ||
                role.toDate,
              true
            );

          const capabilities =
            Array.isArray(
              role.capabilities
            )
              ? role.capabilities
              : [];

          return {
            organisationName:
              typeof role
                .organisationName ===
              "string"
                ? role.organisationName.trim()
                : "",

            roleTitle:
              role.roleTitle.trim(),

            fromDate:
              from.date,

            toDate:
              to.date,

            fromDatePrecision:
              from.precision,

            toDatePrecision:
              to.precision,

            fromDateOriginal:
              from.original,

            toDateOriginal:
              to.original,

            roleDescription:
              typeof role
                .roleDescription ===
              "string"
                ? role.roleDescription.trim()
                : "",

            engagementModel:
              typeof role
                .engagementModel ===
              "string"
                ? role.engagementModel.trim()
                : "",

            employmentContext:
              typeof role
                .employmentContext ===
              "string"
                ? role.employmentContext.trim()
                : "",

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
                          capability.confidence ??
                            0
                        )
                      ),
                  })
                ),
          };
        }
      );

  return {
    candidateName:
      typeof parsed
        ?.candidateName ===
      "string"
        ? parsed.candidateName.trim()
        : "",

    roles:
      normalisedRoles,
  };
}

/* ============================================================
   CANONICAL REPOSITORY LOOKUPS
============================================================ */







function nameMatches(
  left: string,
  right: string
) {
  return (
    left
      .trim()
      .toLowerCase() ===
    right
      .trim()
      .toLowerCase()
  );
}

/* ============================================================
   AI — GAP QUESTIONS
============================================================ */

async function generateQuestionsForExistingRole(
  role: ExtractedRole,
  canonicalRoleId: string
): Promise<Gap[]> {
  const expected =
    await getRoleCompetencies(
      canonicalRoleId
    );

  const gaps =
    expected.filter(
      (competency) =>
        !role.capabilities.some(
          (capability) =>
            nameMatches(
              capability.name,
              String(
                competency.name
              )
            )
        )
    );

  if (
    !gaps.length
  ) {
    return [];
  }

  return gaps.map(
    (competency) => ({
      competency:
        String(
          competency.name
        ),

      reason:
        "This capability is associated with the matched role but sufficient supporting evidence was not identified in the CV.",

      question:
        `Can you describe a specific example from this role where you demonstrated ${String(
          competency.name
        )}? Include what you did and the outcome where possible.`,
    })
  );
}

async function generateQuestionsForNewRole(
  role: ExtractedRole
): Promise<Gap[]> {
  const prompt = `
You are assessing a career role that does not currently match a canonical role in the repository.

Determine whether there are likely role-relevant capability signals that require supporting evidence.

${CAPABILITY_IDENTITY_RULES}
${EVIDENCE_ASSESSMENT_RULES}

Return JSON only:

{
  "gaps": [
    {
      "competency": "",
      "reason": "",
      "question": ""
    }
  ]
}

Rules:

- Only ask where the role description provides a reasonable capability signal.
- Do not ask generic questions unrelated to the supplied role.
- A capability label alone is not enough evidence.
- Questions should ask for specific behavioural or outcome evidence.
- Do not duplicate capabilities already supported by evidence.

Role title:
${role.roleTitle}

Organisation:
${role.organisationName}

Description:
${role.roleDescription}

Already evidenced capabilities:
${JSON.stringify(
  role.capabilities
)}
`;

  const parsed =
    await generateValidatedJson({
      prompt,
      schema:
        gapListSchema,
    });

  const gaps =
    Array.isArray(
      parsed?.gaps
    )
      ? parsed.gaps
      : [];

  return gaps
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
          typeof gap.reason ===
          "string"
            ? gap.reason.trim()
            : "Additional evidence is required.",

        question:
          gap.question.trim(),
      })
    );
}

/* ============================================================
   ASSESSMENT RECORDS
============================================================ */

async function createAssessment(
  userId: string,
  candidateName: string
) {
  return createCareerAssessment({
    userId,
    sourceType: "cv",
    candidateName,
  });
}

async function createRoleAssessment(
  assessmentId: string,
  sequenceNo: number,
  role: ExtractedRole,
  canonicalRoleId: string | null,
  lifecycleStatus:
    | "in_progress"
    | "not_started"
) {
  return createCareerRoleAssessment({
    assessmentId,
    sequenceNo,
    canonicalRoleId,
    lifecycleStatus,
    role,
  });
}

/* ============================================================
   CAPABILITIES
============================================================ */





async function mapCapability(
  capability: ExtractedCapability
) {
  const canonical =
    await findCompetency(
      capability.name
    );

  return {
    competencyId:
      canonical
        ? String(
            canonical.id
          )
        : null,

    name:
      canonical
        ? String(
            canonical.name
          )
        : capability.name,
  };
}

/* ============================================================
   ROLE PAYLOAD
============================================================ */

async function getRolePayload(
  roleAssessmentId: string
) {
  return getCvRolePayload(roleAssessmentId);
}

/* ============================================================
   OWNERSHIP
============================================================ */



/* ============================================================
   CV UPLOAD
============================================================ */

async function handleCVUpload(
  request: Request,
  userId: string
) {
  const formData =
    await request.formData();

  const file =
    formData.get("cv");

  if (
    !(file instanceof File)
  ) {
    return NextResponse.json(
      {
        error:
          "A CV file is required.",
      },
      {
        status: 400,
      }
    );
  }

  const lowerName =
    file.name.toLowerCase();

  if (
    file.size >
    careerIntelligenceConfig.maxCvFileBytes
  ) {
    return NextResponse.json(
      {
        error:
          "The CV file exceeds the permitted size limit.",
      },
      {
        status: 413,
      }
    );
  }

  const allowedMimeTypes =
    new Set([
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "",
    ]);

  if (
    !allowedMimeTypes.has(
      file.type
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Only PDF and DOCX files are supported.",
      },
      {
        status: 400,
      }
    );
  }

  if (
    !lowerName.endsWith(
      ".pdf"
    ) &&
    !lowerName.endsWith(
      ".docx"
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Only PDF and DOCX files are supported.",
      },
      {
        status: 400,
      }
    );
  }

  const buffer =
    Buffer.from(
      await file.arrayBuffer()
    );

  const cvText =
    lowerName.endsWith(
      ".pdf"
    )
      ? await extractPdfText(
          buffer
        )
      : await extractDocxText(
          buffer
        );

  if (
    !cvText.trim()
  ) {
    return NextResponse.json(
      {
        error:
          "No readable text was found in the CV.",
      },
      {
        status: 400,
      }
    );
  }

  if (
    cvText.length >
    careerIntelligenceConfig.maxCvTextChars
  ) {
    return NextResponse.json(
      {
        error:
          "The CV contains more text than can be processed safely.",
      },
      {
        status: 413,
      }
    );
  }

  const extracted =
    await extractCareerHistory(
      cvText
    );

  if (
    !extracted.roles.length
  ) {
    return NextResponse.json(
      {
        error:
          "No career roles could be identified from the CV.",
      },
      {
        status: 400,
      }
    );
  }

  const assessmentId =
    await createAssessment(
      userId,
      extracted.candidateName
    );

  await recordSuccessGate({
    assessmentId,
    gateKey:
      "assessment_started",
    metadata: {
      sourceType: "cv",
    },
  });

  await recordSuccessGate({
    assessmentId,
    gateKey:
      "cv_uploaded",
    metadata: {
      filename:
        file.name,
    },
  });

  await recordSuccessGate({
    assessmentId,
    gateKey:
      "cv_text_extracted",
  });

  await recordSuccessGate({
    assessmentId,
    gateKey:
      "roles_identified",
    metadata: {
      count:
        extracted.roles.length,
    },
  });

  const createdRoles: any[] =
    [];

  for (
    let index = 0;
    index <
    extracted.roles.length;
    index++
  ) {
    const extractedRole =
      extracted.roles[index];

    const canonicalRole =
      await findCanonicalRole(
        extractedRole.roleTitle
      );

    const roleAssessmentId =
      await createRoleAssessment(
        assessmentId,
        index + 1,
        extractedRole,
        canonicalRole
          ? String(
              canonicalRole.id
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
        matchedCanonicalRole:
          Boolean(
            canonicalRole
          ),
      },
    });

    for (
      const capability of
      extractedRole.capabilities
    ) {
      const mapped =
        await mapCapability(
          capability
        );

      await stageCapability(
        {
          roleAssessmentId,

          competencyId:
            mapped.competencyId,

          name:
            mapped.name,

          sourceType:
            "cv",

          sourceSection:
            extractedRole.roleTitle,

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

    const gaps =
      canonicalRole
        ? await generateQuestionsForExistingRole(
            extractedRole,
            String(
              canonicalRole.id
            )
          )
        : await generateQuestionsForNewRole(
            extractedRole
          );

    await replaceOpenQuestions(
      roleAssessmentId,
      gaps
    );

    /*
     * First role can be review_ready immediately
     * if no clarification is required.
     */
    if (
      index === 0 &&
      !gaps.length
    ) {
      await transitionRoleLifecycle({
        roleAssessmentId,
        to: "review_ready",
      });

      await recordSuccessGate(
        {
          assessmentId,
          roleAssessmentId,
          gateKey:
            "clarification_completed",
        }
      );
    }

    await recordSuccessGate({
      assessmentId,
      roleAssessmentId,
      gateKey:
        "role_analysis_completed",
      metadata: {
        initialCapabilities:
          extractedRole
            .capabilities
            .length,

        clarificationQuestions:
          gaps.length,
      },
    });

    createdRoles.push(
      await getRolePayload(
        roleAssessmentId
      )
    );
  }

  const assessmentGates =
    await getSuccessGates(
      assessmentId
    );

  return NextResponse.json(
    {
      success: true,
      assessmentId,
      candidateName:
        extracted.candidateName,
      roles:
        createdRoles,
      successGates:
        assessmentGates,
    }
  );
}

/* ============================================================
   CLARIFICATION EVALUATION
============================================================ */

async function handleAssessRole(
  body: any,
  userId: string
) {
  const roleAssessmentId = String(body.roleAssessmentId || "");

  await assessRoleClarifications({
    userId,
    roleAssessmentId,
    answers: body.questions.map((item: any) => ({
      questionId: String(item.gapId || ""),
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
      body.competencyName,
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
   UPDATE ROLE CONTEXT
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
      organisationName: body.organisationName,
      roleTitle: body.roleTitle,
      roleDescription: body.roleDescription,
      fromDate: body.fromDate,
      toDate: body.toDate,
      fromDatePrecision: body.fromDatePrecision,
      toDatePrecision: body.toDatePrecision,
      fromDateOriginal: body.fromDateOriginal,
      toDateOriginal: body.toDateOriginal,
      engagementModel: body.engagementModel,
      employmentContext: body.employmentContext,
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

    const contentType =
      request.headers.get(
        "content-type"
      ) || "";

    /*
     * Multipart = CV upload.
     */
    if (
      contentType.includes(
        "multipart/form-data"
      )
    ) {
      return withCorrelationId(
        await handleCVUpload(
          request,
          userId
        ),
        correlationId
      );
    }

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
      analyseCvActionSchema.safeParse(
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