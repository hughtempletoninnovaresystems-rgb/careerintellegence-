import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { sql } from "@vercel/postgres";
import { auth } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface User {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

const getUser = async (
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
  apiKey:
    process.env.GEMINI_API_KEY!,
});

type AssessmentItem = {
  competency: string;
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

function cleanJson(
  text: string
): string {
  return text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
}

/* =================================================
   GET OR CREATE COMPETENCY
================================================= */

async function getOrCreateCompetency(
  competencyName: string
) {
  const cleanName =
    competencyName.trim();

  if (!cleanName) {
    throw new Error(
      "Competency name cannot be empty."
    );
  }

  const existing =
    await sql`
      SELECT
        id,
        name
      FROM competencies
      WHERE
        LOWER(TRIM(name)) =
        LOWER(TRIM(${cleanName}))
      LIMIT 1
    `;

  if (
    existing.rows.length > 0
  ) {
    return {
      id: String(
        existing.rows[0].id
      ),
      name: String(
        existing.rows[0].name
      ),
    };
  }

  console.log(
    "Creating competency:",
    cleanName
  );

  const created =
    await sql`
      INSERT INTO competencies (
        name
      )
      VALUES (
        ${cleanName}
      )
      ON CONFLICT (name)
      DO UPDATE SET
        name =
          EXCLUDED.name
      RETURNING
        id,
        name
    `;

  if (
    created.rows.length === 0
  ) {
    throw new Error(
      `Could not create competency "${cleanName}".`
    );
  }

  return {
    id: String(
      created.rows[0].id
    ),
    name: String(
      created.rows[0].name
    ),
  };
}

/* =================================================
   LINK COMPETENCY TO ROLE
================================================= */

async function linkCompetencyToRole(
  roleId: string,
  competencyId: string,
  importance = 1
) {
  const safeImportance =
    Math.min(
      1,
      Math.max(
        0,
        Number(
          importance
        ) || 1
      )
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
      importance =
        GREATEST(
          role_competencies.importance,
          EXCLUDED.importance
        )
  `;
}

/* =================================================
   GET OR CREATE ASSESSMENT
================================================= */

async function getOrCreateAssessment(
  userId: string,
  roleId: string
) {
  const existing =
    await sql`
      SELECT
        id
      FROM candidate_assessments
      WHERE
        user_id = ${userId}
        AND role_id = ${roleId}
        AND status IN (
          'pending',
          'in_progress'
        )
      ORDER BY
        created_at DESC
      LIMIT 1
    `;

  if (
    existing.rows.length > 0
  ) {
    return String(
      existing.rows[0].id
    );
  }

  const created =
    await sql`
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

  if (
    created.rows.length === 0
  ) {
    throw new Error(
      "Candidate assessment could not be created."
    );
  }

  return String(
    created.rows[0].id
  );
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
      model:
        "gemini-3.6-flash",
      contents: prompt,
      config: {
        responseMimeType:
          "application/json",
      },
    });

  const clean =
    cleanJson(
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
    /*
     * -------------------------------------------------
     * 1. AUTHENTICATED USER
     * -------------------------------------------------
     */

    const session =
      await auth();

    if (
      !session?.user?.email
    ) {
      return NextResponse.json(
        {
          error:
            "No logged-in user is available.",
        },
        { status: 401 }
      );
    }

    const user =
      await getUser(
        session.user.email
      );

    const userId =
      String(user.id);

    console.log(
      "ASSESSMENT USER:",
      userId
    );

    /*
     * -------------------------------------------------
     * 2. READ REQUEST
     * -------------------------------------------------
     */

    const body =
      await req.json();

    const roleId =
      typeof body.roleId ===
        "string" &&
      body.roleId.trim()
        ? body.roleId.trim()
        : "";

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

    /*
     * -------------------------------------------------
     * 3. VALIDATE
     * -------------------------------------------------
     */

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

    if (
      !Array.isArray(
        questions
      )
    ) {
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
     * 4. VERIFY ROLE EXISTS
     * -------------------------------------------------
     */

    const roleResult =
      await sql`
        SELECT
          id,
          name,
          job_title
        FROM roles
        WHERE id = ${roleId}
        LIMIT 1
      `;

    if (
      roleResult.rows.length ===
      0
    ) {
      return NextResponse.json(
        {
          error:
            "The supplied role does not exist.",
        },
        { status: 400 }
      );
    }

    /*
     * -------------------------------------------------
     * 5. GET/CREATE ASSESSMENT
     * -------------------------------------------------
     */

    const assessmentId =
      await getOrCreateAssessment(
        userId,
        roleId
      );

    console.log(
      "ASSESSMENT ID:",
      assessmentId
    );

    /*
     * -------------------------------------------------
     * 6. ONLY ANSWERED QUESTIONS
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

            const value =
              item as {
                competency?: unknown;
                question?: unknown;
                answer?: unknown;
              };

            return (
              typeof value.competency ===
                "string" &&
              typeof value.question ===
                "string" &&
              typeof value.answer ===
                "string" &&
              value.answer.trim()
                .length > 0
            );
          }
        )
        .map(
          (item: unknown) => {
            const value =
              item as {
                competency: string;
                question: string;
                answer: string;
              };

            return {
              competency:
                value.competency.trim(),

              question:
                value.question.trim(),

              answer:
                value.answer.trim(),
            };
          }
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
     * 7. GEMINI EVALUATION
     * -------------------------------------------------
     */

    const evaluations =
      await evaluateAnswers(
        roleTitle,
        answeredQuestions
      );

    console.log(
      "ASSESSMENT EVALUATIONS:",
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
     * 8. PROCESS EACH COMPETENCY
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

      /*
       * Find OR CREATE competency.
       */

      const competency =
        await getOrCreateCompetency(
          evaluation.competency
        );

      /*
       * Make sure role_competencies
       * exists.
       */

      await linkCompetencyToRole(
        roleId,
        competency.id,
        evaluation.confidence
      );

      /*
       * Only demonstrated
       * competencies become
       * candidate knowledge.
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

        demonstrated:
          true,
      });
    }

    /*
     * -------------------------------------------------
     * 9. COMPLETE ASSESSMENT
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
     * IMPORTANT:
     *
     * NO INSERT INTO assessment_responses
     *
     * As requested.
     * -------------------------------------------------
     */

    return NextResponse.json({
      success: true,

      assessmentId,

      roleId,

      roleTitle,

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
  } catch (err) {
    console.error(
      "========== ASSESSMENT ERROR =========="
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