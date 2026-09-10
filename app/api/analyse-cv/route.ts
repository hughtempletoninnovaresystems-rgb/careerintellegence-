import { NextResponse } from "next/server";
import mammoth from "mammoth";
import { GoogleGenAI } from "@google/genai";
import extract from "pdf-extraction";
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

type SuccessGate = {
  id: string;
  assessmentId: string;
  roleAssessmentId?: string | null;
  scopeKey: string;
  gateKey: string;
  status: string;
  metadata: Record<string, unknown>;
  achievedAt: string;
};

/* ============================================================
   BASIC HELPERS
============================================================ */

function cleanJson(value: string) {
  return value
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function clamp(
  value: number,
  min = 0,
  max = 1
) {
  return Math.max(
    min,
    Math.min(max, value)
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
    /*
     * Success-gate traceability
     * must never break the
     * assessment workflow.
     */
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
): Promise<SuccessGate[]> {
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
          WHERE assessment_id=
            ${assessmentId}
            AND
            role_assessment_id=
            ${roleAssessmentId}
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
          WHERE assessment_id=
            ${assessmentId}
            AND
            role_assessment_id
              IS NULL
          ORDER BY achieved_at, id
        `;

  return result.rows.map(
    (row) => ({
      id: String(row.id),

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

async function getAssessmentIdForRole(
  roleAssessmentId: string
) {
  const result =
    await sql`
      SELECT assessment_id
      FROM career_role_assessments
      WHERE id=
        ${roleAssessmentId}
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

async function findCanonicalRole(
  roleTitle: string
) {
  const exact =
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

  if (
    exact.rows.length
  ) {
    return exact.rows[0];
  }

  return null;
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
      WHERE LOWER(name)=
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
      WHERE rc.role_id=
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
  const result =
    await sql`
      INSERT INTO career_assessments (
        user_id,
        source_type,
        status,
        candidate_name,
        updated_at
      )
      VALUES (
        ${userId},
        'cv',
        'in_progress',
        ${candidateName || null},
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
  role: ExtractedRole,
  canonicalRoleId: string | null,
  lifecycleStatus:
    | "in_progress"
    | "not_started"
) {
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
        ${role.organisationName},
        ${role.roleTitle},

        ${role.fromDate || null},
        ${role.toDate || null},

        ${role.fromDatePrecision},
        ${role.toDatePrecision},

        ${role.fromDateOriginal || null},
        ${role.toDateOriginal || null},

        ${role.roleDescription || null},
        ${role.engagementModel || null},
        ${role.employmentContext || null},
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
   CAPABILITIES
============================================================ */

async function stageCapability({
  roleAssessmentId,
  competencyId = null,
  name,
  sourceType,
  sourceSection = null,
  evidence = "",
  confidence = 0,
  demonstrated,
  capabilityStatus,
  assessmentStatus,
}: {
  roleAssessmentId: string;
  competencyId?: string | null;
  name: string;
  sourceType: string;
  sourceSection?: string | null;
  evidence?: string;
  confidence?: number;
  demonstrated: boolean;
  capabilityStatus: CapabilityStatus;
  assessmentStatus: AssessmentStatus;
}) {
  const result =
    await sql`
      INSERT INTO career_role_capabilities (
        role_assessment_id,
        canonical_competency_id,
        proposed_competency_name,
        source_type,
        source_section,
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
        ${sourceSection},
        ${evidence || null},
        ${clamp(confidence)},
        ${demonstrated},
        ${capabilityStatus},
        ${assessmentStatus},
        'proposed',
        NOW(),
        NOW()
      )
      RETURNING id
    `;

  return String(
    result.rows[0].id
  );
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

  /*
   * Deliberately do not close existing open
   * questions here. Each enrichment round
   * is additive.
   */
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

  const capabilityResult =
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

  const questionResult =
    await sql`
      SELECT
        id,
        competency,
        reason,
        question,
        status,
        round_no,
        created_at,
        updated_at
      FROM career_role_questions
      WHERE
        role_assessment_id=
          ${roleAssessmentId}
        AND
        status='open'
      ORDER BY
        round_no,
        created_at,
        id
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
    roleAssessmentId:
      String(role.id),

    assessmentId,

    sequenceNo:
      Number(
        role.sequence_no
      ),

    canonicalRoleId:
      role.canonical_role_id
        ? String(
            role.canonical_role_id
          )
        : null,

    organisationName:
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

    roleDescription:
      String(
        role.role_description ||
          ""
      ),

    engagementModel:
      String(
        role.engagement_model ||
          ""
      ),

    employmentContext:
      String(
        role.employment_context ||
          ""
      ),

    lifecycleStatus:
      String(
        role.lifecycle_status ||
          ""
      ),

    stagedCapabilities:
      capabilityResult.rows.map(
        (capability) => ({
          id:
            String(
              capability.id
            ),

          canonicalCompetencyId:
            capability.canonical_competency_id
              ? String(
                  capability.canonical_competency_id
                )
              : null,

          proposedCompetencyName:
            String(
              capability.edited_competency_name ||
                capability.canonical_name ||
                capability.proposed_competency_name ||
                ""
            ),

          evidence:
            String(
              capability.edited_evidence ||
                capability.evidence ||
                ""
            ),

          confidence:
            Number(
              capability.ai_confidence ||
                0
            ),

          demonstrated:
            Boolean(
              capability.demonstrated
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

          editedCompetencyName:
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

          sourceType:
            String(
              capability.source_type ||
                ""
            ),
        })
      ),

    gaps:
      questionResult.rows.map(
        (question) => ({
          id:
            String(
              question.id
            ),

          competency:
            String(
              question.competency ||
                ""
            ),

          reason:
            String(
              question.reason ||
                ""
            ),

          question:
            String(
              question.question ||
                ""
            ),
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
        cra.id,
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
      await sql`
        UPDATE career_role_assessments
        SET
          lifecycle_status=
            'review_ready',
          updated_at=NOW()
        WHERE id=
          ${roleAssessmentId}
      `;

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

async function evaluateAnswers(
  rolePayload: any,
  submittedQuestions: any[]
): Promise<Evaluation[]> {
  const prompt = `
You are assessing clarification evidence for a career role.

Return JSON only.

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

- "demonstrated" requires meaningful evidence of what the person actually did.
- A capability keyword alone is not sufficient evidence.
- "gap" means the response does not establish demonstration and further questioning is not reasonably useful.
- "needs_clarification" means there is a plausible signal but more evidence could establish it.
- When a response evidences an additional capability, return it under emergingCapabilities.
- Do not invent evidence.
- Confidence must be 0 to 1.

Role:
${JSON.stringify(
  {
    organisation:
      rolePayload.organisationName,
    roleTitle:
      rolePayload.roleTitle,
    description:
      rolePayload.roleDescription,
  }
)}

Questions and answers:
${JSON.stringify(
  submittedQuestions
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
        evaluation.status ===
          "demonstrated" ||
        evaluation.status ===
          "gap" ||
        evaluation.status ===
          "needs_clarification"
          ? evaluation.status
          : "needs_clarification",

      evidence:
        typeof evaluation
          .evidence ===
        "string"
          ? evaluation.evidence.trim()
          : "",

      confidence:
        clamp(
          Number(
            evaluation.confidence ||
              0
          )
        ),

      followUpQuestion:
        typeof evaluation
          .followUpQuestion ===
        "string"
          ? evaluation.followUpQuestion.trim()
          : undefined,

      followUpReason:
        typeof evaluation
          .followUpReason ===
        "string"
          ? evaluation.followUpReason.trim()
          : undefined,

      emergingCapabilities:
        Array.isArray(
          evaluation
            .emergingCapabilities
        )
          ? evaluation.emergingCapabilities
              .filter(
                (
                  capability: any
                ) =>
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

  if (
    !roleAssessmentId
  ) {
    return NextResponse.json(
      {
        error:
          "roleAssessmentId is required.",
      },
      {
        status: 400,
      }
    );
  }

  const assessmentId =
    await verifyRoleOwnership(
      roleAssessmentId,
      userId
    );

  /*
   * CV route accepts:
   *
   * questions: [
   *   {
   *     gapId,
   *     competency,
   *     question,
   *     answer
   *   }
   * ]
   */
  const questions =
    Array.isArray(
      body.questions
    )
      ? body.questions
      : [];

  const submitted =
    questions.filter(
      (question: any) =>
        question?.gapId &&
        typeof question
          ?.answer ===
          "string" &&
        question.answer.trim()
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

  const rolePayload =
    await getRolePayload(
      roleAssessmentId
    );

  const evaluations =
    await evaluateAnswers(
      rolePayload,
      submitted
    );

  const followUps: Gap[] =
    [];

  for (
    const submittedQuestion
    of submitted
  ) {
    const questionId =
      String(
        submittedQuestion.gapId
      );

    const evaluation =
      evaluations.find(
        (item) =>
          item.questionId ===
          questionId
      );

    await sql`
      UPDATE career_role_questions
      SET
        status='answered',
        updated_at=NOW()
      WHERE
        id=${questionId}
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
        ${questionId},
        ${roleAssessmentId},
        ${String(
          submittedQuestion.answer
        ).trim()},
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
          submittedQuestion
            .competency ||
          ""
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

          sourceSection:
            "candidate_answer",

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

          sourceSection:
            "candidate_answer",

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
      evaluation.emergingCapabilities ||
      []
    ) {
      const mapped =
        await mapCapability(
          emerging
        );

      await stageCapability(
        {
          roleAssessmentId,

          competencyId:
            mapped.competencyId,

          name:
            mapped.name,

          sourceType:
            "clarification",

          sourceSection:
            "emerging_capability",

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
        openCount > 0
          ? 'in_progress'
          : 'review_ready'
      },
      updated_at=NOW()
    WHERE id=
      ${roleAssessmentId}
  `;

  if (
    openCount === 0
  ) {
    await recordSuccessGate({
      assessmentId,
      roleAssessmentId,
      gateKey:
        "clarification_completed",
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
    ) as ReviewStatus;

  if (
    !roleAssessmentId ||
    !capabilityId
  ) {
    return NextResponse.json(
      {
        error:
          "roleAssessmentId and capabilityId are required.",
      },
      {
        status: 400,
      }
    );
  }

  if (
    ![
      "accepted",
      "edited",
      "rejected",
    ].includes(
      reviewStatus
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Invalid reviewStatus.",
      },
      {
        status: 400,
      }
    );
  }

  const assessmentId =
    await verifyRoleOwnership(
      roleAssessmentId,
      userId
    );

  const capabilityResult =
    await sql`
      SELECT id
      FROM career_role_capabilities
      WHERE
        id=${capabilityId}
        AND
        role_assessment_id=
          ${roleAssessmentId}
      LIMIT 1
    `;

  if (
    !capabilityResult
      .rows.length
  ) {
    return NextResponse.json(
      {
        error:
          "Capability not found.",
      },
      {
        status: 404,
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
              body.competencyName ||
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

    WHERE id=
      ${capabilityId}
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
   UPDATE ROLE CONTEXT
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

  if (
    !roleAssessmentId
  ) {
    return NextResponse.json(
      {
        error:
          "roleAssessmentId is required.",
      },
      {
        status: 400,
      }
    );
  }

  const assessmentId =
    await verifyRoleOwnership(
      roleAssessmentId,
      userId
    );

  const organisationName =
    String(
      body.organisationName ||
        ""
    ).trim();

  const roleTitle =
    String(
      body.roleTitle ||
        ""
    ).trim();

  const roleDescription =
    String(
      body.roleDescription ||
        ""
    ).trim();

  if (
    !organisationName ||
    !roleTitle ||
    !roleDescription
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

  const fromDate =
    body.fromDate ||
    null;

  const toDatePrecision =
    String(
      body.toDatePrecision ||
        (
          body.toDate
            ? "day"
            : "unknown"
        )
    );

  const toDate =
    toDatePrecision ===
    "ongoing"
      ? null
      : body.toDate ||
        null;

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
        ${organisationName},

      proposed_role_title=
        ${roleTitle},

      from_date=
        ${fromDate},

      to_date=
        ${toDate},

      from_date_precision=${
        body.fromDatePrecision ||
        (
          fromDate
            ? 'day'
            : 'unknown'
        )
      },

      to_date_precision=
        ${toDatePrecision},

      from_date_original=${
        body.fromDateOriginal ||
        fromDate ||
        null
      },

      to_date_original=${
        toDatePrecision ===
        'ongoing'
          ? 'Present'
          : body.toDateOriginal ||
            toDate ||
            null
      },

      role_description=
        ${roleDescription},

      engagement_model=${
        body.engagementModel ||
        null
      },

      employment_context=${
        body.employmentContext ||
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
   FINAL SUBMISSION CHECK
============================================================ */

async function finalSubmissionCheck(
  rolePayload: any
): Promise<{
  emergingCapabilities:
    ExtractedCapability[];
  clarifications: Gap[];
}> {
  const prompt = `
Perform a final consistency check on this career role before it is promoted to the candidate profile.

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

- Look across the role context, accepted/edited capabilities, rejected capabilities and clarification evidence.
- Identify an emerging capability only where evidence genuinely supports it.
- If there is a plausible capability signal but insufficient evidence, return a clarification question.
- Do not reopen rejected capabilities without new evidence.
- Do not duplicate capabilities already represented.
- A keyword alone is insufficient evidence.
- Return empty arrays when no further work is required.

Role:
${JSON.stringify(
  rolePayload
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

  const emergingCapabilities =
    Array.isArray(
      parsed
        ?.emergingCapabilities
    )
      ? parsed.emergingCapabilities
      : [];

  const clarifications =
    Array.isArray(
      parsed?.clarifications
    )
      ? parsed.clarifications
      : [];

  return {
    emergingCapabilities:
      emergingCapabilities
        .filter(
          (item: any) =>
            typeof item
              ?.name ===
              "string" &&
            item.name.trim()
        )
        .map(
          (item: any) => ({
            name:
              item.name.trim(),

            evidence:
              typeof item
                .evidence ===
              "string"
                ? item.evidence.trim()
                : "",

            confidence:
              clamp(
                Number(
                  item.confidence ||
                    0
                )
              ),
          })
        ),

    clarifications:
      clarifications
        .filter(
          (item: any) =>
            typeof item
              ?.competency ===
              "string" &&
            item.competency.trim() &&
            typeof item
              ?.question ===
              "string" &&
            item.question.trim()
        )
        .map(
          (item: any) => ({
            competency:
              item.competency.trim(),

            reason:
              typeof item
                .reason ===
              "string"
                ? item.reason.trim()
                : "Additional evidence is required.",

            question:
              item.question.trim(),
          })
        ),
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
    return {
      id:
        String(
          existing.id
        ),
      existing: true,
    };
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

  return {
    id:
      String(
        result.rows[0].id
      ),
    existing: false,
  };
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
    return {
      id:
        String(
          existing.id
        ),
      existing: true,
    };
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
        updated_at=NOW()
      RETURNING id
    `;

  return {
    id:
      String(
        result.rows[0].id
      ),
    existing: false,
  };
}

async function getOrCreateRoleCompetency(
  roleId: string,
  competencyId: string
) {
  const existing =
    await sql`
      SELECT
        role_id,
        competency_id
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

async function enrichCanonicalRepository(
  rolePayload: any
) {
  const canonicalRole =
    await getOrCreateCanonicalRole(
      rolePayload.roleTitle,
      rolePayload.roleDescription
    );

  const acceptedCapabilities =
    rolePayload
      .stagedCapabilities
      .filter(
        (capability: any) =>
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
      );

  const mappings: {
    capabilityId: string;
    competencyId: string;
  }[] = [];

  for (
    const capability of
    acceptedCapabilities
  ) {
    const name =
      capability
        .editedCompetencyName ||
      capability
        .proposedCompetencyName;

    const competency =
      await getOrCreateCanonicalCompetency(
        name
      );

    await getOrCreateRoleCompetency(
      canonicalRole.id,
      competency.id
    );

    mappings.push({
      capabilityId:
        String(
          capability.id
        ),
      competencyId:
        competency.id,
    });
  }

  return {
    canonicalRoleId:
      canonicalRole.id,
    mappings,
  };
}

/* ============================================================
   PROMOTE ROLE
============================================================ */

async function promoteRole(
  roleAssessmentId: string,
  userId: string
) {
  const role =
    await getRolePayload(
      roleAssessmentId
    );

  /*
   * Preserve original canonical-role behaviour:
   *
   * If the role was unmatched when assessed,
   * candidate_profile_roles.canonical_role_id
   * remains NULL.
   *
   * Repository enrichment is separate and may
   * create a proposed canonical role.
   */
  const originalCanonicalRoleId =
    role.canonicalRoleId;

  const enrichment =
    await enrichCanonicalRepository(
      role
    );

  const profileResult =
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
        ${role.organisationName},
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

        ${role.roleDescription || null},
        ${role.engagementModel || null},
        ${role.employmentContext || null},
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

        updated_at=NOW()

      RETURNING id
    `;

  const profileRoleId =
    String(
      profileResult.rows[0]
        .id
    );

  /*
   * Rebuild promoted capabilities/gaps for
   * this profile-role snapshot.
   */
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
    role.stagedCapabilities
  ) {
    const name =
      capability
        .editedCompetencyName ||
      capability
        .proposedCompetencyName;

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
      const mapped =
        enrichment.mappings.find(
          (mapping) =>
            mapping.capabilityId ===
            String(
              capability.id
            )
        );

      const competencyId =
        capability
          .canonicalCompetencyId ||
        mapped
          ?.competencyId ||
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
          ${capability.editedEvidence || capability.evidence || null},
          ${capability.sourceType || 'assessment'},
          NOW()
        )
      `;

      /*
       * Candidate knowledge only points at an
       * established canonical role when one
       * existed on the assessment.
       */
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
          ${capability.evidence || null}
        )
      `;
    }
  }

  return {
    profileRoleId,
    repositoryRoleId:
      enrichment
        .canonicalRoleId,
  };
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

  if (
    !roleAssessmentId
  ) {
    return NextResponse.json(
      {
        error:
          "roleAssessmentId is required.",
      },
      {
        status: 400,
      }
    );
  }

  const assessmentId =
    await verifyRoleOwnership(
      roleAssessmentId,
      userId
    );

  const openQuestions =
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
      openQuestions.rows[0]
        ?.count || 0
    ) > 0
  ) {
    const role =
      await getRolePayload(
        roleAssessmentId
      );

    return NextResponse.json(
      {
        error:
          "Clarification questions must be completed before this role can be submitted.",
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

  const proposedCapabilities =
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
      proposedCapabilities
        .rows[0]
        ?.count || 0
    ) > 0
  ) {
    const role =
      await getRolePayload(
        roleAssessmentId
      );

    return NextResponse.json(
      {
        error:
          "All demonstrated capabilities must be accepted, edited or rejected before completing the role.",
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

  const roleBeforeCheck =
    await getRolePayload(
      roleAssessmentId
    );

  const finalCheck =
    await finalSubmissionCheck(
      roleBeforeCheck
    );

  if (
    finalCheck
      .emergingCapabilities
      .length ||
    finalCheck
      .clarifications
      .length
  ) {
    for (
      const capability of
      finalCheck
        .emergingCapabilities
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
            "final_check",

          sourceSection:
            "final_submission",

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
      finalCheck
        .clarifications
    );

    await sql`
      UPDATE career_role_assessments
      SET
        lifecycle_status='in_progress',
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
          "The final consistency check identified additional evidence that requires review.",

        role,

        successGates:
          role.successGates,
      }
    );
  }

  /*
   * Record only when final check really passes.
   */
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

  const completedRole =
    await sql`
      SELECT sequence_no
      FROM career_role_assessments
      WHERE id=
        ${roleAssessmentId}
      LIMIT 1
    `;

  const sequenceNo =
    Number(
      completedRole.rows[0]
        ?.sequence_no || 0
    );

  const nextResult =
    await sql`
      SELECT id
      FROM career_role_assessments
      WHERE
        assessment_id=
          ${assessmentId}
        AND
        sequence_no >
          ${sequenceNo}
        AND
        lifecycle_status <>
          'completed'
      ORDER BY
        sequence_no
      LIMIT 1
    `;

  let nextRole:
    any = null;

  if (
    nextResult.rows.length
  ) {
    const nextRoleId =
      String(
        nextResult.rows[0].id
      );

    const nextOpen =
      await sql`
        SELECT COUNT(*)::int AS count
        FROM career_role_questions
        WHERE
          role_assessment_id=
            ${nextRoleId}
          AND
          status='open'
      `;

    const hasOpen =
      Number(
        nextOpen.rows[0]
          ?.count || 0
      ) > 0;

    await sql`
      UPDATE career_role_assessments
      SET
        lifecycle_status=${
          hasOpen
            ? 'in_progress'
            : 'review_ready'
        },
        updated_at=NOW()
      WHERE id=
        ${nextRoleId}
    `;

    await recordSuccessGate({
      assessmentId,
      roleAssessmentId:
        nextRoleId,
      gateKey:
        "next_role_activated",
    });

    if (
      !hasOpen
    ) {
      await recordSuccessGate({
        assessmentId,
        roleAssessmentId:
          nextRoleId,
        gateKey:
          "clarification_completed",
      });
    }

    nextRole =
      await getRolePayload(
        nextRoleId
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

  const remainingCount =
    Number(
      remaining.rows[0]
        ?.count || 0
    );

  let assessmentCompleted =
    false;

  if (
    remainingCount === 0
  ) {
    assessmentCompleted =
      true;

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

  const finalRole =
    await getRolePayload(
      roleAssessmentId
    );

  return NextResponse.json(
    {
      success: true,

      completed: true,

      assessmentCompleted,

      role:
        finalRole,

      nextRole,

      successGates:
        finalRole.successGates,
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
      return await handleCVUpload(
        request,
        userId
      );
    }

    const body =
      await request.json();

    switch (
      body.action
    ) {
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
      "analyse-cv route error:",
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