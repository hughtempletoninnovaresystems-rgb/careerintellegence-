import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { sql } from "@vercel/postgres";
import { auth } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = "gemini-3.6-flash";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!,
});

/* ============================================================
   TYPES
============================================================ */

type ReviewStatus =
  | "proposed"
  | "accepted"
  | "edited"
  | "rejected";

type CapabilityStatus =
  | "demonstrated"
  | "gap";

type AssessmentStatus =
  | "proposed"
  | "needs_clarification"
  | "assessed";

type DatePrecision =
  | "day"
  | "month"
  | "year"
  | "ongoing"
  | "unknown";

type ExtractedCapability = {
  name: string;
  evidence: string;
  confidence: number;
};

type Gap = {
  competency: string;
  reason: string;
  question: string;
};

type Evaluation = {
  questionId: string;
  competency: string;

  status:
    | "demonstrated"
    | "gap"
    | "needs_clarification";

  evidence: string;
  confidence: number;

  followUpQuestion?: string;
  followUpReason?: string;

  emergingCapabilities?: ExtractedCapability[];
};

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

function cleanJson(
  value: string
) {
  return value
    .replace(
      /^```json\s*/i,
      ""
    )
    .replace(
      /^```\s*/i,
      ""
    )
    .replace(
      /\s*```$/i,
      ""
    )
    .trim();
}

function clamp(
  value: number,
  min = 0,
  max = 1
) {
  return Math.max(
    min,
    Math.min(
      max,
      value
    )
  );
}

function geminiText(
  response: any
) {
  if (
    typeof response?.text ===
    "string"
  ) {
    return response.text;
  }

  if (
    typeof response?.text ===
    "function"
  ) {
    return response.text();
  }

  return "";
}

function formatDateForInput(
  value: unknown
) {
  if (!value) {
    return "";
  }

  if (
    typeof value ===
    "string"
  ) {
    const match =
      value.match(
        /^(\d{4}-\d{2}-\d{2})/
      );

    if (match) {
      return match[1];
    }
  }

  const date =
    value instanceof Date
      ? value
      : new Date(
          String(value)
        );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "";
  }

  return date
    .toISOString()
    .slice(0, 10);
}

/* ============================================================
   AUTH
============================================================ */

async function getAuthenticatedUserId() {
  const session =
    await auth();

  const email =
    session?.user?.email;

  if (!email) {
    throw new Error(
      "Not authenticated."
    );
  }

  const result =
    await sql`
      SELECT id
      FROM users
      WHERE email=${email}
      LIMIT 1
    `;

  if (
    !result.rows.length
  ) {
    throw new Error(
      "Authenticated user was not found."
    );
  }

  return String(
    result.rows[0].id
  );
}

/* ============================================================
   SUCCESS GATES
============================================================ */

async function recordSuccessGate({
  assessmentId,
  roleAssessmentId = null,
  gateKey,
  metadata = {},
}: {
  assessmentId: string;
  roleAssessmentId?: string | null;
  gateKey: string;
  metadata?: Record<
    string,
    unknown
  >;
}) {
  try {
    const scopeKey =
      roleAssessmentId
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
        CAST(
          ${JSON.stringify(
            metadata
          )}
          AS jsonb
        ),
        NOW(),
        NOW(),
        NOW()
      )
      ON CONFLICT (
        scope_key,
        gate_key
      )
      DO UPDATE SET
        status='achieved',
        metadata=
          EXCLUDED.metadata,
        achieved_at=
          NOW(),
        updated_at=
          NOW()
    `;
  } catch (error) {
    console.error(
      "Unable to record success gate:",
      gateKey,
      error
    );
  }
}

async function getSuccessGates(
  assessmentId: string,
  roleAssessmentId?: string
) {
  const result =
    roleAssessmentId
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
          WHERE
            assessment_id=
              ${assessmentId}
            AND
            role_assessment_id=
              ${roleAssessmentId}
          ORDER BY
            achieved_at,
            id
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
          WHERE
            assessment_id=
              ${assessmentId}
            AND
            role_assessment_id
              IS NULL
          ORDER BY
            achieved_at,
            id
        `;

  return result.rows.map(
    (row) => ({
      id:
        String(
          row.id
        ),

      assessmentId:
        String(
          row.assessment_id
        ),

      roleAssessmentId:
        row.role_assessment_id
          ? String(
              row.role_assessment_id
            )
          : null,

      scopeKey:
        String(
          row.scope_key
        ),

      gateKey:
        String(
          row.gate_key
        ),

      status:
        String(
          row.status
        ),

      metadata:
        row.metadata || {},

      achievedAt:
        row.achieved_at
          ? new Date(
              row.achieved_at
            ).toISOString()
          : "",
    })
  );
}

/* ============================================================
   REPOSITORY
============================================================ */

async function findCanonicalRole(
  roleTitle: string
) {
  const result =
    await sql`
      SELECT
        id,
        name,
        job_title,
        description,
        lifecycle_status
      FROM roles
      WHERE
        LOWER(name)=
          LOWER(${roleTitle})
        OR
        LOWER(job_title)=
          LOWER(${roleTitle})
      LIMIT 1
    `;

  return (
    result.rows[0] ||
    null
  );
}

async function findCompetency(
  name: string
) {
  const result =
    await sql`
      SELECT
        id,
        name,
        lifecycle_status
      FROM competencies
      WHERE
        LOWER(name)=
          LOWER(${name})
      LIMIT 1
    `;

  return (
    result.rows[0] ||
    null
  );
}

async function getRoleCompetencies(
  roleId: string
) {
  const result =
    await sql`
      SELECT
        c.id,
        c.name,
        rc.importance
      FROM role_competencies rc
      INNER JOIN competencies c
        ON c.id=
          rc.competency_id
      WHERE
        rc.role_id=
          ${roleId}
        AND
        COALESCE(
          rc.lifecycle_status,
          'approved'
        ) <> 'rejected'
      ORDER BY
        rc.importance DESC NULLS LAST,
        c.name
    `;

  return result.rows;
}

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

  const response =
    await ai.models.generateContent(
      {
        model: MODEL,
        contents: prompt,
      }
    );

  const parsed =
    JSON.parse(
      cleanJson(
        geminiText(
          response
        )
      )
    );

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
  const result =
    await sql`
      INSERT INTO career_assessments (
        user_id,
        source_type,
        status,
        updated_at
      )
      VALUES (
        ${userId},
        'manual',
        'in_progress',
        NOW()
      )
      RETURNING id
    `;

  return String(
    result.rows[0].id
  );
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
  const current =
    role.toDatePrecision ===
    "ongoing";

  const result =
    await sql`
      INSERT INTO career_role_assessments (
        assessment_id,
        sequence_no,
        canonical_role_id,
        organisation_name,
        proposed_role_title,

        from_date,
        to_date,

        from_date_precision,
        to_date_precision,

        from_date_original,
        to_date_original,

        role_description,
        engagement_model,
        employment_context,
        lifecycle_status,
        updated_at
      )
      VALUES (
        ${assessmentId},
        ${sequenceNo},
        ${canonicalRoleId},
        ${role.organisation},
        ${role.roleTitle},

        ${role.fromDate || null},

        ${
          current
            ? null
            : role.toDate ||
              null
        },

        ${
          role.fromDatePrecision ||
          (
            role.fromDate
              ? 'day'
              : 'unknown'
          )
        },

        ${
          current
            ? 'ongoing'
            : role.toDatePrecision ||
              (
                role.toDate
                  ? 'day'
                  : 'unknown'
              )
        },

        ${
          role.fromDateOriginal ||
          role.fromDate ||
          null
        },

        ${
          current
            ? 'Present'
            : role.toDateOriginal ||
              role.toDate ||
              null
        },

        ${role.description},
        ${role.engagementType || null},
        ${role.employmentType || null},
        ${lifecycleStatus},
        NOW()
      )
      RETURNING id
    `;

  return String(
    result.rows[0].id
  );
}

/* ============================================================
   CAPABILITIES / QUESTIONS
============================================================ */

async function stageCapability({
  roleAssessmentId,
  competencyId = null,
  name,
  sourceType,
  evidence,
  confidence,
  demonstrated,
  capabilityStatus,
  assessmentStatus,
}: {
  roleAssessmentId: string;
  competencyId?: string | null;
  name: string;
  sourceType: string;
  evidence: string;
  confidence: number;
  demonstrated: boolean;
  capabilityStatus: CapabilityStatus;
  assessmentStatus: AssessmentStatus;
}) {
  await sql`
    INSERT INTO career_role_capabilities (
      role_assessment_id,
      canonical_competency_id,
      proposed_competency_name,
      source_type,
      evidence,
      ai_confidence,
      demonstrated,
      capability_status,
      assessment_status,
      review_status,
      created_at,
      updated_at
    )
    VALUES (
      ${roleAssessmentId},
      ${competencyId},
      ${name},
      ${sourceType},
      ${evidence || null},
      ${clamp(confidence)},
      ${demonstrated},
      ${capabilityStatus},
      ${assessmentStatus},
      'proposed',
      NOW(),
      NOW()
    )
  `;
}

async function replaceOpenQuestions(
  roleAssessmentId: string,
  gaps: Gap[]
) {
  if (
    !gaps.length
  ) {
    return;
  }

  const roundResult =
    await sql`
      SELECT
        COALESCE(
          MAX(round_no),
          0
        ) AS max_round
      FROM career_role_questions
      WHERE role_assessment_id=
        ${roleAssessmentId}
    `;

  const roundNo =
    Number(
      roundResult.rows[0]
        ?.max_round || 0
    ) + 1;

  for (
    const gap of gaps
  ) {
    await sql`
      INSERT INTO career_role_questions (
        role_assessment_id,
        round_no,
        competency,
        reason,
        question,
        status,
        created_at,
        updated_at
      )
      VALUES (
        ${roleAssessmentId},
        ${roundNo},
        ${gap.competency},
        ${gap.reason},
        ${gap.question},
        'open',
        NOW(),
        NOW()
      )
    `;
  }
}

/* ============================================================
   ROLE PAYLOAD
============================================================ */

async function getRolePayload(
  roleAssessmentId: string
) {
  const roleResult =
    await sql`
      SELECT *
      FROM career_role_assessments
      WHERE id=
        ${roleAssessmentId}
      LIMIT 1
    `;

  if (
    !roleResult.rows.length
  ) {
    throw new Error(
      "Role assessment not found."
    );
  }

  const role =
    roleResult.rows[0];

  const capabilities =
    await sql`
      SELECT
        crc.*,
        c.name AS canonical_name
      FROM career_role_capabilities crc
      LEFT JOIN competencies c
        ON c.id=
          crc.canonical_competency_id
      WHERE
        crc.role_assessment_id=
          ${roleAssessmentId}
      ORDER BY
        crc.created_at,
        crc.id
    `;

  const questions =
    await sql`
      SELECT
        q.id,
        q.competency,
        q.reason,
        q.question,
        q.status,
        q.round_no,

        (
          SELECT
            a.answer
          FROM career_role_answers a
          WHERE
            a.question_id=
              q.id
          ORDER BY
            a.created_at DESC
          LIMIT 1
        ) AS answer,

        CASE
          WHEN q.status='answered'
          THEN q.updated_at
          ELSE NULL
        END AS answered_at

      FROM career_role_questions q

      WHERE
        q.role_assessment_id=
          ${roleAssessmentId}

      ORDER BY
        q.round_no,
        q.created_at,
        q.id
    `;

  const assessmentId =
    String(
      role.assessment_id
    );

  const successGates =
    await getSuccessGates(
      assessmentId,
      roleAssessmentId
    );

  return {
    id:
      String(
        role.id
      ),

    assessmentId,

    roleIndex:
      Number(
        role.sequence_no
      ),

    canonicalRoleId:
      role.canonical_role_id
        ? String(
            role.canonical_role_id
          )
        : null,

    organisation:
      String(
        role.organisation_name ||
          ""
      ),

    roleTitle:
      String(
        role.proposed_role_title ||
          ""
      ),

    fromDate:
      formatDateForInput(
        role.from_date
      ),

    toDate:
      role.to_date_precision ===
      "ongoing"
        ? ""
        : formatDateForInput(
            role.to_date
          ),

    fromDatePrecision:
      role.from_date_precision
        ? String(
            role.from_date_precision
          )
        : null,

    toDatePrecision:
      role.to_date_precision
        ? String(
            role.to_date_precision
          )
        : null,

    fromDateOriginal:
      role.from_date_original
        ? String(
            role.from_date_original
          )
        : null,

    toDateOriginal:
      role.to_date_original
        ? String(
            role.to_date_original
          )
        : null,

    description:
      String(
        role.role_description ||
          ""
      ),

    engagementType:
      String(
        role.engagement_model ||
          ""
      ),

    employmentType:
      String(
        role.employment_context ||
          ""
      ),

    lifecycleStatus:
      String(
        role.lifecycle_status ||
          ""
      ),

    capabilities:
      capabilities.rows.map(
        (capability) => ({
          id:
            String(
              capability.id
            ),

          competencyId:
            capability.canonical_competency_id
              ? String(
                  capability.canonical_competency_id
                )
              : null,

          name:
            String(
              capability.canonical_name ||
                capability.proposed_competency_name ||
                ""
            ),

          evidence:
            String(
              capability.evidence ||
                ""
            ),

          confidence:
            Number(
              capability.ai_confidence ||
                0
            ),

          capabilityStatus:
            String(
              capability.capability_status
            ),

          assessmentStatus:
            String(
              capability.assessment_status
            ),

          reviewStatus:
            String(
              capability.review_status
            ),

          editedName:
            capability.edited_competency_name
              ? String(
                  capability.edited_competency_name
                )
              : null,

          editedEvidence:
            capability.edited_evidence
              ? String(
                  capability.edited_evidence
                )
              : null,

          source:
            String(
              capability.source_type ||
                ""
            ),
        })
      ),

    questions:
      questions.rows.map(
        (question) => ({
          id:
            String(
              question.id
            ),

          capability:
            String(
              question.competency ||
                ""
            ),

          question:
            String(
              question.question ||
                ""
            ),

          reason:
            String(
              question.reason ||
                ""
            ),

          answer:
            question.answer
              ? String(
                  question.answer
                )
              : null,

          answeredAt:
            question.answered_at
              ? new Date(
                  question.answered_at
                ).toISOString()
              : null,
        })
      ),

    successGates,
  };
}

/* ============================================================
   OWNERSHIP
============================================================ */

async function verifyRoleOwnership(
  roleAssessmentId: string,
  userId: string
) {
  const result =
    await sql`
      SELECT
        cra.assessment_id
      FROM career_role_assessments cra
      INNER JOIN career_assessments ca
        ON ca.id=
          cra.assessment_id
      WHERE
        cra.id=
          ${roleAssessmentId}
        AND
        ca.user_id=
          ${userId}
      LIMIT 1
    `;

  if (
    !result.rows.length
  ) {
    throw new Error(
      "Role assessment not found."
    );
  }

  return String(
    result.rows[0]
      .assessment_id
  );
}

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
      await sql`
        UPDATE career_role_assessments
        SET
          lifecycle_status=
            'review_ready',
          updated_at=NOW()
        WHERE id=
          ${roleAssessmentId}
      `;

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

async function evaluateAnswers(
  role: any,
  answers: any[]
): Promise<Evaluation[]> {
  const prompt = `
Evaluate candidate clarification evidence.

Return JSON only:

{
  "evaluations": [
    {
      "questionId": "",
      "competency": "",
      "status": "demonstrated | gap | needs_clarification",
      "evidence": "",
      "confidence": 0.0,
      "followUpQuestion": "",
      "followUpReason": "",
      "emergingCapabilities": [
        {
          "name": "",
          "evidence": "",
          "confidence": 0.0
        }
      ]
    }
  ]
}

Rules:

- Demonstrated requires evidence of what the candidate actually did.
- A capability keyword alone is insufficient.
- A new signal may reveal an additional capability.
- If the new signal lacks evidence, return a follow-up clarification.
- Do not invent evidence.
- Confidence must be 0 to 1.

Role:
${JSON.stringify(
  role
)}

Answers:
${JSON.stringify(
  answers
)}
`;

  const response =
    await ai.models.generateContent(
      {
        model: MODEL,
        contents: prompt,
      }
    );

  const parsed =
    JSON.parse(
      cleanJson(
        geminiText(
          response
        )
      )
    );

  const evaluations =
    Array.isArray(
      parsed?.evaluations
    )
      ? parsed.evaluations
      : [];

  return evaluations.map(
    (evaluation: any) => ({
      questionId:
        String(
          evaluation.questionId ||
            ""
        ),

      competency:
        String(
          evaluation.competency ||
            ""
        ),

      status:
        [
          "demonstrated",
          "gap",
          "needs_clarification",
        ].includes(
          evaluation.status
        )
          ? evaluation.status
          : "needs_clarification",

      evidence:
        String(
          evaluation.evidence ||
            ""
        ),

      confidence:
        clamp(
          Number(
            evaluation.confidence ||
              0
          )
        ),

      followUpQuestion:
        evaluation.followUpQuestion ||
        undefined,

      followUpReason:
        evaluation.followUpReason ||
        undefined,

      emergingCapabilities:
        Array.isArray(
          evaluation
            .emergingCapabilities
        )
          ? evaluation
              .emergingCapabilities
              .map(
                (
                  item: any
                ) => ({
                  name:
                    String(
                      item.name ||
                        ""
                    ).trim(),

                  evidence:
                    String(
                      item.evidence ||
                        ""
                    ).trim(),

                  confidence:
                    clamp(
                      Number(
                        item.confidence ||
                          0
                      )
                    ),
                })
              )
              .filter(
                (
                  item: any
                ) =>
                  item.name
              )
          : [],
    })
  );
}

async function handleAssessRole(
  body: any,
  userId: string
) {
  const roleAssessmentId =
    String(
      body.roleAssessmentId ||
        ""
    );

  const assessmentId =
    await verifyRoleOwnership(
      roleAssessmentId,
      userId
    );

  const answers =
    Array.isArray(
      body.answers
    )
      ? body.answers
      : [];

  const submitted =
    answers.filter(
      (answer: any) =>
        answer
          ?.questionId &&
        typeof answer
          ?.answer ===
          "string" &&
        answer.answer.trim()
    );

  if (
    !submitted.length
  ) {
    return NextResponse.json(
      {
        error:
          "At least one clarification answer is required.",
      },
      {
        status: 400,
      }
    );
  }

  const role =
    await getRolePayload(
      roleAssessmentId
    );

  const questionIds =
    submitted.map(
      (item: any) =>
        String(
          item.questionId
        )
    );

  const questionResult =
    await sql`
      SELECT
        id,
        competency,
        reason,
        question
      FROM career_role_questions
      WHERE
        role_assessment_id=
          ${roleAssessmentId}
        AND
        status='open'
    `;

  const fullAnswers =
    submitted.map(
      (answer: any) => {
        const question =
          questionResult.rows.find(
            (row) =>
              String(
                row.id
              ) ===
              String(
                answer.questionId
              )
          );

        return {
          questionId:
            String(
              answer.questionId
            ),

          competency:
            String(
              question
                ?.competency ||
                ""
            ),

          question:
            String(
              question
                ?.question ||
                ""
            ),

          answer:
            String(
              answer.answer
            ).trim(),
        };
      }
    );

  const evaluations =
    await evaluateAnswers(
      role,
      fullAnswers
    );

  const followUps:
    Gap[] = [];

  for (
    const answer of
    fullAnswers
  ) {
    if (
      !questionIds.includes(
        answer.questionId
      )
    ) {
      continue;
    }

    const evaluation =
      evaluations.find(
        (item) =>
          item.questionId ===
          answer.questionId
      );

    await sql`
      UPDATE career_role_questions
      SET
        status='answered',
        updated_at=NOW()
      WHERE
        id=
          ${answer.questionId}
        AND
        role_assessment_id=
          ${roleAssessmentId}
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
        ${
          evaluation
            ?.status ||
          'needs_clarification'
        },
        ${
          evaluation
            ?.evidence ||
          null
        },
        ${
          evaluation
            ?.confidence ||
          0
        },
        NOW()
      )
    `;

    if (
      !evaluation
    ) {
      continue;
    }

    const canonical =
      await findCompetency(
        evaluation.competency ||
          answer.competency
      );

    if (
      evaluation.status ===
      "demonstrated"
    ) {
      await stageCapability(
        {
          roleAssessmentId,

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
              : evaluation.competency,

          sourceType:
            "clarification",

          evidence:
            evaluation.evidence,

          confidence:
            evaluation.confidence,

          demonstrated:
            true,

          capabilityStatus:
            "demonstrated",

          assessmentStatus:
            "assessed",
        }
      );
    }

    if (
      evaluation.status ===
      "gap"
    ) {
      await stageCapability(
        {
          roleAssessmentId,

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
              : evaluation.competency,

          sourceType:
            "clarification",

          evidence:
            evaluation.evidence,

          confidence:
            evaluation.confidence,

          demonstrated:
            false,

          capabilityStatus:
            "gap",

          assessmentStatus:
            "assessed",
        }
      );
    }

    if (
      evaluation.status ===
        "needs_clarification" &&
      evaluation
        .followUpQuestion
    ) {
      followUps.push({
        competency:
          evaluation.competency,

        reason:
          evaluation
            .followUpReason ||
          "Further evidence is required.",

        question:
          evaluation
            .followUpQuestion,
      });
    }

    for (
      const emerging of
      evaluation
        .emergingCapabilities ||
      []
    ) {
      const mapped =
        await findCompetency(
          emerging.name
        );

      await stageCapability(
        {
          roleAssessmentId,

          competencyId:
            mapped
              ? String(
                  mapped.id
                )
              : null,

          name:
            mapped
              ? String(
                  mapped.name
                )
              : emerging.name,

          sourceType:
            "clarification",

          evidence:
            emerging.evidence,

          confidence:
            emerging.confidence,

          demonstrated:
            true,

          capabilityStatus:
            "demonstrated",

          assessmentStatus:
            "assessed",
        }
      );
    }
  }

  await replaceOpenQuestions(
    roleAssessmentId,
    followUps
  );

  await recordSuccessGate({
    assessmentId,
    roleAssessmentId,
    gateKey:
      "clarification_evaluation_completed",
  });

  const remaining =
    await sql`
      SELECT COUNT(*)::int AS count
      FROM career_role_questions
      WHERE
        role_assessment_id=
          ${roleAssessmentId}
        AND
        status='open'
    `;

  const openCount =
    Number(
      remaining.rows[0]
        ?.count || 0
    );

  await sql`
    UPDATE career_role_assessments
    SET
      lifecycle_status=${
        openCount
          ? 'in_progress'
          : 'review_ready'
      },
      updated_at=NOW()
    WHERE id=
      ${roleAssessmentId}
  `;

  if (
    !openCount
  ) {
    await recordSuccessGate({
      assessmentId,
      roleAssessmentId,
      gateKey:
        "clarification_completed",
    });
  }

  const updatedRole =
    await getRolePayload(
      roleAssessmentId
    );

  return NextResponse.json(
    {
      success: true,
      role:
        updatedRole,
      successGates:
        updatedRole
          .successGates,
    }
  );
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

  const action =
    String(
      body.action ||
        ""
    );

  const assessmentId =
    await verifyRoleOwnership(
      roleAssessmentId,
      userId
    );

  let reviewStatus:
    ReviewStatus;

  switch (action) {
    case "accept":
      reviewStatus =
        "accepted";
      break;

    case "reject":
      reviewStatus =
        "rejected";
      break;

    case "edit":
      reviewStatus =
        "edited";
      break;

    default:
      return NextResponse.json(
        {
          error:
            "Invalid capability review action.",
        },
        {
          status: 400,
        }
      );
  }

  await sql`
    UPDATE career_role_capabilities
    SET
      review_status=
        ${reviewStatus},

      edited_competency_name=${
        reviewStatus ===
        'edited'
          ? String(
              body.name ||
                ""
            ).trim() ||
            null
          : null
      },

      edited_evidence=${
        reviewStatus ===
        'edited'
          ? String(
              body.evidence ||
                ""
            ).trim() ||
            null
          : null
      },

      updated_at=NOW()

    WHERE
      id=${capabilityId}
      AND
      role_assessment_id=
        ${roleAssessmentId}
  `;

  await recordSuccessGate({
    assessmentId,
    roleAssessmentId,
    gateKey:
      "capability_review_completed",
    metadata: {
      capabilityId,
      reviewStatus,
    },
  });

  const remaining =
    await sql`
      SELECT COUNT(*)::int AS count
      FROM career_role_capabilities
      WHERE
        role_assessment_id=
          ${roleAssessmentId}
        AND
        demonstrated=TRUE
        AND
        capability_status=
          'demonstrated'
        AND
        review_status=
          'proposed'
    `;

  if (
    Number(
      remaining.rows[0]
        ?.count || 0
    ) === 0
  ) {
    await recordSuccessGate({
      assessmentId,
      roleAssessmentId,
      gateKey:
        "all_demonstrated_capabilities_reviewed",
    });
  }

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
  const roleAssessmentId =
    String(
      body.roleAssessmentId ||
        ""
    );

  const assessmentId =
    await verifyRoleOwnership(
      roleAssessmentId,
      userId
    );

  const organisation =
    String(
      body.organisation ||
        ""
    ).trim();

  const roleTitle =
    String(
      body.roleTitle ||
        ""
    ).trim();

  const description =
    String(
      body.description ||
        ""
    ).trim();

  if (
    !organisation ||
    !roleTitle ||
    !description
  ) {
    return NextResponse.json(
      {
        error:
          "Organisation, role title and role description are required.",
      },
      {
        status: 400,
      }
    );
  }

  const canonical =
    await findCanonicalRole(
      roleTitle
    );

  const toDatePrecision =
    String(
      body.toDatePrecision ||
        (
          body.toDate
            ? "day"
            : "unknown"
        )
    );

  await sql`
    UPDATE career_role_assessments
    SET
      canonical_role_id=${
        canonical
          ? String(
              canonical.id
            )
          : null
      },

      organisation_name=
        ${organisation},

      proposed_role_title=
        ${roleTitle},

      from_date=${
        body.fromDate ||
        null
      },

      to_date=${
        toDatePrecision ===
        'ongoing'
          ? null
          : body.toDate ||
            null
      },

      from_date_precision=${
        body.fromDatePrecision ||
        (
          body.fromDate
            ? 'day'
            : 'unknown'
        )
      },

      to_date_precision=
        ${toDatePrecision},

      from_date_original=${
        body.fromDateOriginal ||
        body.fromDate ||
        null
      },

      to_date_original=${
        toDatePrecision ===
        'ongoing'
          ? 'Present'
          : body.toDateOriginal ||
            body.toDate ||
            null
      },

      role_description=
        ${description},

      engagement_model=${
        body.engagementType ||
        null
      },

      employment_context=${
        body.employmentType ||
        null
      },

      updated_at=NOW()

    WHERE id=
      ${roleAssessmentId}
  `;

  await recordSuccessGate({
    assessmentId,
    roleAssessmentId,
    gateKey:
      "role_context_updated",
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
   FINAL CHECK
============================================================ */

async function finalSubmissionCheck(
  role: any
) {
  const prompt = `
Perform a final consistency check before this manually entered career role is promoted.

Return JSON only:

{
  "emergingCapabilities": [
    {
      "name": "",
      "evidence": "",
      "confidence": 0.0
    }
  ],
  "clarifications": [
    {
      "competency": "",
      "reason": "",
      "question": ""
    }
  ]
}

Rules:

- An edited capability can itself reveal another capability signal.
- If a new signal is evidenced, return an emerging capability.
- If a new signal lacks sufficient evidence, return a clarification question.
- Do not duplicate existing reviewed capabilities.
- Do not invent evidence.
- Return empty arrays when the role is complete.

Role:
${JSON.stringify(
  role
)}
`;

  const response =
    await ai.models.generateContent(
      {
        model: MODEL,
        contents: prompt,
      }
    );

  const parsed =
    JSON.parse(
      cleanJson(
        geminiText(
          response
        )
      )
    );

  return {
    emergingCapabilities:
      Array.isArray(
        parsed
          ?.emergingCapabilities
      )
        ? parsed
            .emergingCapabilities
        : [],

    clarifications:
      Array.isArray(
        parsed?.clarifications
      )
        ? parsed.clarifications
        : [],
  };
}

/* ============================================================
   REPOSITORY ENRICHMENT
============================================================ */

async function getOrCreateCanonicalCompetency(
  name: string
) {
  const existing =
    await findCompetency(
      name
    );

  if (existing) {
    return String(
      existing.id
    );
  }

  const result =
    await sql`
      INSERT INTO competencies (
        name,
        lifecycle_status
      )
      VALUES (
        ${name},
        'proposed'
      )
      ON CONFLICT (name)
      DO UPDATE SET
        name=
          EXCLUDED.name
      RETURNING id
    `;

  return String(
    result.rows[0].id
  );
}

async function getOrCreateCanonicalRole(
  title: string,
  description: string
) {
  const existing =
    await findCanonicalRole(
      title
    );

  if (existing) {
    return String(
      existing.id
    );
  }

  const result =
    await sql`
      INSERT INTO roles (
        name,
        job_title,
        description,
        lifecycle_status,
        updated_at
      )
      VALUES (
        ${title},
        ${title},
        ${description || null},
        'proposed',
        NOW()
      )
      ON CONFLICT (name)
      DO UPDATE SET
        updated_at=
          NOW()
      RETURNING id
    `;

  return String(
    result.rows[0].id
  );
}

async function ensureRoleCompetency(
  roleId: string,
  competencyId: string
) {
  const existing =
    await sql`
      SELECT 1
      FROM role_competencies
      WHERE
        role_id=${roleId}
        AND
        competency_id=
          ${competencyId}
      LIMIT 1
    `;

  if (
    existing.rows.length
  ) {
    return;
  }

  await sql`
    INSERT INTO role_competencies (
      role_id,
      competency_id,
      importance,
      lifecycle_status
    )
    VALUES (
      ${roleId},
      ${competencyId},
      0.5,
      'proposed'
    )
  `;
}

/* ============================================================
   PROMOTE
============================================================ */

async function promoteRole(
  roleAssessmentId: string,
  userId: string
) {
  const role =
    await getRolePayload(
      roleAssessmentId
    );

  const originalCanonicalRoleId =
    role.canonicalRoleId;

  const repositoryRoleId =
    await getOrCreateCanonicalRole(
      role.roleTitle,
      role.description
    );

  const competencyMappings =
    new Map<
      string,
      string
    >();

  for (
    const capability of
    role.capabilities
  ) {
    if (
      capability
        .capabilityStatus !==
        "demonstrated" ||
      (
        capability
          .reviewStatus !==
          "accepted" &&
        capability
          .reviewStatus !==
          "edited"
      )
    ) {
      continue;
    }

    const name =
      capability
        .reviewStatus ===
        "edited" &&
      capability.editedName
        ? capability.editedName
        : capability.name;

    const competencyId =
      capability
        .competencyId ||
      await getOrCreateCanonicalCompetency(
        name
      );

    competencyMappings.set(
      capability.id,
      competencyId
    );

    await ensureRoleCompetency(
      repositoryRoleId,
      competencyId
    );
  }

  const profile =
    await sql`
      INSERT INTO candidate_profile_roles (
        user_id,
        source_role_assessment_id,
        canonical_role_id,
        organisation_name,
        role_title,

        from_date,
        to_date,

        from_date_precision,
        to_date_precision,

        from_date_original,
        to_date_original,

        role_description,
        engagement_model,
        employment_context,
        updated_at
      )
      VALUES (
        ${userId},
        ${roleAssessmentId},
        ${originalCanonicalRoleId},
        ${role.organisation},
        ${role.roleTitle},

        ${role.fromDate || null},

        ${
          role.toDatePrecision ===
          'ongoing'
            ? null
            : role.toDate ||
              null
        },

        ${
          role.fromDatePrecision ||
          'unknown'
        },

        ${
          role.toDatePrecision ||
          'unknown'
        },

        ${
          role.fromDateOriginal ||
          role.fromDate ||
          null
        },

        ${
          role.toDatePrecision ===
          'ongoing'
            ? 'Present'
            : role.toDateOriginal ||
              role.toDate ||
              null
        },

        ${role.description || null},
        ${role.engagementType || null},
        ${role.employmentType || null},
        NOW()
      )
      ON CONFLICT (
        source_role_assessment_id
      )
      DO UPDATE SET
        canonical_role_id=
          EXCLUDED.canonical_role_id,

        organisation_name=
          EXCLUDED.organisation_name,

        role_title=
          EXCLUDED.role_title,

        from_date=
          EXCLUDED.from_date,

        to_date=
          EXCLUDED.to_date,

        from_date_precision=
          EXCLUDED.from_date_precision,

        to_date_precision=
          EXCLUDED.to_date_precision,

        from_date_original=
          EXCLUDED.from_date_original,

        to_date_original=
          EXCLUDED.to_date_original,

        role_description=
          EXCLUDED.role_description,

        engagement_model=
          EXCLUDED.engagement_model,

        employment_context=
          EXCLUDED.employment_context,

        updated_at=
          NOW()

      RETURNING id
    `;

  const profileRoleId =
    String(
      profile.rows[0].id
    );

  await sql`
    DELETE FROM candidate_profile_role_capabilities
    WHERE candidate_profile_role_id=
      ${profileRoleId}
  `;

  await sql`
    DELETE FROM candidate_profile_role_gaps
    WHERE candidate_profile_role_id=
      ${profileRoleId}
  `;

  for (
    const capability of
    role.capabilities
  ) {
    const name =
      capability
        .reviewStatus ===
        "edited" &&
      capability.editedName
        ? capability.editedName
        : capability.name;

    const evidence =
      capability
        .reviewStatus ===
        "edited" &&
      capability
        .editedEvidence
        ? capability
            .editedEvidence
        : capability
            .evidence;

    if (
      capability
        .capabilityStatus ===
        "demonstrated" &&
      (
        capability
          .reviewStatus ===
          "accepted" ||
        capability
          .reviewStatus ===
          "edited"
      )
    ) {
      const competencyId =
        competencyMappings.get(
          capability.id
        ) ||
        capability
          .competencyId ||
        null;

      await sql`
        INSERT INTO candidate_profile_role_capabilities (
          candidate_profile_role_id,
          competency_id,
          capability_name,
          confidence,
          evidence,
          source_type,
          updated_at
        )
        VALUES (
          ${profileRoleId},
          ${competencyId},
          ${name},
          ${capability.confidence || 0},
          ${evidence || null},
          ${capability.source || 'manual'},
          NOW()
        )
      `;

      if (
        originalCanonicalRoleId &&
        competencyId
      ) {
        await sql`
          INSERT INTO candidate_knowledge (
            user_id,
            role_id,
            competency_id,
            confidence,
            updated_at
          )
          VALUES (
            ${userId},
            ${originalCanonicalRoleId},
            ${competencyId},
            ${capability.confidence || 0},
            NOW()
          )
          ON CONFLICT (
            user_id,
            role_id,
            competency_id
          )
          DO UPDATE SET
            confidence=
              EXCLUDED.confidence,
            updated_at=
              NOW()
        `;
      }
    }

    if (
      capability
        .capabilityStatus ===
      "gap"
    ) {
      await sql`
        INSERT INTO candidate_profile_role_gaps (
          candidate_profile_role_id,
          competency_name,
          evidence
        )
        VALUES (
          ${profileRoleId},
          ${name},
          ${evidence || null}
        )
      `;
    }
  }
}

/* ============================================================
   SUBMIT ROLE
============================================================ */

async function handleSubmitRole(
  body: any,
  userId: string
) {
  const roleAssessmentId =
    String(
      body.roleAssessmentId ||
        ""
    );

  const assessmentId =
    await verifyRoleOwnership(
      roleAssessmentId,
      userId
    );

  const open =
    await sql`
      SELECT COUNT(*)::int AS count
      FROM career_role_questions
      WHERE
        role_assessment_id=
          ${roleAssessmentId}
        AND
        status='open'
    `;

  if (
    Number(
      open.rows[0]
        ?.count || 0
    )
  ) {
    const role =
      await getRolePayload(
        roleAssessmentId
      );

    return NextResponse.json(
      {
        error:
          "Clarification questions remain open.",
        requiresFurtherReview:
          true,
        role,
        successGates:
          role.successGates,
      },
      {
        status: 409,
      }
    );
  }

  const proposed =
    await sql`
      SELECT COUNT(*)::int AS count
      FROM career_role_capabilities
      WHERE
        role_assessment_id=
          ${roleAssessmentId}
        AND
        demonstrated=TRUE
        AND
        capability_status=
          'demonstrated'
        AND
        review_status=
          'proposed'
    `;

  if (
    Number(
      proposed.rows[0]
        ?.count || 0
    )
  ) {
    const role =
      await getRolePayload(
        roleAssessmentId
      );

    return NextResponse.json(
      {
        error:
          "All demonstrated capabilities must be reviewed.",
        requiresFurtherReview:
          true,
        role,
        successGates:
          role.successGates,
      },
      {
        status: 409,
      }
    );
  }

  const before =
    await getRolePayload(
      roleAssessmentId
    );

  const finalCheck =
    await finalSubmissionCheck(
      before
    );

  const emerging =
    Array.isArray(
      finalCheck
        .emergingCapabilities
    )
      ? finalCheck
          .emergingCapabilities
      : [];

  const clarifications =
    Array.isArray(
      finalCheck
        .clarifications
    )
      ? finalCheck
          .clarifications
      : [];

  if (
    emerging.length ||
    clarifications.length
  ) {
    for (
      const item of emerging
    ) {
      if (
        !item?.name
      ) {
        continue;
      }

      const canonical =
        await findCompetency(
          String(
            item.name
          )
        );

      await stageCapability(
        {
          roleAssessmentId,

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
              : String(
                  item.name
                ),

          sourceType:
            "final_check",

          evidence:
            String(
              item.evidence ||
                ""
            ),

          confidence:
            clamp(
              Number(
                item.confidence ||
                  0
              )
            ),

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
      clarifications
        .filter(
          (item: any) =>
            item
              ?.competency &&
            item
              ?.question
        )
        .map(
          (item: any) => ({
            competency:
              String(
                item.competency
              ),

            reason:
              String(
                item.reason ||
                  "Additional evidence is required."
              ),

            question:
              String(
                item.question
              ),
          })
        )
    );

    await sql`
      UPDATE career_role_assessments
      SET
        lifecycle_status=
          'in_progress',
        updated_at=NOW()
      WHERE id=
        ${roleAssessmentId}
    `;

    const role =
      await getRolePayload(
        roleAssessmentId
      );

    return NextResponse.json(
      {
        success: true,
        requiresFurtherReview:
          true,
        message:
          "Additional evidence has been identified and requires review.",
        role,
        successGates:
          role.successGates,
      }
    );
  }

  await recordSuccessGate({
    assessmentId,
    roleAssessmentId,
    gateKey:
      "final_submission_check_passed",
  });

  await promoteRole(
    roleAssessmentId,
    userId
  );

  await recordSuccessGate({
    assessmentId,
    roleAssessmentId,
    gateKey:
      "role_promoted",
  });

  await sql`
    UPDATE career_role_assessments
    SET
      lifecycle_status='completed',
      completed_at=NOW(),
      updated_at=NOW()
    WHERE id=
      ${roleAssessmentId}
  `;

  await recordSuccessGate({
    assessmentId,
    roleAssessmentId,
    gateKey:
      "role_completed",
  });

  const current =
    await sql`
      SELECT sequence_no
      FROM career_role_assessments
      WHERE id=
        ${roleAssessmentId}
      LIMIT 1
    `;

  const next =
    await sql`
      SELECT id
      FROM career_role_assessments
      WHERE
        assessment_id=
          ${assessmentId}
        AND
        sequence_no >
          ${
            Number(
              current.rows[0]
                ?.sequence_no ||
                0
            )
          }
        AND
        lifecycle_status <>
          'completed'
      ORDER BY sequence_no
      LIMIT 1
    `;

  let nextRole:
    any = null;

  if (
    next.rows.length
  ) {
    const nextId =
      String(
        next.rows[0].id
      );

    const openNext =
      await sql`
        SELECT COUNT(*)::int AS count
        FROM career_role_questions
        WHERE
          role_assessment_id=
            ${nextId}
          AND
          status='open'
      `;

    const hasQuestions =
      Number(
        openNext.rows[0]
          ?.count || 0
      ) > 0;

    await sql`
      UPDATE career_role_assessments
      SET
        lifecycle_status=${
          hasQuestions
            ? 'in_progress'
            : 'review_ready'
        },
        updated_at=NOW()
      WHERE id=
        ${nextId}
    `;

    await recordSuccessGate({
      assessmentId,
      roleAssessmentId:
        nextId,
      gateKey:
        "next_role_activated",
    });

    if (
      !hasQuestions
    ) {
      await recordSuccessGate({
        assessmentId,
        roleAssessmentId:
          nextId,
        gateKey:
          "clarification_completed",
      });
    }

    nextRole =
      await getRolePayload(
        nextId
      );
  }

  const remaining =
    await sql`
      SELECT COUNT(*)::int AS count
      FROM career_role_assessments
      WHERE
        assessment_id=
          ${assessmentId}
        AND
        lifecycle_status <>
          'completed'
    `;

  const assessmentCompleted =
    Number(
      remaining.rows[0]
        ?.count || 0
    ) === 0;

  if (
    assessmentCompleted
  ) {
    await sql`
      UPDATE career_assessments
      SET
        status='completed',
        completed_at=NOW(),
        updated_at=NOW()
      WHERE id=
        ${assessmentId}
    `;

    await recordSuccessGate({
      assessmentId,
      gateKey:
        "assessment_completed",
    });
  }

  const role =
    await getRolePayload(
      roleAssessmentId
    );

  return NextResponse.json(
    {
      success: true,
      completed: true,
      assessmentCompleted,
      role,
      nextRole,
      successGates:
        role.successGates,
    }
  );
}

/* ============================================================
   POST
============================================================ */

export async function POST(
  request: Request
) {
  try {
    const userId =
      await getAuthenticatedUserId();

    const body =
      await request.json();

    switch (
      body.action
    ) {
      case "start_manual":
        return await handleStartManual(
          body,
          userId
        );

      case "assess_role":
        return await handleAssessRole(
          body,
          userId
        );

      case "review_capability":
        return await handleReviewCapability(
          body,
          userId
        );

      case "update_role_context":
        return await handleUpdateRole(
          body,
          userId
        );

      case "submit_role":
        return await handleSubmitRole(
          body,
          userId
        );

      default:
        return NextResponse.json(
          {
            error:
              "Unsupported action.",
          },
          {
            status: 400,
          }
        );
    }
  } catch (error) {
    console.error(
      "no-cv route error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected server error.",
      },
      {
        status: 500,
      }
    );
  }
}