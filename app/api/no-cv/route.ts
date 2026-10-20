import { NextResponse } from "next/server";



import { getAuthenticatedUserId } from "@/app/lib/career-intelligence/auth";



import { findCanonicalRole, findCompetency, getRoleCompetencies, verifyRoleOwnership } from "@/app/lib/career-intelligence/data/repository";



import { createCareerAssessment, createCareerRoleAssessment } from "@/app/lib/career-intelligence/data/assessments";



import { addClarificationRound as replaceOpenQuestions, stageCapability } from "@/app/lib/career-intelligence/data/staging";



import { generateValidatedJson } from "@/app/lib/career-intelligence/ai/provider";



import { manualRoleAnalysisSchema, editedCapabilityReassessmentSchema } from "@/app/lib/career-intelligence/ai/schemas";



import { getSuccessGates, recordSuccessGate } from "@/app/lib/career-intelligence/success-gates";



import { clamp } from "@/app/lib/career-intelligence/utils";



import { noCvActionSchema } from "@/app/lib/career-intelligence/http/request-schemas";



import { errorResponse } from "@/app/lib/career-intelligence/http/error-response";



import { getCorrelationId, withCorrelationId } from "@/app/lib/career-intelligence/http/correlation";



import { reviewRoleCapability } from "@/app/lib/career-intelligence/services/capability-review";
import { addCandidateCapability } from "@/app/lib/career-intelligence/services/candidate-capability";
import { recordCapabilityEvidence } from "@/app/lib/career-intelligence/services/provenance";



import { transitionRoleLifecycle } from "@/app/lib/career-intelligence/services/role-lifecycle";



import { updateRoleContext } from "@/app/lib/career-intelligence/services/role-context";



import { assessRoleClarifications } from "@/app/lib/career-intelligence/services/clarification";



import { submitRoleForProfile } from "@/app/lib/career-intelligence/services/role-submission";



import { getManualRolePayload } from "@/app/lib/career-intelligence/services/role-snapshot";



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
      context: { operation: "manual_role_analysis" },



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
      context: { assessmentId, roleAssessmentId, operation: "manual_capability_edit_reassessment" },



    });







  const outcome =



    reassessment.outcome ===



    "clarify"



      ? "needs_clarification"



      : reassessment.outcome;







  const assessedEvidence =



    reassessment



      .evidence



      .trim() || evidence;







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







  // Preserve the candidate's edited text as a distinct source record. The
  // SQL revision trigger's generic snapshot is contextual only and cannot by
  // itself qualify this capability for profile promotion.
  await recordCapabilityEvidence({
    roleAssessmentId,
    roleCapabilityId: capabilityId,
    sourceType: "candidate_edit_reassessment",
    evidenceText: evidence,
    relationshipType:
      outcome === "demonstrated"
        ? "supporting"
        : outcome === "gap"
          ? "contradictory"
          : "context",
    provenance: {
      origin: "candidate_supplied_edit",
      reassessmentOutcome: outcome,
      locatorAvailable: false,
    },
  });

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



        body.competencyName ||



        body.name,







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



   ROLE CONTEXT UPDATE



============================================================ */







async function handleUpdateRole(

  body: any,

  userId: string

) {

  const roleAssessmentId = String(body.roleAssessmentId || "");



  await verifyRoleOwnership(roleAssessmentId, userId);



  const existingRole = await getRolePayload(roleAssessmentId);



  if (existingRole.lifecycleStatus === "completed") {

    return NextResponse.json(

      {

        error: "Completed Phase 1 role context is read-only.",

      },

      {

        status: 409,

      }

    );

  }



  const normalise = (value: unknown) =>

    value == null ? "" : String(value).trim();



  const requiresReassessment =

    normalise(existingRole.organisation) !== normalise(body.organisation) ||

    normalise(existingRole.roleTitle) !== normalise(body.roleTitle) ||

    normalise(existingRole.description) !== normalise(body.description) ||

    normalise(existingRole.fromDate) !== normalise(body.fromDate) ||

    normalise(existingRole.toDate) !== normalise(body.toDate) ||

    normalise(existingRole.fromDatePrecision) !== normalise(body.fromDatePrecision) ||

    normalise(existingRole.toDatePrecision) !== normalise(body.toDatePrecision) ||

    normalise(existingRole.fromDateOriginal) !== normalise(body.fromDateOriginal) ||

    normalise(existingRole.toDateOriginal) !== normalise(body.toDateOriginal) ||

    normalise(existingRole.engagementType) !== normalise(body.engagementType) ||

    normalise(existingRole.employmentType) !== normalise(body.employmentType);



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



  if (requiresReassessment && existingRole.lifecycleStatus !== "in_progress") {

    await transitionRoleLifecycle({

      roleAssessmentId,

      to: "in_progress",

    });

  }



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







      case "add_capability": {
        await addCandidateCapability({
          userId,
          roleAssessmentId: body.roleAssessmentId,
          name: body.competencyName,
          evidence: body.evidence,
        });
        const role = await getRolePayload(body.roleAssessmentId);
        return withCorrelationId(
          NextResponse.json({ success: true, role, successGates: role.successGates }),
          correlationId,
        );
      }

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