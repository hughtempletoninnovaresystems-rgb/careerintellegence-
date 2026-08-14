import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { sql } from "@vercel/postgres";
import { auth } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

type ReviewStatus = "proposed" | "accepted" | "edited" | "rejected";
type CapabilityStatus = "demonstrated" | "gap";
type AssessmentStatus = "proposed" | "needs_clarification" | "assessed";

type ExtractedCapability = {
  competency: string;
  evidence?: string;
  sourceSection?: string;
  confidence?: number;
};

type ExtractedRole = {
  organisationName: string;
  roleTitle: string;
  fromDate?: string;
  toDate?: string;
  roleDescription?: string;
  engagementModel?: string;
  employmentContext?: string;
  capabilities: ExtractedCapability[];
};

type Gap = { competency: string; reason: string; question: string };

type Evaluation = {
  competency: string;
  status: "demonstrated" | "gap" | "clarify";
  confidence: number;
  evidence: string;
  followUpQuestion?: string;
};

function cleanJson(text: string) {
  return text.replace(/```json/gi, "").replace(/```/g, "").trim();
}

function clamp(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

async function getAuthenticatedUserId(): Promise<string> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) throw new Error("No logged-in user is available.");
  const result = await sql`SELECT id FROM users WHERE email = ${email} LIMIT 1`;
  if (!result.rows.length) throw new Error(`No user found for email: ${email}`);
  return String(result.rows[0].id);
}

async function findCanonicalRole(roleTitle: string) {
  const result = await sql`
    SELECT id, name, job_title, description
    FROM roles
    WHERE LOWER(TRIM(job_title)) = LOWER(TRIM(${roleTitle}))
       OR LOWER(TRIM(name)) = LOWER(TRIM(${roleTitle}))
    LIMIT 1
  `;
  return result.rows[0] || null;
}

async function findCompetency(name: string) {
  const result = await sql`
    SELECT id, name FROM competencies
    WHERE LOWER(TRIM(name)) = LOWER(TRIM(${name}))
    LIMIT 1
  `;
  return result.rows[0] || null;
}

async function getRoleCompetencies(roleId: string) {
  const result = await sql`
    SELECT c.id, c.name, c.description, rc.importance
    FROM role_competencies rc
    JOIN competencies c ON c.id = rc.competency_id
    WHERE rc.role_id = ${roleId}
    ORDER BY rc.importance DESC, c.name
  `;
  return result.rows;
}

function nameMatches(a: string, b: string) {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  return x === y || x.includes(y) || y.includes(x);
}

async function createAssessment(userId: string, candidateName: string) {
  const result = await sql`
    INSERT INTO career_assessments (user_id, source_type, status, candidate_name)
    VALUES (${userId}, 'cv', 'in_progress', ${candidateName}) RETURNING id
  `;
  return String(result.rows[0].id);
}

async function createRoleAssessment(assessmentId: string, role: ExtractedRole, sequenceNo: number, canonicalRoleId: string | null, lifecycle: string) {
  const result = await sql`
    INSERT INTO career_role_assessments (
      assessment_id, sequence_no, canonical_role_id, organisation_name,
      proposed_role_title, from_date, to_date, role_description,
      engagement_model, employment_context, lifecycle_status
    ) VALUES (
      ${assessmentId}, ${sequenceNo}, ${canonicalRoleId}, ${role.organisationName},
      ${role.roleTitle}, ${role.fromDate || null}, ${role.toDate || null}, ${role.roleDescription || null},
      ${role.engagementModel || null}, ${role.employmentContext || null}, ${lifecycle}
    ) RETURNING id
  `;
  return String(result.rows[0].id);
}

async function stageCapability(roleAssessmentId: string, input: {
  name: string; sourceType: string; sourceSection?: string; evidence?: string;
  confidence?: number; demonstrated?: boolean; capabilityStatus?: CapabilityStatus;
  assessmentStatus?: AssessmentStatus; reviewStatus?: ReviewStatus;
}) {
  const existing = await findCompetency(input.name);
  const result = await sql`
    INSERT INTO career_role_capabilities (
      role_assessment_id, canonical_competency_id, proposed_competency_name,
      source_type, source_section, evidence, ai_confidence, demonstrated,
      capability_status, assessment_status, review_status
    ) VALUES (
      ${roleAssessmentId}, ${existing ? String(existing.id) : null}, ${input.name.trim()},
      ${input.sourceType}, ${input.sourceSection || null}, ${input.evidence || ""}, ${clamp(input.confidence)},
      ${typeof input.demonstrated === "boolean" ? input.demonstrated : null},
      ${input.capabilityStatus || "demonstrated"}, ${input.assessmentStatus || "assessed"}, ${input.reviewStatus || "proposed"}
    ) RETURNING *
  `;
  return result.rows[0];
}

async function replaceOpenQuestions(roleAssessmentId: string, gaps: Gap[]) {
  const roundResult = await sql`SELECT COALESCE(MAX(round_no),0)+1 AS next_round FROM career_role_questions WHERE role_assessment_id=${roleAssessmentId}`;
  const roundNo = Number(roundResult.rows[0].next_round || 1);
  const created = [];
  for (const gap of gaps) {
    if (!gap.competency?.trim() || !gap.question?.trim()) continue;
    const result = await sql`
      INSERT INTO career_role_questions (role_assessment_id, round_no, competency, reason, question, status)
      VALUES (${roleAssessmentId}, ${roundNo}, ${gap.competency.trim()}, ${gap.reason || ""}, ${gap.question.trim()}, 'open')
      RETURNING id, competency, reason, question
    `;
    created.push(result.rows[0]);
  }
  return created;
}

function mapCapability(row: any) {
  return {
    id: String(row.id),
    assessmentId: row.assessment_id ? String(row.assessment_id) : undefined,
    roleAssessmentId: String(row.role_assessment_id),
    competencyId: row.canonical_competency_id ? String(row.canonical_competency_id) : null,
    proposedCompetencyName: String(row.proposed_competency_name),
    sourceType: String(row.source_type),
    sourceSection: row.source_section ? String(row.source_section) : null,
    evidence: row.evidence ? String(row.evidence) : "",
    confidence: clamp(row.ai_confidence),
    demonstrated: row.demonstrated === null ? null : Boolean(row.demonstrated),
    capabilityStatus: String(row.capability_status),
    assessmentStatus: String(row.assessment_status),
    reviewStatus: String(row.review_status),
    editedCompetencyName: row.edited_competency_name ? String(row.edited_competency_name) : null,
    editedEvidence: row.edited_evidence ? String(row.edited_evidence) : null,
  };
}

async function getRolePayload(roleAssessmentId: string) {
  const roleResult = await sql`SELECT * FROM career_role_assessments WHERE id=${roleAssessmentId} LIMIT 1`;
  if (!roleResult.rows.length) throw new Error("Role assessment not found.");
  const role = roleResult.rows[0];
  const caps = await sql`SELECT * FROM career_role_capabilities WHERE role_assessment_id=${roleAssessmentId} ORDER BY created_at`;
  const gaps = await sql`SELECT id, competency, reason, question FROM career_role_questions WHERE role_assessment_id=${roleAssessmentId} AND status='open' ORDER BY round_no, created_at`;
  return {
    roleAssessmentId: String(role.id),
    canonicalRoleId: role.canonical_role_id ? String(role.canonical_role_id) : null,
    organisationName: String(role.organisation_name || ""),
    roleTitle: String(role.proposed_role_title || ""),
    fromDate: role.from_date ? String(role.from_date) : "",
    toDate: role.to_date ? String(role.to_date) : "",
    roleDescription: role.role_description ? String(role.role_description) : "",
    engagementModel: role.engagement_model ? String(role.engagement_model) : "",
    employmentContext: role.employment_context ? String(role.employment_context) : "",
    lifecycleStatus: String(role.lifecycle_status),
    gaps: gaps.rows.map((g) => ({ id: String(g.id), competency: String(g.competency), reason: String(g.reason || ""), question: String(g.question) })),
    stagedCapabilities: caps.rows.map(mapCapability),
  };
}

async function verifyRoleOwnership(userId: string, roleAssessmentId: string) {
  const result = await sql`
    SELECT cra.id FROM career_role_assessments cra
    JOIN career_assessments ca ON ca.id=cra.assessment_id
    WHERE cra.id=${roleAssessmentId} AND ca.user_id=${userId} LIMIT 1
  `;
  if (!result.rows.length) throw new Error("Role assessment was not found for the current user.");
}

async function evaluateAnswers(roleTitle: string, questions: any[]) {
  const prompt = `
You are evaluating clarification answers for the role "${roleTitle}".
Evaluate each answer and also identify any OTHER capability clearly evidenced by the answers.
Return ONLY valid JSON:
{
  "results":[{"questionId":"","competency":"","status":"demonstrated|gap|clarify","confidence":0.0,"evidence":"","followUpQuestion":""}],
  "emergingCapabilities":[{"competency":"","confidence":0.0,"evidence":""}]
}
Rules:
- demonstrated only when meaningful evidence exists.
- gap when the answer does not demonstrate the capability and another question is unlikely to help.
- clarify only when a focused follow-up question could reasonably resolve uncertainty.
- emergingCapabilities must be supported directly by the supplied answers and must not duplicate a named assessed competency.
- Never invent experience.
- Evidence must be concise.
QUESTIONS AND ANSWERS:${JSON.stringify(questions, null, 2)}`;
  const response = await ai.models.generateContent({ model: "gemini-3.6-flash", contents: prompt, config: { responseMimeType: "application/json" } });
  const parsed = JSON.parse(cleanJson(response.text ?? "{}"));
  return { results: Array.isArray(parsed.results) ? parsed.results : [], emergingCapabilities: Array.isArray(parsed.emergingCapabilities) ? parsed.emergingCapabilities : [] };
}

async function handleAssessRole(userId: string, body: any) {
  const roleAssessmentId = String(body.roleAssessmentId || "").trim();
  if (!roleAssessmentId) return NextResponse.json({ error: "roleAssessmentId is required." }, { status: 400 });
  await verifyRoleOwnership(userId, roleAssessmentId);
  const questions = Array.isArray(body.questions) ? body.questions : [];
  if (!questions.length) return NextResponse.json({ error: "Questions and answers are required." }, { status: 400 });

  const rolePayload = await getRolePayload(roleAssessmentId);
  const evaluation = await evaluateAnswers(rolePayload.roleTitle, questions);
  const staged: any[] = [];
  const followUps: Gap[] = [];

  for (const result of evaluation.results as Evaluation[]) {
    const q = questions.find((x: any) => String(x.gapId || "") === String((result as any).questionId || "") || nameMatches(String(x.competency || ""), result.competency || ""));
    if (q?.gapId) {
      await sql`UPDATE career_role_questions SET status='answered', updated_at=NOW() WHERE id=${String(q.gapId)} AND role_assessment_id=${roleAssessmentId}`;
      await sql`
        INSERT INTO career_role_answers (question_id, role_assessment_id, answer, evaluation_status, evaluation_evidence, evaluation_confidence)
        VALUES (${String(q.gapId)}, ${roleAssessmentId}, ${String(q.answer || "")}, ${result.status}, ${result.evidence || ""}, ${clamp(result.confidence)})
      `;
    }

    if (result.status === "demonstrated") {
      staged.push(await stageCapability(roleAssessmentId, { name: result.competency, sourceType: "assessment", sourceSection: rolePayload.roleTitle, evidence: result.evidence, confidence: result.confidence, demonstrated: true, capabilityStatus: "demonstrated", assessmentStatus: "assessed", reviewStatus: "proposed" }));
    } else if (result.status === "gap") {
      staged.push(await stageCapability(roleAssessmentId, { name: result.competency, sourceType: "assessment", sourceSection: rolePayload.roleTitle, evidence: result.evidence, confidence: result.confidence, demonstrated: false, capabilityStatus: "gap", assessmentStatus: "assessed", reviewStatus: "accepted" }));
    } else if (result.status === "clarify" && result.followUpQuestion?.trim()) {
      followUps.push({ competency: result.competency, reason: result.evidence || "Further evidence is required.", question: result.followUpQuestion.trim() });
    }
  }

  for (const emerging of evaluation.emergingCapabilities) {
    if (!emerging?.competency?.trim()) continue;
    staged.push(await stageCapability(roleAssessmentId, { name: emerging.competency, sourceType: "assessment", sourceSection: "Emerging capability", evidence: emerging.evidence || "", confidence: emerging.confidence, demonstrated: true, capabilityStatus: "demonstrated", assessmentStatus: "assessed", reviewStatus: "proposed" }));
  }

  if (followUps.length) await replaceOpenQuestions(roleAssessmentId, followUps);
  const open = await sql`SELECT COUNT(*)::int AS count FROM career_role_questions WHERE role_assessment_id=${roleAssessmentId} AND status='open'`;
  const requires = Number(open.rows[0].count) > 0;
  await sql`UPDATE career_role_assessments SET lifecycle_status=${requires ? "in_progress" : "review_ready"}, updated_at=NOW() WHERE id=${roleAssessmentId}`;
  const role = await getRolePayload(roleAssessmentId);
  return NextResponse.json({ success: true, roleAssessmentId, stagedCapabilities: role.stagedCapabilities, gaps: role.gaps, lifecycleStatus: role.lifecycleStatus, requiresFurtherClarification: requires, message: requires ? "Further clarification is required." : "Clarification complete. Review the capability evidence for this role." });
}

async function handleReviewCapability(userId: string, body: any) {
  const roleAssessmentId = String(body.roleAssessmentId || "").trim();
  const capabilityId = String(body.capabilityId || "").trim();
  const reviewStatus = String(body.reviewStatus || "").trim() as ReviewStatus;
  if (!roleAssessmentId || !capabilityId) return NextResponse.json({ error: "roleAssessmentId and capabilityId are required." }, { status: 400 });
  if (!["accepted", "edited", "rejected"].includes(reviewStatus)) return NextResponse.json({ error: "Invalid review status." }, { status: 400 });
  await verifyRoleOwnership(userId, roleAssessmentId);
  const result = await sql`
    UPDATE career_role_capabilities SET
      review_status=${reviewStatus},
      edited_competency_name=${reviewStatus === "edited" ? String(body.competencyName || "").trim() || null : null},
      edited_evidence=${reviewStatus === "edited" ? String(body.evidence || "").trim() : null},
      updated_at=NOW()
    WHERE id=${capabilityId} AND role_assessment_id=${roleAssessmentId}
    RETURNING *
  `;
  if (!result.rows.length) return NextResponse.json({ error: "Capability not found." }, { status: 404 });
  return NextResponse.json({ success: true, capability: mapCapability(result.rows[0]) });
}

async function handleUpdateRole(userId: string, body: any) {
  const id = String(body.roleAssessmentId || "").trim();
  if (!id) return NextResponse.json({ error: "roleAssessmentId is required." }, { status: 400 });
  await verifyRoleOwnership(userId, id);
  const title = String(body.roleTitle || "").trim();
  const org = String(body.organisationName || "").trim();
  if (!title || !org) return NextResponse.json({ error: "Organisation and role title are required." }, { status: 400 });
  const canonical = await findCanonicalRole(title);
  await sql`
    UPDATE career_role_assessments SET
      canonical_role_id=${canonical ? String(canonical.id) : null}, organisation_name=${org}, proposed_role_title=${title},
      from_date=${body.fromDate || null}, to_date=${body.toDate || null}, role_description=${body.roleDescription || null},
      engagement_model=${body.engagementModel || null}, employment_context=${body.employmentContext || null}, updated_at=NOW()
    WHERE id=${id}
  `;
  return NextResponse.json({ success: true, role: await getRolePayload(id) });
}

async function finalSubmissionCheck(role: any, caps: any[], gaps: any[], answers: any[]) {
  const prompt = `
Perform a final consistency check for this historical role before it is committed to a candidate Knowledge Profile.
ROLE:${JSON.stringify(role, null, 2)}
APPROVED CAPABILITIES:${JSON.stringify(caps, null, 2)}
CONFIRMED GAPS:${JSON.stringify(gaps, null, 2)}
ASSESSMENT ANSWERS:${JSON.stringify(answers, null, 2)}
Return ONLY JSON:
{"emergingCapabilities":[{"competency":"","confidence":0.0,"evidence":""}],"clarifications":[{"competency":"","reason":"","question":""}]}
Only return an emerging capability when it is directly supported by evidence already present above and is not already represented.
Only request clarification for a material unresolved ambiguity that prevents accurate completion of this role.
Do not invent experience. Prefer empty arrays when no further work is required.`;
  const response = await ai.models.generateContent({ model: "gemini-3.6-flash", contents: prompt, config: { responseMimeType: "application/json" } });
  const parsed = JSON.parse(cleanJson(response.text ?? "{}"));
  return { emergingCapabilities: Array.isArray(parsed.emergingCapabilities) ? parsed.emergingCapabilities : [], clarifications: Array.isArray(parsed.clarifications) ? parsed.clarifications : [] };
}

async function getOrCreateCanonicalCompetency(name: string) {
  const existing = await findCompetency(name);
  if (existing) return { id: String(existing.id), name: String(existing.name) };
  const result = await sql`INSERT INTO competencies(name) VALUES(${name.trim()}) ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id,name`;
  return { id: String(result.rows[0].id), name: String(result.rows[0].name) };
}

async function getOrCreateCanonicalRole(title: string) {
  const existing = await findCanonicalRole(title);
  if (existing) return String(existing.id);
  const result = await sql`
    INSERT INTO roles(name, job_title, description) VALUES(${title}, ${title}, 'Role created from an approved career assessment.')
    ON CONFLICT(name) DO UPDATE SET job_title=EXCLUDED.job_title, updated_at=NOW() RETURNING id
  `;
  return String(result.rows[0].id);
}

async function promoteRole(userId: string, roleAssessmentId: string) {
  const role = await getRolePayload(roleAssessmentId);

  /*
   * Governance rule:
   * Candidate approval promotes knowledge to the candidate profile,
   * but does NOT automatically create or amend shared canonical
   * roles/competencies. Canonical repository enrichment is a
   * separate governed process.
   */
  const canonicalRoleId = role.canonicalRoleId || null;

  const profileRole = await sql`
    INSERT INTO candidate_profile_roles (
      user_id, source_role_assessment_id, canonical_role_id, organisation_name, role_title,
      from_date, to_date, role_description, engagement_model, employment_context
    ) VALUES (
      ${userId}, ${roleAssessmentId}, ${canonicalRoleId}, ${role.organisationName}, ${role.roleTitle},
      ${role.fromDate || null}, ${role.toDate || null}, ${role.roleDescription || null}, ${role.engagementModel || null}, ${role.employmentContext || null}
    ) ON CONFLICT(source_role_assessment_id) DO UPDATE SET
      canonical_role_id=EXCLUDED.canonical_role_id, organisation_name=EXCLUDED.organisation_name,
      role_title=EXCLUDED.role_title, from_date=EXCLUDED.from_date, to_date=EXCLUDED.to_date,
      role_description=EXCLUDED.role_description, engagement_model=EXCLUDED.engagement_model,
      employment_context=EXCLUDED.employment_context, updated_at=NOW()
    RETURNING id
  `;
  const profileRoleId = String(profileRole.rows[0].id);

  const approved = role.stagedCapabilities.filter(
    (c: any) => c.capabilityStatus === "demonstrated" && ["accepted", "edited"].includes(c.reviewStatus)
  );

  for (const item of approved) {
    const finalName =
      item.reviewStatus === "edited" && item.editedCompetencyName
        ? item.editedCompetencyName
        : item.proposedCompetencyName;
    const finalEvidence =
      item.reviewStatus === "edited" && item.editedEvidence
        ? item.editedEvidence
        : item.evidence || "";

    const canonicalCompetency = await findCompetency(finalName);
    const canonicalCompetencyId = canonicalCompetency
      ? String(canonicalCompetency.id)
      : null;

    await sql`
      INSERT INTO candidate_profile_role_capabilities(
        candidate_profile_role_id, competency_id, capability_name, confidence, evidence, source_type
      ) VALUES(
        ${profileRoleId}, ${canonicalCompetencyId}, ${finalName}, ${clamp(item.confidence)}, ${finalEvidence}, ${item.sourceType}
      )
      ON CONFLICT(candidate_profile_role_id, capability_name) DO UPDATE SET
        competency_id=EXCLUDED.competency_id,
        confidence=GREATEST(candidate_profile_role_capabilities.confidence, EXCLUDED.confidence),
        evidence=EXCLUDED.evidence,
        source_type=EXCLUDED.source_type,
        updated_at=NOW()
    `;

    /*
     * Legacy prototype compatibility only when BOTH canonical objects
     * already exist. No shared repository object is created here.
     */
    if (canonicalRoleId && canonicalCompetencyId) {
      await sql`
        INSERT INTO candidate_knowledge(user_id, role_id, competency_id, confidence)
        VALUES(${userId}, ${canonicalRoleId}, ${canonicalCompetencyId}, ${clamp(item.confidence)})
        ON CONFLICT(user_id, role_id, competency_id) DO UPDATE SET
          confidence=GREATEST(candidate_knowledge.confidence, EXCLUDED.confidence),
          updated_at=NOW()
      `;
    }
  }

  const confirmedGaps = role.stagedCapabilities.filter(
    (c: any) => c.capabilityStatus === "gap" && c.assessmentStatus === "assessed"
  );

  for (const gap of confirmedGaps) {
    await sql`
      INSERT INTO candidate_profile_role_gaps(candidate_profile_role_id, competency_name, evidence)
      VALUES(${profileRoleId}, ${gap.proposedCompetencyName}, ${gap.evidence || ""})
      ON CONFLICT(candidate_profile_role_id, competency_name) DO UPDATE SET evidence=EXCLUDED.evidence
    `;
  }

  return approved.length;
}

async function handleSubmitRole(userId: string, body: any) {
  const roleAssessmentId = String(body.roleAssessmentId || "").trim();
  if (!roleAssessmentId) return NextResponse.json({ error: "roleAssessmentId is required." }, { status: 400 });
  await verifyRoleOwnership(userId, roleAssessmentId);
  const role = await getRolePayload(roleAssessmentId);
  if (role.gaps.length) return NextResponse.json({ error: "This role still has open clarification questions." }, { status: 409 });
  const unresolved = role.stagedCapabilities.filter((c: any) => c.capabilityStatus === "demonstrated" && c.reviewStatus === "proposed");
  if (unresolved.length) return NextResponse.json({ error: "Every demonstrated capability must be accepted, edited or rejected before submission." }, { status: 409 });

  const answers = await sql`SELECT answer,evaluation_status,evaluation_evidence FROM career_role_answers WHERE role_assessment_id=${roleAssessmentId} ORDER BY created_at`;
  const approved = role.stagedCapabilities.filter((c: any) => c.capabilityStatus === "demonstrated" && ["accepted", "edited"].includes(c.reviewStatus));
  const confirmedGaps = role.stagedCapabilities.filter((c: any) => c.capabilityStatus === "gap" && c.assessmentStatus === "assessed");
  const check = await finalSubmissionCheck(role, approved, confirmedGaps, answers.rows);

  const emerging: any[] = [];
  for (const item of check.emergingCapabilities) {
    if (!item?.competency?.trim()) continue;
    const already = role.stagedCapabilities.some((c: any) => nameMatches(c.proposedCompetencyName, item.competency));
    if (!already) emerging.push(mapCapability(await stageCapability(roleAssessmentId, { name: item.competency, sourceType: "assessment", sourceSection: "Submission validation", evidence: item.evidence || "", confidence: item.confidence, demonstrated: true, capabilityStatus: "demonstrated", assessmentStatus: "assessed", reviewStatus: "proposed" })));
  }
  if (check.clarifications.length) await replaceOpenQuestions(roleAssessmentId, check.clarifications);

  if (emerging.length || check.clarifications.length) {
    await sql`UPDATE career_role_assessments SET lifecycle_status=${check.clarifications.length ? "in_progress" : "review_ready"}, updated_at=NOW() WHERE id=${roleAssessmentId}`;
    const refreshed = await getRolePayload(roleAssessmentId);
    return NextResponse.json({ success: true, roleAssessmentId, lifecycleStatus: refreshed.lifecycleStatus, emergingCapabilities: emerging, gaps: refreshed.gaps, requiresFurtherClarification: refreshed.gaps.length > 0, message: "Submission identified additional intelligence. Complete the new review items before resubmitting this role." });
  }

  const promotedCapabilityCount = await promoteRole(userId, roleAssessmentId);
  await sql`UPDATE career_role_assessments SET lifecycle_status='completed', completed_at=NOW(), updated_at=NOW() WHERE id=${roleAssessmentId}`;
  const parent = await sql`SELECT assessment_id, sequence_no FROM career_role_assessments WHERE id=${roleAssessmentId}`;
  const assessmentId = String(parent.rows[0].assessment_id);
  const sequenceNo = Number(parent.rows[0].sequence_no);

  // Activate the next role in sequence once the current role completes.
  await sql`
    UPDATE career_role_assessments
    SET lifecycle_status='in_progress', updated_at=NOW()
    WHERE assessment_id=${assessmentId}
      AND sequence_no=${sequenceNo + 1}
      AND lifecycle_status='not_started'
  `;
  const remaining = await sql`SELECT COUNT(*)::int AS count FROM career_role_assessments WHERE assessment_id=${assessmentId} AND lifecycle_status <> 'completed'`;
  if (Number(remaining.rows[0].count) === 0) await sql`UPDATE career_assessments SET status='completed', completed_at=NOW(), updated_at=NOW() WHERE id=${assessmentId}`;
  return NextResponse.json({ success: true, roleAssessmentId, lifecycleStatus: "completed", promotedCapabilityCount, emergingCapabilities: [], gaps: [], requiresFurtherClarification: false, message: "Role submitted successfully." });
}



async function analyseManualRole(role: ExtractedRole, canonicalRoleId: string | null) {
  const expected = canonicalRoleId ? await getRoleCompetencies(canonicalRoleId) : [];
  const prompt = `
You are preparing a capability assessment for a manually entered historical role.
ROLE CONTEXT:${JSON.stringify(role, null, 2)}
${canonicalRoleId ? `APPROVED ROLE CAPABILITIES:${JSON.stringify(expected, null, 2)}` : "This role does not currently exist in the approved role repository."}

Return ONLY valid JSON:
{
  "evidencedCapabilities":[{"competency":"","evidence":"","confidence":0.0}],
  "gaps":[{"competency":"","reason":"","question":""}]
}

Rules:
- Treat the role description as originating evidence, not proof of everything normally associated with the job title.
- Only place a capability in evidencedCapabilities when the supplied role description/context supports it.
- For an existing approved role, create a gap/question for each important repository capability not sufficiently evidenced.
- For a new role, infer a practical prototype-level set of important capabilities and create questions for those not sufficiently evidenced.
- If only a job title is supplied, do not claim capabilities are demonstrated; ask evidence-seeking questions instead.
- Questions should be discursive, practical and specific to the role.
- Do not invent experience.
- Do not return markdown.`;

  const response = await ai.models.generateContent({
    model: "gemini-3.6-flash",
    contents: prompt,
    config: { responseMimeType: "application/json" },
  });
  const parsed = JSON.parse(cleanJson(response.text ?? "{}"));
  return {
    evidencedCapabilities: Array.isArray(parsed.evidencedCapabilities) ? parsed.evidencedCapabilities : [],
    gaps: Array.isArray(parsed.gaps) ? parsed.gaps : [],
  };
}

async function handleManualStart(userId: string, body: any) {
  const inputRoles = Array.isArray(body.roles) ? body.roles : [];
  if (!inputRoles.length) {
    return NextResponse.json({ error: "Please provide at least one role." }, { status: 400 });
  }

  const normalised: ExtractedRole[] = inputRoles
    .map((r: any) => ({
      organisationName: String(r.organisationName || "").trim(),
      roleTitle: String(r.roleTitle || "").trim(),
      fromDate: String(r.fromDate || "").trim(),
      toDate: String(r.toDate || "").trim(),
      roleDescription: String(r.roleDescription || "").trim(),
      engagementModel: String(r.engagementModel || "").trim(),
      employmentContext: String(r.employmentContext || "").trim(),
      capabilities: [],
    }))
    .filter((r: ExtractedRole) => r.roleTitle && r.organisationName);

  if (!normalised.length || normalised.length !== inputRoles.length) {
    return NextResponse.json({ error: "Every role requires an organisation name and role title." }, { status: 400 });
  }

  const candidateName = String(body.candidateName || "").trim();
  const result = await sql`
    INSERT INTO career_assessments (user_id, source_type, status, candidate_name)
    VALUES (${userId}, 'manual', 'in_progress', ${candidateName || null}) RETURNING id
  `;
  const assessmentId = String(result.rows[0].id);
  const roleIds: string[] = [];

  for (let i = 0; i < normalised.length; i++) {
    const role = normalised[i];
    const canonical = await findCanonicalRole(role.roleTitle);
    const canonicalRoleId = canonical ? String(canonical.id) : null;
    const roleAssessmentId = await createRoleAssessment(
      assessmentId, role, i + 1, canonicalRoleId, i === 0 ? "in_progress" : "not_started"
    );
    roleIds.push(roleAssessmentId);

    const analysis = await analyseManualRole(role, canonicalRoleId);
    for (const c of analysis.evidencedCapabilities) {
      if (!c?.competency?.trim()) continue;
      await stageCapability(roleAssessmentId, {
        name: c.competency,
        sourceType: "manual",
        sourceSection: "Role description",
        evidence: c.evidence || "",
        confidence: c.confidence,
        demonstrated: true,
        capabilityStatus: "demonstrated",
        assessmentStatus: "assessed",
        reviewStatus: "proposed",
      });
    }
    await replaceOpenQuestions(roleAssessmentId, analysis.gaps);
  }

  const roles = [];
  for (const id of roleIds) roles.push(await getRolePayload(id));
  return NextResponse.json({
    assessmentId,
    candidateName,
    roles,
    message: `${roles.length} manually entered role${roles.length === 1 ? "" : "s"} prepared for assessment.`,
  });
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return NextResponse.json({ error: "The no-CV route accepts application/json requests." }, { status: 415 });
    }

    const userId = await getAuthenticatedUserId();
    const body = await req.json();
    const action = String(body.action || "");

    if (action === "start_manual") return await handleManualStart(userId, body);
    if (action === "assess_role") return await handleAssessRole(userId, body);
    if (action === "review_capability") return await handleReviewCapability(userId, body);
    if (action === "update_role_context") return await handleUpdateRole(userId, body);
    if (action === "submit_role") return await handleSubmitRole(userId, body);

    return NextResponse.json({ error: `Unknown action "${action}".` }, { status: 400 });
  } catch (err) {
    console.error("CAREER NO-CV ROUTE ERROR", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
