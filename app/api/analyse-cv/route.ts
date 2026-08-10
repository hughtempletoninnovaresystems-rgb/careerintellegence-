import { NextResponse } from "next/server";
import mammoth from "mammoth";
import { GoogleGenAI } from "@google/genai";
import extract from "pdf-extraction";
import { sql } from "@vercel/postgres";
import { auth } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const getUser = async (
  email?: string | null
) => {
  if (!email) {
    throw new Error(
      "No email provided to getUser()"
    );
  }

  const result = await sql`
    SELECT *
    FROM users
    WHERE email = ${email}
    LIMIT 1
  `;

  if (
    result.rows.length === 0
  ) {
    throw new Error(
      `No user found for email: ${email}`
    );
  }

  return result.rows[0];
};

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!,
});

/* =================================================
   TYPES
================================================= */

type CVCompetency = {
  competency: string;
  evidence?: string;
  sourceSection?: string;
  confidence?: number;
};

type DatabaseCompetency = {
  id: string;
  name: string;
  description: string | null;
  importance: number;
};

type Gap = {
  competency: string;
  reason: string;
  question: string;
};

type AssessmentItem = {
  competency: string;
  reason?: string;
  question: string;
  answer: string;
};

type EvaluationResult = {
  competency: string;
  demonstrated: boolean;
  confidence: number;
  evidence: string;
};

/* =================================================
   JSON CLEANING
================================================= */

function cleanJson(text: string): string {
  return text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
}

/* =================================================
   PDF EXTRACTION
================================================= */

async function extractPdfText(buffer: Buffer): Promise<string> {
  const data = await extract(buffer);
  return data.text || "";
}

/* =================================================
   GET OR CREATE COMPETENCY
================================================= */

async function getOrCreateCompetency(
  competencyName: string
): Promise<{
  id: string;
  name: string;
}> {
  const cleanName = competencyName.trim();

  if (!cleanName) {
    throw new Error("Competency name cannot be empty.");
  }

  const existing = await sql`
    SELECT
      id,
      name
    FROM competencies
    WHERE LOWER(TRIM(name)) =
          LOWER(TRIM(${cleanName}))
    LIMIT 1
  `;

  if (existing.rows.length > 0) {
    return {
      id: String(existing.rows[0].id),
      name: String(existing.rows[0].name),
    };
  }

  console.log("Creating competency:", cleanName);

  const created = await sql`
    INSERT INTO competencies (
      name
    )
    VALUES (
      ${cleanName}
    )
    ON CONFLICT (name)
    DO UPDATE SET
      name = EXCLUDED.name
    RETURNING
      id,
      name
  `;

  if (created.rows.length === 0) {
    throw new Error(
      `Could not create competency "${cleanName}".`
    );
  }

  return {
    id: String(created.rows[0].id),
    name: String(created.rows[0].name),
  };
}

/* =================================================
   LINK COMPETENCY TO ROLE
================================================= */

async function linkCompetencyToRole(
  roleId: string,
  competencyId: string,
  importance: number = 1
) {
  const safeImportance = Math.min(
    1,
    Math.max(0, Number(importance) || 1)
  );

  await sql`
    INSERT INTO role_competencies (
      role_id,
      competency_id,
      importance
    )
    VALUES (
      ${roleId},
      ${competencyId},
      ${safeImportance}
    )
    ON CONFLICT (
      role_id,
      competency_id
    )
    DO UPDATE SET
      importance = GREATEST(
        role_competencies.importance,
        EXCLUDED.importance
      )
  `;
}

/* =================================================
   CREATE CANDIDATE ASSESSMENT
================================================= */

async function createCandidateAssessment(
  userId: string,
  roleId: string
): Promise<string> {
  const existing = await sql`
    SELECT
      id
    FROM candidate_assessments
    WHERE
      user_id = ${userId}
      AND role_id = ${roleId}
      AND status IN ('pending', 'in_progress')
    ORDER BY created_at DESC
    LIMIT 1
  `;

  if (existing.rows.length > 0) {
    console.log(
      "Existing candidate assessment:",
      existing.rows[0].id
    );

    return String(existing.rows[0].id);
  }

  const result = await sql`
    INSERT INTO candidate_assessments (
      user_id,
      role_id,
      status
    )
    VALUES (
      ${userId},
      ${roleId},
      'pending'
    )
    RETURNING id
  `;

  if (result.rows.length === 0) {
    throw new Error(
      "Candidate assessment could not be created."
    );
  }

  const assessmentId =
    String(result.rows[0].id);

  console.log(
    "Candidate assessment created:",
    assessmentId
  );

  return assessmentId;
}

/* =================================================
   CREATE ASSESSMENT QUESTIONS
================================================= */

async function createAssessmentQuestions(
  roleId: string,
  gaps: Gap[]
) {
  const createdQuestions: {
    id: string;
    competencyId: string | null;
    competency: string;
    question: string;
  }[] = [];

  for (const gap of gaps) {
    if (
      !gap.competency ||
      !gap.question
    ) {
      continue;
    }

    const competency =
      await getOrCreateCompetency(
        gap.competency
      );

    await linkCompetencyToRole(
      roleId,
      competency.id,
      1
    );

    const existing =
      await sql`
        SELECT
          id
        FROM assessment_questions
        WHERE
          role_id = ${roleId}
          AND competency_id =
            ${competency.id}
          AND question =
            ${gap.question}
        LIMIT 1
      `;

    if (
      existing.rows.length > 0
    ) {
      createdQuestions.push({
        id: String(
          existing.rows[0].id
        ),
        competencyId:
          competency.id,
        competency:
          competency.name,
        question:
          gap.question,
      });

      continue;
    }

    const result = await sql`
      INSERT INTO assessment_questions (
        role_id,
        competency_id,
        question,
        question_type
      )
      VALUES (
        ${roleId},
        ${competency.id},
        ${gap.question},
        'competency'
      )
      RETURNING id
    `;

    createdQuestions.push({
      id: String(
        result.rows[0].id
      ),
      competencyId:
        competency.id,
      competency:
        competency.name,
      question:
        gap.question,
    });
  }

  return createdQuestions;
}

/* =================================================
   SAVE CV KNOWLEDGE
================================================= */

async function saveCVKnowledge(
  userId: string,
  roleId: string,
  cvCompetencies: CVCompetency[]
) {
  const saved = [];

  for (
    const cvCompetency of cvCompetencies
  ) {
    if (
      !cvCompetency.competency?.trim()
    ) {
      continue;
    }

    const competency =
      await getOrCreateCompetency(
        cvCompetency.competency
      );

    /*
     * CV competency belongs to
     * this role.
     */
    await linkCompetencyToRole(
      roleId,
      competency.id,
      cvCompetency.confidence ?? 1
    );

    const confidence =
      Math.min(
        1,
        Math.max(
          0,
          Number(
            cvCompetency.confidence
          ) || 0
        )
      );

    /*
     * Save candidate knowledge.
     */
    const knowledgeResult =
      await sql`
        INSERT INTO candidate_knowledge (
          user_id,
          role_id,
          competency_id,
          confidence
        )
        VALUES (
          ${userId},
          ${roleId},
          ${competency.id},
          ${confidence}
        )
        ON CONFLICT (
          user_id,
          role_id,
          competency_id
        )
        DO UPDATE SET
          confidence =
            GREATEST(
              candidate_knowledge.confidence,
              EXCLUDED.confidence
            ),
          updated_at = now()
        RETURNING
          id,
          confidence
      `;

    const knowledge =
      knowledgeResult.rows[0];

    /*
     * Save CV evidence.
     */
    if (
      cvCompetency.evidence?.trim()
    ) {
      await sql`
        INSERT INTO knowledge_evidence (
          candidate_knowledge_id,
          evidence,
          source_type,
          source_section,
          confidence
        )
        VALUES (
          ${knowledge.id},
          ${cvCompetency.evidence},
          'cv',
          ${
            cvCompetency.sourceSection ||
            'CV'
          },
          ${confidence}
        )
      `;
    }

    saved.push({
      competencyId:
        competency.id,
      competency:
        competency.name,
      confidence:
        Number(
          knowledge.confidence
        ),
      evidence:
        cvCompetency.evidence || "",
    });
  }

  return saved;
}

/* =================================================
   CV INFORMATION
================================================= */

async function extractCVInformation(
  cvText: string
) {
  const prompt = `
Analyse this CV.

Extract:

1. Candidate name
2. Current or most recent job title
3. Competencies explicitly supported by the CV

Return ONLY valid JSON.

{
  "candidateName": "",
  "currentRole": "",
  "competencies": [
    {
      "competency": "",
      "evidence": "",
      "sourceSection": "",
      "confidence": 0.0
    }
  ]
}

Rules:

- Do not invent competencies.
- Only use information supported by the CV.
- Evidence must come from the CV.
- confidence must be between 0.0 and 1.0.
- Do not return markdown.
- Do not return explanations outside the JSON.

CV:

${cvText}
`;

  const response =
    await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: prompt,
      config: {
        responseMimeType:
          "application/json",
      },
    });

  const clean = cleanJson(
    response.text ?? ""
  );

  if (!clean) {
    throw new Error(
      "Gemini returned an empty CV analysis."
    );
  }

  return JSON.parse(clean);
}

/* =================================================
   GENERATE GAP QUESTIONS
================================================= */

async function generateGapQuestions(
  roleTitle: string,
  gaps: {
    competency: string;
    reason: string;
  }[],
  cvText: string
): Promise<Gap[]> {
  if (gaps.length === 0) {
    return [];
  }

  const prompt = `
You are conducting a professional competency assessment.

JOB TITLE:
${roleTitle}

The following competencies have been identified as gaps
because the CV does not provide sufficient evidence.

GAPS:
${JSON.stringify(gaps, null, 2)}

CV:
${cvText}

Create ONE practical assessment question for EVERY gap.

Return ONLY valid JSON:

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

- Return one question for every supplied gap.
- Do not remove gaps.
- Do not combine gaps.
- Do not invent candidate evidence.
- Questions must directly test the named competency.
- Questions should allow the candidate to demonstrate real experience.
- Questions should be specific to the job.
- Do not ask generic questions.
- Do not include markdown.
`;

  const response =
    await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: prompt,
      config: {
        responseMimeType:
          "application/json",
      },
    });

  const clean = cleanJson(
    response.text ?? ""
  );

  if (!clean) {
    throw new Error(
      "Gemini returned an empty response when generating questions."
    );
  }

  const parsed =
    JSON.parse(clean);

  if (
    !Array.isArray(
      parsed.gaps
    )
  ) {
    return [];
  }

  return parsed.gaps;
}

/* =================================================
   IDENTIFY DATABASE GAPS
================================================= */

function identifyGaps(
  databaseCompetencies: DatabaseCompetency[],
  cvCompetencies: CVCompetency[]
) {
  const gaps: {
    competency: string;
    reason: string;
  }[] = [];

  const matchedCompetencies:
    CVCompetency[] = [];

  for (
    const dbCompetency of databaseCompetencies
  ) {
    const dbName =
      dbCompetency.name
        .trim()
        .toLowerCase();

    const match =
      cvCompetencies.find(
        (cv) => {
          const cvName =
            cv.competency
              .trim()
              .toLowerCase();

          return (
            cvName === dbName ||
            cvName.includes(
              dbName
            ) ||
            dbName.includes(
              cvName
            )
          );
        }
      );

    if (match) {
      matchedCompetencies.push({
        ...match,
        competency:
          dbCompetency.name,
      });
    } else {
      gaps.push({
        competency:
          dbCompetency.name,
        reason:
          "The CV does not provide sufficient evidence for this competency.",
      });
    }
  }

  return {
    gaps,
    matchedCompetencies,
  };
}

/* =================================================
   NEW ROLE ANALYSIS
================================================= */

async function analyseNewRole(
  currentRole: string,
  cvCompetencies: CVCompetency[],
  cvText: string
): Promise<Gap[]> {
  const prompt = `
You are conducting a capability assessment for a new job role.

JOB TITLE:
${currentRole}

CV COMPETENCIES:
${JSON.stringify(
    cvCompetencies,
    null,
    2
  )}

CV:
${cvText}

This job role does not currently exist in the knowledge database.

Identify important competencies normally required for this
job role and determine which ones are NOT sufficiently evidenced
by the candidate CV.

Return ONLY valid JSON:

{
  "gaps": [
    {
      "competency": "",
      "reason": ""
    }
  ]
}

Rules:

- Identify realistic competencies for the specified job title.
- Do not claim the candidate possesses a competency without evidence.
- Include competencies where the CV lacks sufficient evidence.
- Do not ask questions yet.
- Do not include markdown.
`;

  const response =
    await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: prompt,
      config: {
        responseMimeType:
          "application/json",
      },
    });

  const clean = cleanJson(
    response.text ?? ""
  );

  if (!clean) {
    throw new Error(
      "Gemini returned an empty new-role assessment."
    );
  }

  const parsed =
    JSON.parse(clean);

  const initialGaps =
    Array.isArray(
      parsed.gaps
    )
      ? parsed.gaps
      : [];

  return generateGapQuestions(
    currentRole,
    initialGaps,
    cvText
  );
}

/* =================================================
   HANDLE CV UPLOAD
================================================= */

async function handleCVUpload(
  req: Request
) {
  /*
   * -------------------------------------------------
   * GET LOGGED-IN USER
   * -------------------------------------------------
   */

  const session =
    await auth();

  const user_info = await getUser(session?.user?.email);
  const userId = user_info.id

  if (!userId) {
    return NextResponse.json(
      {
        error:
          "No authenticated user was found.",
      },
      { status: 401 }
    );
  }

  console.log(
    "CV upload user:",
    userId
  );

  /*
   * -------------------------------------------------
   * FORM DATA
   * -------------------------------------------------
   */

  const form =
    await req.formData();

  const file =
    form.get("cv");

  if (
    !(file instanceof File)
  ) {
    return NextResponse.json(
      {
        error:
          "No CV file uploaded.",
      },
      { status: 400 }
    );
  }

  console.log(
    "CV received:",
    file.name,
    file.type,
    file.size
  );

  /*
   * -------------------------------------------------
   * CONVERT FILE
   * -------------------------------------------------
   */

  const buffer =
    Buffer.from(
      await file.arrayBuffer()
    );

  let cvText = "";

  /*
   * -------------------------------------------------
   * PDF
   * -------------------------------------------------
   */

  if (
    file.type ===
      "application/pdf" ||
    file.name
      .toLowerCase()
      .endsWith(".pdf")
  ) {
    cvText =
      await extractPdfText(
        buffer
      );
  }

  /*
   * -------------------------------------------------
   * DOCX
   * -------------------------------------------------
   */

  else if (
    file.type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    file.name
      .toLowerCase()
      .endsWith(".docx")
  ) {
    const data =
      await mammoth.extractRawText({
        buffer,
      });

    cvText =
      data.value;
  }

  else {
    return NextResponse.json(
      {
        error:
          "Only PDF and DOCX files are supported.",
      },
      { status: 400 }
    );
  }

  /*
   * -------------------------------------------------
   * VALIDATE TEXT
   * -------------------------------------------------
   */

  if (!cvText.trim()) {
    return NextResponse.json(
      {
        error:
          "No readable text could be extracted from the CV.",
      },
      { status: 400 }
    );
  }

  console.log(
    "CV text length:",
    cvText.length
  );

  /*
   * -------------------------------------------------
   * GEMINI CV EXTRACTION
   * -------------------------------------------------
   */

  const extracted =
    await extractCVInformation(
      cvText
    );

  const candidateName =
    typeof extracted.candidateName ===
    "string"
      ? extracted.candidateName.trim()
      : "";

  const currentRole =
    typeof extracted.currentRole ===
    "string"
      ? extracted.currentRole.trim()
      : "";

  const cvCompetencies:
    CVCompetency[] =
    Array.isArray(
      extracted.competencies
    )
      ? extracted.competencies
          .filter(
            (item: unknown) =>
              item &&
              typeof item ===
                "object" &&
              typeof (
                item as CVCompetency
              ).competency ===
                "string"
          )
          .map(
            (
              item: CVCompetency
            ) => ({
              competency:
                item.competency.trim(),

              evidence:
                item.evidence,

              sourceSection:
                item.sourceSection,

              confidence:
                typeof item.confidence ===
                "number"
                  ? Math.max(
                      0,
                      Math.min(
                        1,
                        item.confidence
                      )
                    )
                  : undefined,
            })
          )
      : [];

  console.log(
    "Candidate:",
    candidateName
  );

  console.log(
    "Current role:",
    currentRole
  );

  console.log(
    "CV competencies:",
    cvCompetencies.length
  );

  /*
   * -------------------------------------------------
   * NO ROLE
   * -------------------------------------------------
   */

  if (!currentRole) {
    return NextResponse.json({
      mode:
        "capability_assessment",

      roleExists: false,

      candidateName,
      currentRole: "",

      databaseRole: null,

      databaseCompetencies: [],

      cvCompetencies,

      matchedCompetencies: [],

      gaps: [],

      capabilitySummary:
        "A job title could not be identified from the CV.",

      message:
        "No current or most recent job title could be identified from the CV.",
    });
  }

  /*
   * -------------------------------------------------
   * FIND ROLE
   * -------------------------------------------------
   */

  const roleResult =
    await sql`
      SELECT
        id,
        name,
        description,
        job_title
      FROM roles
      WHERE
        LOWER(TRIM(job_title)) =
          LOWER(TRIM(${currentRole}))
        OR
        LOWER(TRIM(name)) =
          LOWER(TRIM(${currentRole}))
      LIMIT 1
    `;

  console.log(
    "Matching roles:",
    roleResult.rows.length
  );

  /*
   * =================================================
   * NEW ROLE
   * =================================================
   */

  if (
    roleResult.rows.length ===
    0
  ) {
    console.log(
      "New role detected:",
      currentRole
    );

    /*
     * -------------------------------------------------
     * CREATE ROLE
     * -------------------------------------------------
     */

    const newRoleResult =
      await sql`
        INSERT INTO roles (
          name,
          job_title,
          description
        )
        VALUES (
          ${currentRole},
          ${currentRole},
          ${"Role created automatically from CV capability assessment."}
        )
        ON CONFLICT (name)
        DO UPDATE SET
          job_title =
            EXCLUDED.job_title,
          updated_at =
            now()
        RETURNING
          id,
          name,
          description,
          job_title
      `;

    if (
      newRoleResult.rows.length ===
      0
    ) {
      throw new Error(
        "The new role could not be created."
      );
    }

    const newRole =
      newRoleResult.rows[0];

    const newRoleId =
      String(newRole.id);

    console.log(
      "New role created:",
      newRoleId
    );

    /*
     * -------------------------------------------------
     * SAVE CV COMPETENCIES
     * -------------------------------------------------
     */

    const savedCVKnowledge =
      await saveCVKnowledge(
        userId,
        newRoleId,
        cvCompetencies
      );

    console.log(
      "CV competencies saved:",
      savedCVKnowledge.length
    );

    /*
     * -------------------------------------------------
     * AI GAP ANALYSIS
     * -------------------------------------------------
     */

    const gaps =
      await analyseNewRole(
        currentRole,
        cvCompetencies,
        cvText
      );

    console.log(
      "New role questions:",
      gaps.length
    );

    /*
     * -------------------------------------------------
     * CREATE GAP COMPETENCIES
     * AND ROLE LINKS
     * -------------------------------------------------
     */

    for (
      const gap of gaps
    ) {
      const competency =
        await getOrCreateCompetency(
          gap.competency
        );

      await linkCompetencyToRole(
        newRoleId,
        competency.id,
        1
      );
    }

    /*
     * -------------------------------------------------
     * CREATE CANDIDATE ASSESSMENT
     * -------------------------------------------------
     */

    const assessmentId =
      await createCandidateAssessment(
        userId,
        newRoleId
      );

    /*
     * -------------------------------------------------
     * CREATE QUESTIONS
     * -------------------------------------------------
     */

    const assessmentQuestions =
      await createAssessmentQuestions(
        newRoleId,
        gaps
      );

    /*
     * -------------------------------------------------
     * RETURN
     * -------------------------------------------------
     */

    return NextResponse.json({
      mode:
        "capability_assessment",

      roleExists: false,

      candidateName,
      currentRole,

      databaseRole: {
        id: newRoleId,

        name: String(
          newRole.name
        ),

        description:
          newRole.description
            ? String(
                newRole.description
              )
            : undefined,

        jobTitle:
          newRole.job_title
            ? String(
                newRole.job_title
              )
            : undefined,
      },

      assessmentId,

      databaseCompetencies: [],

      cvCompetencies,

      savedCVKnowledge,

      matchedCompetencies: [],

      gaps,

      assessmentQuestions,

      capabilitySummary:
        gaps.length > 0
          ? "A new role has been created, its competencies have been added to the knowledge database, and assessment questions have been created."
          : "A new role has been created and no additional competency gaps were identified.",

      message:
        gaps.length > 0
          ? `New role "${currentRole}" created. ${gaps.length} capability assessment question${
              gaps.length === 1
                ? ""
                : "s"
            } created.`
          : `New role "${currentRole}" created.`,
    });
  }

  /*
   * =================================================
   * EXISTING ROLE
   * =================================================
   */

  const databaseRole =
    roleResult.rows[0];

  const roleId =
    String(databaseRole.id);

  console.log(
    "Existing role:",
    databaseRole.job_title
  );

  /*
   * -------------------------------------------------
   * GET ROLE COMPETENCIES
   * -------------------------------------------------
   */

  const competencyResult =
    await sql`
      SELECT
        c.id,
        c.name,
        c.description,
        rc.importance
      FROM role_competencies rc
      INNER JOIN competencies c
        ON c.id =
          rc.competency_id
      WHERE
        rc.role_id =
          ${roleId}
      ORDER BY
        rc.importance DESC,
        c.name ASC
    `;

  const databaseCompetencies:
    DatabaseCompetency[] =
    competencyResult.rows.map(
      (row) => ({
        id: String(
          row.id
        ),

        name: String(
          row.name
        ),

        description:
          row.description ===
          null
            ? null
            : String(
                row.description
              ),

        importance:
          Number(
            row.importance
          ),
      })
    );

  /*
   * -------------------------------------------------
   * COMPARE CV
   * -------------------------------------------------
   */

  const comparison =
    identifyGaps(
      databaseCompetencies,
      cvCompetencies
    );

  console.log(
    "Matched competencies:",
    comparison
      .matchedCompetencies
      .length
  );

  console.log(
    "Gaps:",
    comparison.gaps.length
  );

  /*
   * -------------------------------------------------
   * SAVE CV KNOWLEDGE
   * -------------------------------------------------
   */

  const savedCVKnowledge =
    await saveCVKnowledge(
      userId,
      roleId,
      comparison.matchedCompetencies
    );

  /*
   * -------------------------------------------------
   * GENERATE QUESTIONS
   * -------------------------------------------------
   */

  const gaps =
    await generateGapQuestions(
      currentRole,
      comparison.gaps,
      cvText
    );

  /*
   * -------------------------------------------------
   * CREATE GAP COMPETENCIES
   * -------------------------------------------------
   */

  for (
    const gap of gaps
  ) {
    const competency =
      await getOrCreateCompetency(
        gap.competency
      );

    await linkCompetencyToRole(
      roleId,
      competency.id,
      1
    );
  }

  /*
   * -------------------------------------------------
   * CREATE ASSESSMENT
   * -------------------------------------------------
   */

  const assessmentId =
    await createCandidateAssessment(
      userId,
      roleId
    );

  /*
   * -------------------------------------------------
   * CREATE QUESTIONS
   * -------------------------------------------------
   */

  const assessmentQuestions =
    await createAssessmentQuestions(
      roleId,
      gaps
    );

  /*
   * -------------------------------------------------
   * RETURN
   * -------------------------------------------------
   */

  return NextResponse.json({
    mode: "comparison",

    roleExists: true,

    candidateName,
    currentRole,

    databaseRole: {
      id: roleId,

      name: String(
        databaseRole.name
      ),

      description:
        databaseRole.description
          ? String(
              databaseRole.description
            )
          : undefined,

      jobTitle:
        databaseRole.job_title
          ? String(
              databaseRole.job_title
            )
          : undefined,
    },

    assessmentId,

    databaseCompetencies,

    cvCompetencies,

    matchedCompetencies:
      comparison.matchedCompetencies,

    savedCVKnowledge,

    gaps,

    assessmentQuestions,

    message:
      gaps.length > 0
        ? `${gaps.length} competency gap question${
            gaps.length ===
            1
              ? ""
              : "s"
          } created.`
        : "No competency gaps identified.",
  });
}

/* =================================================
   HANDLE ASSESSMENT
================================================= */

async function handleAssessment(
  req: Request
) {
  /*
   * -------------------------------------------------
   * GET LOGGED-IN USER
   * -------------------------------------------------
   */

  const session =
    await auth();

  const userId =
    session?.user?.id;

  if (!userId) {
    return NextResponse.json(
      {
        error:
          "No authenticated user was found.",
      },
      { status: 401 }
    );
  }

  /*
   * -------------------------------------------------
   * READ JSON
   * -------------------------------------------------
   */

  const body =
    await req.json();

  const roleId =
    typeof body.roleId ===
      "string" &&
    body.roleId.trim()
      ? body.roleId.trim()
      : null;

  const roleTitle =
    typeof body.roleTitle ===
    "string"
      ? body.roleTitle.trim()
      : "";

  const questions =
    Array.isArray(
      body.questions
    )
      ? body.questions
      : Array.isArray(
          body.gaps
        )
      ? body.gaps
      : null;

  if (!roleId) {
    return NextResponse.json(
      {
        error:
          "A role ID is required.",
      },
      { status: 400 }
    );
  }

  if (!roleTitle) {
    return NextResponse.json(
      {
        error:
          "A role title is required.",
      },
      { status: 400 }
    );
  }

  if (!Array.isArray(questions)) {
    return NextResponse.json(
      {
        error:
          "Answers must be an array.",
      },
      { status: 400 }
    );
  }

  /*
   * -------------------------------------------------
   * CREATE/FIND ASSESSMENT
   * -------------------------------------------------
   */

  const assessmentId =
    await createCandidateAssessment(
      userId,
      roleId
    );

  /*
   * -------------------------------------------------
   * ONLY ANSWERED QUESTIONS
   * -------------------------------------------------
   */

  const answeredQuestions:
    AssessmentItem[] =
    questions
      .filter(
        (item: unknown) => {
          if (
            !item ||
            typeof item !==
              "object"
          ) {
            return false;
          }

          const answer =
            (
              item as {
                answer?: unknown;
              }
            ).answer;

          return (
            typeof answer ===
              "string" &&
            answer.trim()
              .length > 0
          );
        }
      )
      .map(
        (item: unknown) => {
          const value =
            item as {
              competency?: unknown;
              reason?: unknown;
              question?: unknown;
              answer?: unknown;
            };

          return {
            competency:
              String(
                value.competency ??
                  ""
              ).trim(),

            question:
              String(
                value.question ??
                  ""
              ),

            answer:
              String(
                value.answer ??
                  ""
              ).trim(),
          };
        }
      )
      .filter(
        (item) =>
          item.competency &&
          item.question &&
          item.answer
      );

  if (
    answeredQuestions.length ===
    0
  ) {
    return NextResponse.json(
      {
        error:
          "Please provide at least one answer.",
      },
      { status: 400 }
    );
  }

  /*
   * -------------------------------------------------
   * EVALUATE
   * -------------------------------------------------
   */

  const evaluations =
    await evaluateAnswers(
      roleTitle,
      answeredQuestions
    );

  console.log(
    "Assessment evaluations:",
    evaluations
  );

  const savedCompetencies: {
    competencyId: string;
    competency: string;
    confidence: number;
    evidence: string;
    demonstrated: boolean;
  }[] = [];

  /*
   * -------------------------------------------------
   * PROCESS EVALUATIONS
   * -------------------------------------------------
   */

  for (
    const evaluation of evaluations
  ) {
    if (
      !evaluation.competency
    ) {
      continue;
    }

    const competency =
      await getOrCreateCompetency(
        evaluation.competency
      );

    /*
     * Make absolutely sure the
     * competency is connected
     * to this role.
     */

    await linkCompetencyToRole(
      roleId,
      competency.id,
      evaluation.confidence
    );

    /*
     * Not demonstrated.
     */

    if (
      !evaluation.demonstrated
    ) {
      continue;
    }

    const confidence =
      Math.min(
        1,
        Math.max(
          0,
          Number(
            evaluation.confidence
          ) || 0
        )
      );

    /*
     * -------------------------------------------------
     * CANDIDATE KNOWLEDGE
     * -------------------------------------------------
     */

    const knowledgeResult =
      await sql`
        INSERT INTO candidate_knowledge (
          user_id,
          role_id,
          competency_id,
          confidence
        )
        VALUES (
          ${userId},
          ${roleId},
          ${competency.id},
          ${confidence}
        )
        ON CONFLICT (
          user_id,
          role_id,
          competency_id
        )
        DO UPDATE SET
          confidence =
            GREATEST(
              candidate_knowledge.confidence,
              EXCLUDED.confidence
            ),
          updated_at =
            now()
        RETURNING
          id,
          confidence
      `;

    const knowledge =
      knowledgeResult.rows[0];

    /*
     * -------------------------------------------------
     * KNOWLEDGE EVIDENCE
     * -------------------------------------------------
     */

    if (
      evaluation.evidence &&
      evaluation.evidence.trim()
    ) {
      await sql`
        INSERT INTO knowledge_evidence (
          candidate_knowledge_id,
          evidence,
          source_type,
          source_section,
          confidence
        )
        VALUES (
          ${knowledge.id},
          ${evaluation.evidence},
          'assessment',
          ${roleTitle},
          ${confidence}
        )
      `;
    }

    savedCompetencies.push({
      competencyId:
        competency.id,

      competency:
        competency.name,

      confidence:
        Number(
          knowledge.confidence
        ),

      evidence:
        evaluation.evidence,

      demonstrated: true,
    });
  }

  /*
   * -------------------------------------------------
   * MARK ASSESSMENT COMPLETE
   * -------------------------------------------------
   */

  await sql`
    UPDATE candidate_assessments
    SET
      status = 'completed',
      completed_at = now()
    WHERE
      id = ${assessmentId}
      AND user_id = ${userId}
  `;

  /*
   * -------------------------------------------------
   * IMPORTANT
   *
   * We deliberately DO NOT write to
   * assessment_responses.
   *
   * -------------------------------------------------
   */

  return NextResponse.json({
    success: true,

    assessmentId,

    savedCompetencies,

    savedCompetencyCount:
      savedCompetencies.length,

    message:
      savedCompetencies.length >
      0
        ? `${savedCompetencies.length} competenc${
            savedCompetencies.length ===
            1
              ? "y"
              : "ies"
          } added or updated.`
        : "No new competencies were sufficiently demonstrated.",
  });
}

/* =================================================
   EVALUATE ANSWERS
================================================= */

async function evaluateAnswers(
  roleTitle: string,
  items: AssessmentItem[]
): Promise<EvaluationResult[]> {
  const prompt = `
You are evaluating a professional competency assessment.

JOB TITLE:
${roleTitle}

ASSESSMENT QUESTIONS AND ANSWERS:

${JSON.stringify(
    items,
    null,
    2
  )}

Evaluate every competency.

Return ONLY valid JSON:

{
  "results": [
    {
      "competency": "",
      "demonstrated": true,
      "confidence": 0.0,
      "evidence": ""
    }
  ]
}

Rules:

- Return exactly one result for every supplied competency.
- Evaluate the answer against the named competency.
- demonstrated must be true only when the answer provides meaningful evidence.
- confidence must be between 0.0 and 1.0.
- Do not invent experience.
- Do not assume a competency from the job title.
- Evidence must be based only on the candidate answer.
- Evidence must be a concise summary.
- Do not reproduce the candidate's full answer.
- Do not quote the candidate's answer.
- If demonstrated is false, briefly explain why.
- Do not use markdown.
`;

  const response =
    await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: prompt,
      config: {
        responseMimeType:
          "application/json",
      },
    });

  const clean = cleanJson(
    response.text ?? ""
  );

  if (!clean) {
    throw new Error(
      "Gemini returned an empty assessment evaluation."
    );
  }

  const parsed =
    JSON.parse(clean);

  if (
    !Array.isArray(
      parsed.results
    )
  ) {
    throw new Error(
      "Gemini returned an invalid assessment result."
    );
  }

  return parsed.results;
}

/* =================================================
   POST
================================================= */

export async function POST(
  req: Request
) {
  try {
    const contentType =
      req.headers.get(
        "content-type"
      ) || "";

    console.log(
      "Request Content-Type:",
      contentType
    );

    /*
     * CV UPLOAD
     */

    if (
      contentType
        .toLowerCase()
        .includes(
          "multipart/form-data"
        )
    ) {
      return await handleCVUpload(
        req
      );
    }

    /*
     * ASSESSMENT
     */

    if (
      contentType
        .toLowerCase()
        .includes(
          "application/json"
        )
    ) {
      return await handleAssessment(
        req
      );
    }

    return NextResponse.json(
      {
        error:
          'Content-Type must be "multipart/form-data" for CV uploads or "application/json" for assessments.',
      },
      { status: 415 }
    );
  } catch (err) {
    console.error(
      "========== ANALYSE CV / ASSESSMENT ERROR =========="
    );

    console.error(err);

    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : String(err),
      },
      { status: 500 }
    );
  }
}