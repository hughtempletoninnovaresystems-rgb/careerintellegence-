import { createCareerAssessment, createCareerRoleAssessment } from "@/app/lib/career-intelligence/data/assessments";
import { NextResponse } from "next/server";
import mammoth from "mammoth";
import extract from "pdf-extraction";
import { getAuthenticatedUserId } from "@/app/lib/career-intelligence/auth";
import { findCanonicalRole, findCompetency, getRoleCompetencies, verifyRoleOwnership } from "@/app/lib/career-intelligence/data/repository";
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
import { sql } from "@vercel/postgres";
import { z } from "zod";

import { CareerIntelligenceError } from "@/app/lib/career-intelligence/errors";

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

const editedCapabilityReassessmentSchema = z.object({
  outcome: z.enum([
    "demonstrated",
    "needs_clarification",
    "clarify",
    "gap",
  ]),

  evidence: z
    .string()
    .min(1),

  confidence: z
    .number()
    .min(0)
    .max(1),

  clarification: z
    .object({
      reason: z
        .string()
        .default(
          "Additional evidence is required."
        ),

      question: z
        .string()
        .min(1),
    })
    .nullable()
    .optional(),

  emergingCapabilities: z
    .array(
      z.object({
        name: z
          .string()
          .min(1),

        evidence: z
          .string()
          .min(1),

        confidence: z
          .number()
          .min(0)
          .max(1),
      })
    )
    .default([]),
});


function normaliseCapabilityIdentity(
  value: string
) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(
      /[^\p{L}\p{N}]+/gu,
      " "
    )
    .trim();
}


async function reassessEditedCapability({
  userId,
  roleAssessmentId,
  capabilityId,
  editedCompetencyName,
  editedEvidence,
}: {
  userId: string;
  roleAssessmentId: string;
  capabilityId: string;
  editedCompetencyName:
    | string
    | null
    | undefined;
  editedEvidence:
    | string
    | null
    | undefined;
}) {
  const competencyName =
    String(
      editedCompetencyName ||
        ""
    ).trim();

  const evidence =
    String(
      editedEvidence ||
        ""
    ).trim();

  if (!competencyName) {
    throw new CareerIntelligenceError(
      "Capability name is required when editing.",
      {
        status: 400,
        code:
          "edited_capability_name_required",
        expose: true,
      }
    );
  }

  if (!evidence) {
    throw new CareerIntelligenceError(
      "Capability evidence is required when editing.",
      {
        status: 400,
        code:
          "edited_capability_evidence_required",
        expose: true,
      }
    );
  }

  /*
   * Verify ownership before reading or
   * reassessing any role intelligence.
   */
  const assessmentId =
    await verifyRoleOwnership(
      roleAssessmentId,
      userId
    );

  /*
   * Ensure that the capability belongs to
   * this role before spending an AI call.
   */
  const existingCapability =
    await sql`
      SELECT id
      FROM career_role_capabilities
      WHERE id = ${capabilityId}
        AND role_assessment_id =
          ${roleAssessmentId}
      LIMIT 1
    `;

  if (
    !existingCapability
      .rows.length
  ) {
    throw new CareerIntelligenceError(
      "Capability not found.",
      {
        status: 404,
        code:
          "capability_not_found",
        expose: true,
      }
    );
  }

  const role =
    await getRolePayload(
      roleAssessmentId
    );

  const roleTitle =
    String(
      role?.roleTitle ||
        ""
    ).trim();

  /*
   * Candidate edit = new intelligence.
   *
   * It must be reassessed independently
   * rather than inheriting the previous
   * demonstrated state.
   */
  const reassessment =
    await generateValidatedJson({
      schema:
        editedCapabilityReassessmentSchema,

      prompt: `
You are GIAS reassessing candidate-edited capability evidence.

A candidate has edited previously assessed career intelligence.
The edit is new intelligence and MUST be reassessed from the evidence supplied below.
Do not preserve or infer the previous assessment outcome.

${CAPABILITY_IDENTITY_RULES}

${EVIDENCE_ASSESSMENT_RULES}

CANDIDATE-OWNED EVIDENCE RULE:
- Write evidence in first-person candidate voice (for example, "I diagnosed...", not "The candidate diagnosed...").
- Do not introduce "the candidate", "they", "he" or "she" unless reproducing an attributable third-party source.
- Improve clarity only; do not alter ownership, scope, certainty, strength or substantive meaning of the source evidence.
- Never invent evidence.

Return JSON only:

{
  "outcome": "demonstrated | needs_clarification | gap",
  "evidence": "",
  "confidence": 0.0,
  "clarification": {
    "reason": "",
    "question": ""
  },
  "emergingCapabilities": [
    {
      "name": "",
      "evidence": "",
      "confidence": 0.0
    }
  ]
}

ASSESSMENT RULES:

- "demonstrated":
  The edited evidence directly supports the edited capability.
  Return a faithful first-person evidence statement and confidence.

- "needs_clarification":
  There is a plausible capability signal, but the supplied evidence is not yet sufficient to classify it as demonstrated or as an assessed gap.
  Return ONE focused clarification question asking only for the missing evidence.

- "gap":
  The evidence does not establish the edited capability and further clarification would not reasonably resolve the supplied evidence as demonstrated.
  Do not treat it as demonstrated.

- emergingCapabilities may contain ONLY capabilities independently evidenced by the supplied edit.
- Do not create an emerging capability merely by renaming, decomposing or rephrasing the edited capability.
- Each emerging capability must have its own independently sufficient evidence.
- Do not duplicate the edited capability.
- Do not invent experience.
- Confidence must be between 0 and 1.

Role title:
${roleTitle}

Edited capability:
${competencyName}

Candidate-edited evidence:
${evidence}
`,
    });

  const outcome =
    reassessment.outcome ===
    "clarify"
      ? "needs_clarification"
      : reassessment.outcome;

  const assessedEvidence =
    reassessment
      .evidence
      .trim();

  const confidence =
    clamp(
      Number(
        reassessment.confidence
      )
    );

  /*
   * Resolve the edited identity separately
   * from evidence assessment.
   */
  const canonical =
    await findCompetency(
      competencyName
    );

  const canonicalCompetencyId =
    canonical
      ? String(
          canonical.id
        )
      : null;

  /*
   * AUTHORITATIVE CAPABILITY WRITE
   *
   * This MUST happen before success-gate
   * metadata is recorded.
   */
  if (
    outcome ===
    "demonstrated"
  ) {
    await sql`
      UPDATE career_role_capabilities
      SET
        edited_competency_name =
          ${competencyName},
        edited_evidence =
          ${evidence},
        canonical_competency_id =
          ${canonicalCompetencyId},
        evidence =
          ${assessedEvidence},
        ai_confidence =
          ${confidence},
        demonstrated = TRUE,
        capability_status =
          'demonstrated',
        assessment_status =
          'assessed',
        review_status =
          'proposed',
        updated_at = NOW()
      WHERE id =
        ${capabilityId}
        AND role_assessment_id =
          ${roleAssessmentId}
    `;
  } else if (
    outcome ===
    "needs_clarification"
  ) {
    await sql`
      UPDATE career_role_capabilities
      SET
        edited_competency_name =
          ${competencyName},
        edited_evidence =
          ${evidence},
        canonical_competency_id =
          ${canonicalCompetencyId},
        assessment_status =
          'needs_clarification',
        review_status =
          'proposed',
        updated_at = NOW()
      WHERE id =
        ${capabilityId}
        AND role_assessment_id =
          ${roleAssessmentId}
    `;

    const clarification =
      reassessment.clarification;

    if (
      !clarification
        ?.question
        ?.trim()
    ) {
      throw new Error(
        "GIAS reassessment returned needs_clarification without a clarification question."
      );
    }

    await replaceOpenQuestions(
      roleAssessmentId,
      [
        {
          competency:
            competencyName,

          reason:
            clarification
              .reason
              ?.trim() ||
            "Additional evidence is required.",

          question:
            clarification
              .question
              .trim(),
        },
      ]
    );

    await transitionRoleLifecycle({
      roleAssessmentId,
      to: "in_progress",
    });
  } else {
    /*
     * Approved CR-001 gap behaviour:
     *
     * - assessed
     * - explicitly non-demonstrated
     * - resolved as an accepted gap
     *
     * It can therefore never satisfy
     * demonstrated-capability promotion.
     */
    await sql`
      UPDATE career_role_capabilities
      SET
        edited_competency_name =
          ${competencyName},
        edited_evidence =
          ${evidence},
        canonical_competency_id =
          ${canonicalCompetencyId},
        evidence =
          ${assessedEvidence},
        ai_confidence =
          ${confidence},
        demonstrated = FALSE,
        capability_status =
          'gap',
        assessment_status =
          'assessed',
        review_status =
          'accepted',
        updated_at = NOW()
      WHERE id =
        ${capabilityId}
        AND role_assessment_id =
          ${roleAssessmentId}
    `;
  }

  /*
   * Stage genuinely independent emerging
   * intelligence.
   *
   * Read identities AFTER the authoritative
   * row above has been written so that the
   * edited identity itself participates in
   * de-duplication.
   */
  const existingIdentities =
    await sql`
      SELECT
        canonical_competency_id,
        proposed_competency_name,
        edited_competency_name
      FROM career_role_capabilities
      WHERE role_assessment_id =
        ${roleAssessmentId}
    `;

  const canonicalIds =
    new Set<string>();

  const names =
    new Set<string>();

  for (
    const row of
    existingIdentities.rows
  ) {
    if (
      row
        .canonical_competency_id
    ) {
      canonicalIds.add(
        String(
          row
            .canonical_competency_id
        )
      );
    }

    const proposedName =
      String(
        row
          .proposed_competency_name ||
          ""
      ).trim();

    const editedName =
      String(
        row
          .edited_competency_name ||
          ""
      ).trim();

    if (proposedName) {
      names.add(
        normaliseCapabilityIdentity(
          proposedName
        )
      );
    }

    if (editedName) {
      names.add(
        normaliseCapabilityIdentity(
          editedName
        )
      );
    }
  }

  let emergingCapabilitiesStaged =
    0;

  for (
    const emerging of
    reassessment
      .emergingCapabilities
  ) {
    const emergingName =
      emerging.name.trim();

    const emergingEvidence =
      emerging.evidence.trim();

    if (
      !emergingName ||
      !emergingEvidence
    ) {
      continue;
    }

    const emergingCanonical =
      await findCompetency(
        emergingName
      );

    const emergingCanonicalId =
      emergingCanonical
        ? String(
            emergingCanonical.id
          )
        : null;

    const stagedName =
      emergingCanonical
        ? String(
            emergingCanonical.name
          )
        : emergingName;

    const normalisedOriginalName =
      normaliseCapabilityIdentity(
        emergingName
      );

    const normalisedStagedName =
      normaliseCapabilityIdentity(
        stagedName
      );

    if (
      (
        emergingCanonicalId &&
        canonicalIds.has(
          emergingCanonicalId
        )
      ) ||
      names.has(
        normalisedOriginalName
      ) ||
      names.has(
        normalisedStagedName
      )
    ) {
      continue;
    }

    await stageCapability({
      roleAssessmentId,

      competencyId:
        emergingCanonicalId,

      name:
        stagedName,

      sourceType:
        "assessment",

      sourceSection:
        roleTitle,

      evidence:
        emergingEvidence,

      confidence:
        clamp(
          Number(
            emerging.confidence
          )
        ),

      demonstrated:
        true,

      capabilityStatus:
        "demonstrated",

      assessmentStatus:
        "assessed",
    });

    if (
      emergingCanonicalId
    ) {
      canonicalIds.add(
        emergingCanonicalId
      );
    }

    names.add(
      normalisedOriginalName
    );

    names.add(
      normalisedStagedName
    );

    emergingCapabilitiesStaged++;
  }

  /*
   * Success-gate metadata comes only AFTER
   * the authoritative reassessment state
   * has been persisted.
   */
  await recordSuccessGate({
    assessmentId,
    roleAssessmentId,

    gateKey:
      "capability_review_completed",

    metadata: {
      capabilityId,
      reviewStatus:
        "edited",
      reassessmentOutcome:
        outcome,
      emergingCapabilitiesStaged,
    },
  });

  /*
   * Mirror the accepted/rejected review
   * service behaviour.
   *
   * A demonstrated reassessment remains
   * proposed, so it will keep this count
   * above zero until the candidate makes
   * the subsequent Accept/Reject decision.
   */
  const remainingReview =
    await sql`
      SELECT
        COUNT(*)::int AS count
      FROM career_role_capabilities
      WHERE role_assessment_id =
        ${roleAssessmentId}
        AND demonstrated = TRUE
        AND capability_status =
          'demonstrated'
        AND review_status =
          'proposed'
    `;

  const remainingCount =
    Number(
      remainingReview
        .rows[0]
        ?.count ||
        0
    );

  if (
    remainingCount === 0
  ) {
    await recordSuccessGate({
      assessmentId,
      roleAssessmentId,

      gateKey:
        "all_demonstrated_capabilities_reviewed",
    });
  }
}

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

  if (
    reviewStatus ===
    "edited"
  ) {
    await reassessEditedCapability({
      userId,
      roleAssessmentId,
      capabilityId,

      editedCompetencyName:
        body.competencyName,

      editedEvidence:
        body.evidence,
    });
  } else {
    /*
     * Accepted/rejected retain the
     * existing direct review-state path.
     */
    await reviewRoleCapability({
      userId,
      roleAssessmentId,
      capabilityId,
      reviewStatus,
    });
  }

  const role =
    await getRolePayload(
      roleAssessmentId
    );

  return NextResponse.json({
    success: true,
    role,
    successGates:
      role.successGates,
  });
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