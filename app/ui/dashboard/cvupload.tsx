"use client";

import { useMemo, useState } from "react";

/*
 * ============================================================
 * CAREER INTELLIGENCE — CV / NO-CV ASSESSMENT VIEW
 * ============================================================
 *
 * ROUTES
 *
 * CV:
 *   /api/analyse-cv
 *
 * NO CV / MANUAL:
 *   /api/no-cv
 *
 * DATE RULE
 *
 * Current role:
 *   toDate = ""
 *   toDatePrecision = "ongoing"
 *   toDateOriginal = "Present"
 *
 * Historical role:
 *   toDate = YYYY-MM-DD
 *   toDatePrecision = day/month/year
 * ============================================================
 */

const ANALYSE_CV_ROUTE =
  "/api/analyse-cv";

const NO_CV_ROUTE =
  "/api/no-cv";

/* ============================================================
   TYPES
============================================================ */

type JourneySource =
  | "cv"
  | "manual";

type DatePrecision =
  | "day"
  | "month"
  | "year"
  | "ongoing"
  | "unknown";

type SuccessGate = {
  id: number | string;

  assessmentId?: string;

  roleAssessmentId?:
    | string
    | null;

  scopeKey?: string;

  gateKey: string;

  status: string;

  metadata?: Record<
    string,
    unknown
  >;

  achievedAt?: string;
};

type Capability = {
  id: string;

  competencyId?:
    | string
    | null;

  name: string;

  evidence?:
    | string
    | null;

  confidence?: number;

  capabilityStatus?:
    | "demonstrated"
    | "gap";

  assessmentStatus?:
    string;

  reviewStatus?:
    | "proposed"
    | "accepted"
    | "edited"
    | "rejected";

  editedName?:
    | string
    | null;

  editedEvidence?:
    | string
    | null;

  source?:
    | string
    | null;
};

type ClarificationQuestion = {
  id: string;

  capability: string;

  question: string;

  reason?:
    | string
    | null;

  answer?:
    | string
    | null;

  answeredAt?:
    | string
    | null;
};

type RoleAssessment = {
  id: string;

  assessmentId?: string;

  roleIndex?: number;

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

  canonicalRoleId?:
    | string
    | null;

  lifecycleStatus?: string;

  capabilities:
    Capability[];

  questions:
    ClarificationQuestion[];

  successGates?:
    SuccessGate[];

  source:
    JourneySource;
};

type ManualRole = {
  organisation: string;

  roleTitle: string;

  fromDate: string;

  toDate: string;

  fromDatePrecision:
    DatePrecision;

  toDatePrecision:
    DatePrecision;

  fromDateOriginal:
    string;

  toDateOriginal:
    string;

  currentRole:
    boolean;

  description: string;

  engagementType:
    string;

  employmentType:
    string;
};

type ViewMode =
  | "choice"
  | "cv"
  | "manual"
  | "assessment"
  | "complete";

/* ============================================================
   SUCCESS GATES
============================================================ */

function extractSuccessGates(
  data: any
): SuccessGate[] {
  if (
    Array.isArray(
      data?.successGates
    )
  ) {
    return data.successGates;
  }

  if (
    Array.isArray(
      data?.role
        ?.successGates
    )
  ) {
    return data.role
      .successGates;
  }

  return [];
}

function isGatePassed(
  status?: string
) {
  return (
    status ===
      "achieved" ||
    status ===
      "passed"
  );
}

function gateDisplayStatus(
  status?: string
) {
  if (
    isGatePassed(status)
  ) {
    return "passed";
  }

  if (
    status === "failed"
  ) {
    return "failed";
  }

  return (
    status ||
    "pending"
  );
}

function formatGateName(
  gateKey: string
) {
  const names:
    Record<
      string,
      string
    > = {
    assessment_started:
      "Assessment started",

    cv_uploaded:
      "CV uploaded",

    cv_text_extracted:
      "CV text extracted",

    roles_identified:
      "Roles identified",

    roles_entered:
      "Roles entered",

    role_created:
      "Role created",

    role_analysis_completed:
      "Role analysis completed",

    role_context_updated:
      "Role context updated",

    clarification_evaluation_completed:
      "Clarification evaluation completed",

    clarification_completed:
      "Clarification completed",

    capability_review_completed:
      "Capability review completed",

    all_demonstrated_capabilities_reviewed:
      "All demonstrated capabilities reviewed",

    final_submission_check_passed:
      "Final submission check passed",

    role_promoted:
      "Role promoted to profile",

    role_completed:
      "Role completed",

    next_role_activated:
      "Next role activated",

    assessment_completed:
      "Assessment completed",
  };

  if (
    names[gateKey]
  ) {
    return names[
      gateKey
    ];
  }

  return gateKey
    .replace(
      /_/g,
      " "
    )
    .replace(
      /\b\w/g,
      (character) =>
        character.toUpperCase()
    );
}

/* ============================================================
   NORMALISATION
============================================================ */

function normaliseCapability(
  raw: any
): Capability {
  return {
    id:
      String(
        raw?.id ??
          ""
      ),

    competencyId:
      raw?.competencyId ??
      raw?.canonicalCompetencyId ??
      null,

    name:
      String(
        raw?.name ??
          raw?.proposedCompetencyName ??
          raw?.competency ??
          ""
      ),

    evidence:
      raw?.evidence ??
      "",

    confidence:
      Number(
        raw?.confidence ??
          0
      ),

    capabilityStatus:
      raw?.capabilityStatus ??
      (
        raw?.demonstrated ===
        false
          ? "gap"
          : "demonstrated"
      ),

    assessmentStatus:
      raw?.assessmentStatus ??
      "assessed",

    reviewStatus:
      raw?.reviewStatus ??
      "proposed",

    editedName:
      raw?.editedName ??
      raw?.editedCompetencyName ??
      null,

    editedEvidence:
      raw?.editedEvidence ??
      null,

    source:
      raw?.source ??
      raw?.sourceType ??
      null,
  };
}

function normaliseQuestion(
  raw: any
): ClarificationQuestion {
  return {
    id:
      String(
        raw?.id ??
          ""
      ),

    capability:
      String(
        raw?.capability ??
          raw?.competency ??
          ""
      ),

    question:
      String(
        raw?.question ??
          ""
      ),

    reason:
      raw?.reason ??
      null,

    answer:
      raw?.answer ??
      null,

    answeredAt:
      raw?.answeredAt ??
      null,
  };
}

function normaliseRole(
  raw: any,
  source:
    JourneySource
): RoleAssessment {
  const rawCapabilities =
    Array.isArray(
      raw?.capabilities
    )
      ? raw.capabilities
      : Array.isArray(
          raw?.stagedCapabilities
        )
        ? raw.stagedCapabilities
        : [];

  const rawQuestions =
    Array.isArray(
      raw?.questions
    )
      ? raw.questions
      : Array.isArray(
          raw?.gaps
        )
        ? raw.gaps
        : [];

  const rawToDate =
    raw?.toDate ??
    raw?.to_date ??
    "";

  const rawToDateOriginal =
    raw?.toDateOriginal ??
    raw?.to_date_original ??
    "";

  const suppliedPrecision =
    raw?.toDatePrecision ??
    raw?.to_date_precision ??
    null;

  const ongoing =
    suppliedPrecision ===
      "ongoing" ||
    /^(present|current|ongoing|now)$/i.test(
      String(
        rawToDateOriginal ||
          rawToDate ||
          ""
      ).trim()
    );

  return {
    id:
      String(
        raw?.id ??
          raw?.roleAssessmentId ??
          ""
      ),

    assessmentId:
      raw?.assessmentId
        ? String(
            raw.assessmentId
          )
        : undefined,

    roleIndex:
      Number(
        raw?.roleIndex ??
          raw?.sequenceNo ??
          0
      ),

    organisation:
      String(
        raw?.organisation ??
          raw?.organisationName ??
          ""
      ),

    roleTitle:
      String(
        raw?.roleTitle ??
          ""
      ),

    fromDate:
      raw?.fromDate ??
      raw?.from_date ??
      "",

    toDate:
      ongoing
        ? ""
        : rawToDate,

    fromDatePrecision:
      raw?.fromDatePrecision ??
      raw?.from_date_precision ??
      null,

    toDatePrecision:
      ongoing
        ? "ongoing"
        : suppliedPrecision,

    fromDateOriginal:
      raw?.fromDateOriginal ??
      raw?.from_date_original ??
      null,

    toDateOriginal:
      ongoing
        ? String(
            rawToDateOriginal ||
              "Present"
          )
        : rawToDateOriginal ||
          null,

    description:
      String(
        raw?.description ??
          raw?.roleDescription ??
          ""
      ),

    engagementType:
      raw?.engagementType ??
      raw?.engagementModel ??
      "",

    employmentType:
      raw?.employmentType ??
      raw?.employmentContext ??
      "",

    canonicalRoleId:
      raw?.canonicalRoleId ??
      null,

    lifecycleStatus:
      raw?.lifecycleStatus ??
      "in_progress",

    capabilities:
      rawCapabilities.map(
        normaliseCapability
      ),

    questions:
      rawQuestions.map(
        normaliseQuestion
      ),

    successGates:
      Array.isArray(
        raw?.successGates
      )
        ? raw.successGates
        : [],

    source,
  };
}

/* ============================================================
   EMPTY MANUAL ROLE
============================================================ */

function createEmptyRole():
  ManualRole {
  return {
    organisation:
      "",

    roleTitle:
      "",

    fromDate:
      "",

    toDate:
      "",

    fromDatePrecision:
      "unknown",

    toDatePrecision:
      "unknown",

    fromDateOriginal:
      "",

    toDateOriginal:
      "",

    currentRole:
      false,

    description:
      "",

    engagementType:
      "",

    employmentType:
      "",
  };
}

/* ============================================================
   COMPONENT
============================================================ */

export default function CVUpload() {
  const [
    viewMode,
    setViewMode,
  ] =
    useState<ViewMode>(
      "choice"
    );

  const [
    journeySource,
    setJourneySource,
  ] =
    useState<
      JourneySource | null
    >(null);

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    message,
    setMessage,
  ] =
    useState("");

  const [
    assessmentId,
    setAssessmentId,
  ] =
    useState<
      string | null
    >(null);

  const [
    roles,
    setRoles,
  ] =
    useState<
      RoleAssessment[]
    >([]);

  const [
    currentRoleIndex,
    setCurrentRoleIndex,
  ] =
    useState(0);

  const [
    successGates,
    setSuccessGates,
  ] =
    useState<
      SuccessGate[]
    >([]);

  const [
    manualRoles,
    setManualRoles,
  ] =
    useState<
      ManualRole[]
    >([
      createEmptyRole(),
    ]);

  const [
    answers,
    setAnswers,
  ] =
    useState<
      Record<
        string,
        string
      >
    >({});

  const [
    editingCapabilityId,
    setEditingCapabilityId,
  ] =
    useState<
      string | null
    >(null);

  const [
    editedCapabilityName,
    setEditedCapabilityName,
  ] =
    useState("");

  const [
    editedCapabilityEvidence,
    setEditedCapabilityEvidence,
  ] =
    useState("");

  const [
    cvFile,
    setCvFile,
  ] =
    useState<
      File | null
    >(null);

  /* ============================================================
     DERIVED STATE
  ============================================================ */

  const currentRole =
    useMemo(() => {
      if (
        !roles.length
      ) {
        return null;
      }

      return (
        roles[
          currentRoleIndex
        ] ??
        roles[0]
      );
    }, [
      roles,
      currentRoleIndex,
    ]);

  const visibleSuccessGates =
    useMemo(() => {
      if (
        currentRole
          ?.successGates
          ?.length
      ) {
        return (
          currentRole
            .successGates
        );
      }

      return successGates;
    }, [
      currentRole,
      successGates,
    ]);

  const openQuestions =
    useMemo(() => {
      if (
        !currentRole
      ) {
        return [];
      }

      return currentRole
        .questions
        .filter(
          (question) =>
            !question
              .answeredAt
        );
    }, [
      currentRole,
    ]);

  const demonstratedCapabilities =
    useMemo(() => {
      if (
        !currentRole
      ) {
        return [];
      }

      return currentRole
        .capabilities
        .filter(
          (capability) =>
            capability
              .capabilityStatus ===
            "demonstrated"
        );
    }, [
      currentRole,
    ]);

  const gaps =
    useMemo(() => {
      if (
        !currentRole
      ) {
        return [];
      }

      return currentRole
        .capabilities
        .filter(
          (capability) =>
            capability
              .capabilityStatus ===
            "gap"
        );
    }, [
      currentRole,
    ]);

  /* ============================================================
     API
  ============================================================ */

  function getActionRoute() {
    return (
      journeySource ===
      "cv"
        ? ANALYSE_CV_ROUTE
        : NO_CV_ROUTE
    );
  }

  async function postJson(
    route: string,
    payload:
      Record<
        string,
        unknown
      >
  ) {
    const response =
      await fetch(
        route,
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify(
              payload
            ),
        }
      );

    const data =
      await response.json();

    if (
      !response.ok
    ) {
      throw new Error(
        data.error ||
          "Request failed."
      );
    }

    return data;
  }

  function updateRoleInState(
    updatedRole:
      RoleAssessment
  ) {
    setRoles(
      (previous) =>
        previous.map(
          (role) =>
            role.id ===
            updatedRole.id
              ? updatedRole
              : role
        )
    );

    if (
      updatedRole
        .successGates
        ?.length
    ) {
      setSuccessGates(
        updatedRole
          .successGates
      );
    }
  }

  /* ============================================================
     ENTRY
  ============================================================ */

  function handleHasCV() {
    setJourneySource(
      "cv"
    );

    setMessage("");

    setViewMode(
      "cv"
    );
  }

  function handleNoCV() {
    setJourneySource(
      "manual"
    );

    setMessage("");

    setViewMode(
      "manual"
    );
  }

  /* ============================================================
     CV UPLOAD
  ============================================================ */

  async function uploadCV() {
    if (
      !cvFile
    ) {
      setMessage(
        "Please select a CV file."
      );

      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const formData =
        new FormData();

      formData.append(
        "cv",
        cvFile
      );

      const response =
        await fetch(
          ANALYSE_CV_ROUTE,
          {
            method:
              "POST",

            body:
              formData,
          }
        );

      const data =
        await response.json();

      if (
        !response.ok
      ) {
        throw new Error(
          data.error ||
            "Unable to analyse CV."
        );
      }

      const normalisedRoles:
        RoleAssessment[] =
        Array.isArray(
          data.roles
        )
          ? data.roles.map(
              (
                role:
                  any
              ) =>
                normaliseRole(
                  role,
                  "cv"
                )
            )
          : [];

      if (
        !normalisedRoles
          .length
      ) {
        throw new Error(
          "No roles were returned from the CV analysis."
        );
      }

      setJourneySource(
        "cv"
      );

      setAssessmentId(
        data.assessmentId ??
          null
      );

      setRoles(
        normalisedRoles
      );

      setCurrentRoleIndex(
        0
      );

      setSuccessGates(
        extractSuccessGates(
          data
        )
      );

      setAnswers({});

      setMessage(
        data.message ||
          "CV analysed successfully."
      );

      setViewMode(
        "assessment"
      );
    } catch (error) {
      setMessage(
        error instanceof
          Error
          ? error.message
          : "Unable to analyse CV."
      );
    } finally {
      setLoading(false);
    }
  }

  /* ============================================================
     MANUAL ROLES
  ============================================================ */

  function updateManualRole(
    index: number,
    field:
      keyof ManualRole,
    value:
      string | boolean
  ) {
    setManualRoles(
      (previous) =>
        previous.map(
          (
            role,
            roleIndex
          ) =>
            roleIndex ===
            index
              ? {
                  ...role,
                  [field]:
                    value,
                }
              : role
        )
    );
  }

  function addManualRole() {
    setManualRoles(
      (previous) => [
        ...previous,
        createEmptyRole(),
      ]
    );
  }

  function removeManualRole(
    index: number
  ) {
    setManualRoles(
      (previous) =>
        previous.length ===
        1
          ? previous
          : previous.filter(
              (
                _,
                roleIndex
              ) =>
                roleIndex !==
                index
            )
    );
  }

  async function startManualAssessment() {
    setLoading(true);
    setMessage("");

    try {
      const invalidRole =
        manualRoles.find(
          (role) =>
            !role
              .organisation
              .trim() ||
            !role
              .roleTitle
              .trim() ||
            !role
              .description
              .trim()
        );

      if (
        invalidRole
      ) {
        throw new Error(
          "Please provide organisation, role title and role description for every role."
        );
      }

      const data =
        await postJson(
          NO_CV_ROUTE,
          {
            action:
              "start_manual",

            roles:
              manualRoles.map(
                (role) => ({
                  organisation:
                    role.organisation.trim(),

                  roleTitle:
                    role.roleTitle.trim(),

                  fromDate:
                    role.fromDate ||
                    null,

                  toDate:
                    role.currentRole
                      ? null
                      : role.toDate ||
                        null,

                  fromDatePrecision:
                    role.fromDate
                      ? "day"
                      : "unknown",

                  toDatePrecision:
                    role.currentRole
                      ? "ongoing"
                      : role.toDate
                        ? "day"
                        : "unknown",

                  fromDateOriginal:
                    role.fromDate ||
                    null,

                  toDateOriginal:
                    role.currentRole
                      ? "Present"
                      : role.toDate ||
                        null,

                  description:
                    role.description.trim(),

                  engagementType:
                    role.engagementType ||
                    null,

                  employmentType:
                    role.employmentType ||
                    null,
                })
              ),
          }
        );

      const normalisedRoles =
        Array.isArray(
          data.roles
        )
          ? data.roles.map(
              (
                role:
                  any
              ) =>
                normaliseRole(
                  role,
                  "manual"
                )
            )
          : [];

      setJourneySource(
        "manual"
      );

      setAssessmentId(
        data.assessmentId ??
          null
      );

      setRoles(
        normalisedRoles
      );

      setCurrentRoleIndex(
        0
      );

      setSuccessGates(
        extractSuccessGates(
          data
        )
      );

      setAnswers({});

      setViewMode(
        "assessment"
      );
    } catch (error) {
      setMessage(
        error instanceof
          Error
          ? error.message
          : "Unable to start the assessment."
      );
    } finally {
      setLoading(false);
    }
  }

  /* ============================================================
     ANSWERS
  ============================================================ */

  function updateAnswer(
    questionId:
      string,
    value:
      string
  ) {
    setAnswers(
      (previous) => ({
        ...previous,

        [questionId]:
          value,
      })
    );
  }

  async function assessClarificationAnswers() {
    if (
      !currentRole ||
      !journeySource
    ) {
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      let data:
        any;

      if (
        journeySource ===
        "cv"
      ) {
        const questions =
          openQuestions
            .map(
              (question) => ({
                gapId:
                  question.id,

                competency:
                  question.capability,

                question:
                  question.question,

                answer:
                  answers[
                    question.id
                  ]?.trim() ||
                  "",
              })
            )
            .filter(
              (item) =>
                item.answer
            );

        if (
          !questions.length
        ) {
          throw new Error(
            "Please provide at least one clarification response."
          );
        }

        data =
          await postJson(
            ANALYSE_CV_ROUTE,
            {
              action:
                "assess_role",

              roleAssessmentId:
                currentRole.id,

              questions,
            }
          );
      } else {
        const answersPayload =
          openQuestions
            .map(
              (question) => ({
                questionId:
                  question.id,

                answer:
                  answers[
                    question.id
                  ]?.trim() ||
                  "",
              })
            )
            .filter(
              (item) =>
                item.answer
            );

        if (
          !answersPayload
            .length
        ) {
          throw new Error(
            "Please provide at least one clarification response."
          );
        }

        data =
          await postJson(
            NO_CV_ROUTE,
            {
              action:
                "assess_role",

              roleAssessmentId:
                currentRole.id,

              answers:
                answersPayload,
            }
          );
      }

      if (
        data.role
      ) {
        updateRoleInState(
          normaliseRole(
            data.role,
            journeySource
          )
        );
      } else if (
        journeySource ===
        "cv"
      ) {
        updateRoleInState(
          normaliseRole(
            {
              ...currentRole,

              roleAssessmentId:
                currentRole.id,

              stagedCapabilities:
                data.stagedCapabilities,

              gaps:
                data.gaps,

              lifecycleStatus:
                data.lifecycleStatus,

              successGates:
                data.successGates,
            },
            "cv"
          )
        );
      }

      const gates =
        extractSuccessGates(
          data
        );

      if (
        gates.length
      ) {
        setSuccessGates(
          gates
        );
      }

      setAnswers({});

      setMessage(
        data.message ||
          "Your clarification responses have been assessed."
      );
    } catch (error) {
      setMessage(
        error instanceof
          Error
          ? error.message
          : "Unable to assess clarification responses."
      );
    } finally {
      setLoading(false);
    }
  }

  /* ============================================================
     CAPABILITY REVIEW
  ============================================================ */

  async function reviewCapability(
    capability:
      Capability,
    action:
      | "accept"
      | "reject"
  ) {
    if (
      !currentRole ||
      !journeySource
    ) {
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const data =
        journeySource ===
        "cv"
          ? await postJson(
              ANALYSE_CV_ROUTE,
              {
                action:
                  "review_capability",

                roleAssessmentId:
                  currentRole.id,

                capabilityId:
                  capability.id,

                reviewStatus:
                  action ===
                  "accept"
                    ? "accepted"
                    : "rejected",
              }
            )
          : await postJson(
              NO_CV_ROUTE,
              {
                action:
                  "review_capability",

                roleAssessmentId:
                  currentRole.id,

                capabilityId:
                  capability.id,

                action,
              }
            );

      if (
        data.role
      ) {
        updateRoleInState(
          normaliseRole(
            data.role,
            journeySource
          )
        );
      } else if (
        data.capability
      ) {
        const updated =
          normaliseCapability(
            data.capability
          );

        setRoles(
          (previous) =>
            previous.map(
              (role) =>
                role.id ===
                currentRole.id
                  ? {
                      ...role,

                      capabilities:
                        role.capabilities.map(
                          (
                            item
                          ) =>
                            item.id ===
                            updated.id
                              ? updated
                              : item
                        ),

                      successGates:
                        extractSuccessGates(
                          data
                        ).length
                          ? extractSuccessGates(
                              data
                            )
                          : role.successGates,
                    }
                  : role
            )
        );
      }

      const gates =
        extractSuccessGates(
          data
        );

      if (
        gates.length
      ) {
        setSuccessGates(
          gates
        );
      }
    } catch (error) {
      setMessage(
        error instanceof
          Error
          ? error.message
          : "Unable to review capability."
      );
    } finally {
      setLoading(false);
    }
  }

  function startCapabilityEdit(
    capability:
      Capability
  ) {
    setEditingCapabilityId(
      capability.id
    );

    setEditedCapabilityName(
      capability.editedName ||
        capability.name
    );

    setEditedCapabilityEvidence(
      capability.editedEvidence ||
        capability.evidence ||
        ""
    );
  }

  function cancelCapabilityEdit() {
    setEditingCapabilityId(
      null
    );

    setEditedCapabilityName(
      ""
    );

    setEditedCapabilityEvidence(
      ""
    );
  }

  async function saveCapabilityEdit(
    capability:
      Capability
  ) {
    if (
      !currentRole ||
      !journeySource
    ) {
      return;
    }

    if (
      !editedCapabilityName
        .trim()
    ) {
      setMessage(
        "Capability name is required."
      );

      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const data =
        journeySource ===
        "cv"
          ? await postJson(
              ANALYSE_CV_ROUTE,
              {
                action:
                  "review_capability",

                roleAssessmentId:
                  currentRole.id,

                capabilityId:
                  capability.id,

                reviewStatus:
                  "edited",

                competencyName:
                  editedCapabilityName.trim(),

                evidence:
                  editedCapabilityEvidence.trim(),
              }
            )
          : await postJson(
              NO_CV_ROUTE,
              {
                action:
                  "review_capability",

                roleAssessmentId:
                  currentRole.id,

                capabilityId:
                  capability.id,

                action:
                  "edit",

                name:
                  editedCapabilityName.trim(),

                evidence:
                  editedCapabilityEvidence.trim(),
              }
            );

      if (
        data.role
      ) {
        updateRoleInState(
          normaliseRole(
            data.role,
            journeySource
          )
        );
      } else if (
        data.capability
      ) {
        const updated =
          normaliseCapability(
            data.capability
          );

        setRoles(
          (previous) =>
            previous.map(
              (role) =>
                role.id ===
                currentRole.id
                  ? {
                      ...role,

                      capabilities:
                        role.capabilities.map(
                          (
                            item
                          ) =>
                            item.id ===
                            updated.id
                              ? updated
                              : item
                        ),
                    }
                  : role
            )
        );
      }

      const gates =
        extractSuccessGates(
          data
        );

      if (
        gates.length
      ) {
        setSuccessGates(
          gates
        );
      }

      cancelCapabilityEdit();
    } catch (error) {
      setMessage(
        error instanceof
          Error
          ? error.message
          : "Unable to update capability."
      );
    } finally {
      setLoading(false);
    }
  }

  /* ============================================================
     ROLE CONTEXT
  ============================================================ */

  function updateCurrentRole(
    field:
      keyof RoleAssessment,
    value:
      any
  ) {
    if (
      !currentRole
    ) {
      return;
    }

    setRoles(
      (previous) =>
        previous.map(
          (
            role,
            index
          ) =>
            index ===
            currentRoleIndex
              ? {
                  ...role,

                  [field]:
                    value,
                }
              : role
        )
    );
  }

  function setCurrentRoleOngoing(
    checked:
      boolean
  ) {
    if (
      !currentRole
    ) {
      return;
    }

    setRoles(
      (previous) =>
        previous.map(
          (
            role,
            index
          ) =>
            index ===
            currentRoleIndex
              ? {
                  ...role,

                  toDate:
                    checked
                      ? ""
                      : "",

                  toDatePrecision:
                    checked
                      ? "ongoing"
                      : "unknown",

                  toDateOriginal:
                    checked
                      ? "Present"
                      : null,
                }
              : role
        )
    );
  }

  async function saveRoleContext() {
    if (
      !currentRole ||
      !journeySource
    ) {
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      let data:
        any;

      const toDate =
        currentRole
          .toDatePrecision ===
        "ongoing"
          ? null
          : currentRole
              .toDate ||
            null;

      const toDateOriginal =
        currentRole
          .toDatePrecision ===
        "ongoing"
          ? "Present"
          : currentRole
              .toDateOriginal ||
            currentRole
              .toDate ||
            null;

      if (
        journeySource ===
        "cv"
      ) {
        data =
          await postJson(
            ANALYSE_CV_ROUTE,
            {
              action:
                "update_role_context",

              roleAssessmentId:
                currentRole.id,

              organisationName:
                currentRole.organisation,

              roleTitle:
                currentRole.roleTitle,

              fromDate:
                currentRole.fromDate ||
                null,

              toDate,

              fromDatePrecision:
                currentRole.fromDatePrecision ??
                (
                  currentRole.fromDate
                    ? "day"
                    : "unknown"
                ),

              toDatePrecision:
                currentRole.toDatePrecision ??
                (
                  currentRole.toDate
                    ? "day"
                    : "unknown"
                ),

              fromDateOriginal:
                currentRole.fromDateOriginal ||
                currentRole.fromDate ||
                null,

              toDateOriginal,

              roleDescription:
                currentRole.description,

              engagementModel:
                currentRole.engagementType ??
                null,

              employmentContext:
                currentRole.employmentType ??
                null,
            }
          );
      } else {
        data =
          await postJson(
            NO_CV_ROUTE,
            {
              action:
                "update_role_context",

              roleAssessmentId:
                currentRole.id,

              organisation:
                currentRole.organisation,

              roleTitle:
                currentRole.roleTitle,

              fromDate:
                currentRole.fromDate ||
                null,

              toDate,

              fromDatePrecision:
                currentRole.fromDatePrecision ??
                (
                  currentRole.fromDate
                    ? "day"
                    : "unknown"
                ),

              toDatePrecision:
                currentRole.toDatePrecision ??
                (
                  currentRole.toDate
                    ? "day"
                    : "unknown"
                ),

              fromDateOriginal:
                currentRole.fromDateOriginal ||
                currentRole.fromDate ||
                null,

              toDateOriginal,

              description:
                currentRole.description,

              engagementType:
                currentRole.engagementType ??
                null,

              employmentType:
                currentRole.employmentType ??
                null,
            }
          );
      }

      if (
        data.role
      ) {
        updateRoleInState(
          normaliseRole(
            data.role,
            journeySource
          )
        );
      }

      const gates =
        extractSuccessGates(
          data
        );

      if (
        gates.length
      ) {
        setSuccessGates(
          gates
        );
      }

      setMessage(
        "Role context updated."
      );
    } catch (error) {
      setMessage(
        error instanceof
          Error
          ? error.message
          : "Unable to update role."
      );
    } finally {
      setLoading(false);
    }
  }

  /* ============================================================
     SUBMIT ROLE
  ============================================================ */

  async function submitRole() {
    if (
      !currentRole ||
      !journeySource
    ) {
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const data =
        await postJson(
          getActionRoute(),
          {
            action:
              "submit_role",

            roleAssessmentId:
              currentRole.id,
          }
        );

      if (
        data.role
      ) {
        updateRoleInState(
          normaliseRole(
            data.role,
            journeySource
          )
        );
      }

      const gates =
        extractSuccessGates(
          data
        );

      if (
        gates.length
      ) {
        setSuccessGates(
          gates
        );
      }

      if (
        data.requiresFurtherReview ||
        data.requiresFurtherClarification
      ) {
        setMessage(
          data.message ||
            "Additional assessment work has been identified."
        );

        return;
      }

      if (
        data.assessmentCompleted
      ) {
        setViewMode(
          "complete"
        );

        setMessage(
          "Career assessment completed."
        );

        return;
      }

      if (
        data.nextRole
      ) {
        const nextRole =
          normaliseRole(
            data.nextRole,
            journeySource
          );

        const nextIndex =
          roles.findIndex(
            (role) =>
              role.id ===
              nextRole.id
          );

        setRoles(
          (previous) =>
            previous.map(
              (role) =>
                role.id ===
                nextRole.id
                  ? nextRole
                  : role
            )
        );

        setCurrentRoleIndex(
          nextIndex >= 0
            ? nextIndex
            : Math.min(
                currentRoleIndex +
                  1,
                roles.length -
                  1
              )
        );

        if (
          nextRole
            .successGates
            ?.length
        ) {
          setSuccessGates(
            nextRole
              .successGates
          );
        }

        setAnswers({});

        setMessage(
          "Role completed. Moving to the next role."
        );

        return;
      }

      if (
        currentRoleIndex +
          1 <
        roles.length
      ) {
        setCurrentRoleIndex(
          currentRoleIndex +
            1
        );

        setAnswers({});

        setMessage(
          "Role completed. Moving to the next role."
        );
      } else if (
        data.lifecycleStatus ===
        "completed"
      ) {
        setViewMode(
          "complete"
        );
      }
    } catch (error) {
      setMessage(
        error instanceof
          Error
          ? error.message
          : "Unable to submit role."
      );
    } finally {
      setLoading(false);
    }
  }

  /* ============================================================
     SUCCESS GATES VIEW
  ============================================================ */

  function renderSuccessGates() {
    if (
      !visibleSuccessGates
        .length
    ) {
      return null;
    }

    const passedCount =
      visibleSuccessGates
        .filter(
          (gate) =>
            isGatePassed(
              gate.status
            )
        ).length;

    return (
      <div className="mt-5 rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Process traceability
            </p>

            <h3 className="mt-1 text-lg font-semibold text-slate-900">
              Success gates
            </h3>
          </div>

          <p className="text-sm text-slate-500">
            {passedCount}{" "}
            passed
          </p>
        </div>

        <div className="mt-4 space-y-2">
          {visibleSuccessGates.map(
            (gate) => {
              const status =
                gateDisplayStatus(
                  gate.status
                );

              return (
                <div
                  key={`${gate.scopeKey ?? ""}-${gate.gateKey}-${gate.id}`}
                  className="flex items-center gap-3 rounded-lg border border-slate-200 p-3"
                >
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                      status ===
                      "passed"
                        ? "bg-green-600 text-white"
                        : status ===
                            "failed"
                          ? "bg-red-600 text-white"
                          : "border border-amber-400 bg-amber-50 text-amber-700"
                    }`}
                  >
                    {status ===
                    "passed"
                      ? "✓"
                      : status ===
                          "failed"
                        ? "!"
                        : "–"}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800">
                      {formatGateName(
                        gate.gateKey
                      )}
                    </p>

                    <p className="break-all text-xs uppercase tracking-wide text-slate-400">
                      {
                        gate.gateKey
                      }
                    </p>
                  </div>

                  <span
                    className={`text-xs font-semibold uppercase ${
                      status ===
                      "passed"
                        ? "text-green-700"
                        : status ===
                            "failed"
                          ? "text-red-700"
                          : "text-amber-700"
                    }`}
                  >
                    {status}
                  </span>
                </div>
              );
            }
          )}
        </div>
      </div>
    );
  }

  /* ============================================================
     CHOICE
  ============================================================ */

  if (
    viewMode ===
    "choice"
  ) {
    return (
      <div className="mx-auto w-full max-w-5xl p-6">
        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Career Intelligence
          </p>

          <h1 className="mt-2 text-3xl font-bold text-slate-900">
            Build your career profile
          </h1>

          <p className="mt-3 max-w-3xl text-slate-600">
            We will use your career history to identify your
            capabilities, establish supporting evidence and identify
            areas that need further clarification.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <button
              type="button"
              onClick={
                handleHasCV
              }
              className="rounded-xl border border-slate-300 p-6 text-left transition hover:border-slate-500 hover:bg-slate-50"
            >
              <p className="text-lg font-semibold text-slate-900">
                I have a CV
              </p>

              <p className="mt-2 text-sm text-slate-600">
                Upload your CV and we will identify the roles and
                career evidence contained within it.
              </p>
            </button>

            <button
              type="button"
              onClick={
                handleNoCV
              }
              className="rounded-xl border border-slate-300 p-6 text-left transition hover:border-slate-500 hover:bg-slate-50"
            >
              <p className="text-lg font-semibold text-slate-900">
                I don't have a CV
              </p>

              <p className="mt-2 text-sm text-slate-600">
                Enter your employment and career experience manually.
              </p>
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ============================================================
     CV UPLOAD
  ============================================================ */

  if (
    viewMode ===
    "cv"
  ) {
    return (
      <div className="mx-auto w-full max-w-5xl p-6">
        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <button
            type="button"
            onClick={() => {
              setViewMode(
                "choice"
              );

              setJourneySource(
                null
              );
            }}
            className="text-sm font-medium text-slate-500 hover:text-slate-900"
          >
            ← Back
          </button>

          <h1 className="mt-5 text-2xl font-bold text-slate-900">
            Upload your CV
          </h1>

          <p className="mt-2 text-slate-600">
            Select your CV to begin the Career Intelligence review.
          </p>

          <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8">
            <input
              type="file"
              accept=".pdf,.docx"
              disabled={
                loading
              }
              onChange={(
                event
              ) =>
                setCvFile(
                  event
                    .target
                    .files?.[0] ??
                    null
                )
              }
              className="block w-full text-sm text-slate-600"
            />

            <p className="mt-3 text-xs text-slate-500">
              PDF or DOCX.
            </p>

            {cvFile && (
              <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-sm font-medium text-slate-800">
                  {
                    cvFile.name
                  }
                </p>
              </div>
            )}
          </div>

          {message && (
            <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              {message}
            </div>
          )}

          <button
            type="button"
            onClick={
              uploadCV
            }
            disabled={
              loading ||
              !cvFile
            }
            className="mt-6 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {loading
              ? "Analysing CV..."
              : "Upload and analyse CV"}
          </button>
        </div>
      </div>
    );
  }

  /* ============================================================
     MANUAL
  ============================================================ */

  if (
    viewMode ===
    "manual"
  ) {
    return (
      <div className="mx-auto w-full max-w-5xl p-6">
        <button
          type="button"
          onClick={() =>
            setViewMode(
              "choice"
            )
          }
          className="text-sm font-medium text-slate-500"
        >
          ← Back
        </button>

        <h1 className="mt-5 text-2xl font-bold text-slate-900">
          Enter your career experience
        </h1>

        <div className="mt-6 space-y-6">
          {manualRoles.map(
            (
              role,
              index
            ) => (
              <div
                key={
                  index
                }
                className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">
                    Role{" "}
                    {index +
                      1}
                  </h2>

                  {manualRoles.length >
                    1 && (
                    <button
                      type="button"
                      onClick={() =>
                        removeManualRole(
                          index
                        )
                      }
                      className="text-sm text-red-600"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <input
                    placeholder="Organisation"
                    value={
                      role.organisation
                    }
                    onChange={(
                      e
                    ) =>
                      updateManualRole(
                        index,
                        "organisation",
                        e.target
                          .value
                      )
                    }
                    className="rounded-lg border px-3 py-2"
                  />

                  <input
                    placeholder="Role title"
                    value={
                      role.roleTitle
                    }
                    onChange={(
                      e
                    ) =>
                      updateManualRole(
                        index,
                        "roleTitle",
                        e.target
                          .value
                      )
                    }
                    className="rounded-lg border px-3 py-2"
                  />

                  <label>
                    <span className="text-sm">
                      From
                    </span>

                    <input
                      type="date"
                      value={
                        role.fromDate
                      }
                      onChange={(
                        e
                      ) =>
                        updateManualRole(
                          index,
                          "fromDate",
                          e.target
                            .value
                        )
                      }
                      className="mt-1 w-full rounded-lg border px-3 py-2"
                    />
                  </label>

                  <div>
                    <span className="text-sm">
                      To
                    </span>

                    <input
                      type="date"
                      value={
                        role.currentRole
                          ? ""
                          : role.toDate
                      }
                      disabled={
                        role.currentRole
                      }
                      onChange={(
                        e
                      ) =>
                        updateManualRole(
                          index,
                          "toDate",
                          e.target
                            .value
                        )
                      }
                      className="mt-1 w-full rounded-lg border px-3 py-2 disabled:bg-slate-100"
                    />

                    <label className="mt-2 flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={
                          role.currentRole
                        }
                        onChange={(
                          e
                        ) =>
                          updateManualRole(
                            index,
                            "currentRole",
                            e.target
                              .checked
                          )
                        }
                      />

                      <span className="text-sm">
                        Current
                        role
                      </span>
                    </label>

                    {role.currentRole && (
                      <p className="mt-1 text-sm font-medium text-slate-600">
                        Present
                      </p>
                    )}
                  </div>
                </div>

                <textarea
                  rows={7}
                  placeholder="Role description and achievements"
                  value={
                    role.description
                  }
                  onChange={(
                    e
                  ) =>
                    updateManualRole(
                      index,
                      "description",
                      e.target
                        .value
                    )
                  }
                  className="mt-4 w-full rounded-lg border px-3 py-2"
                />
              </div>
            )
          )}
        </div>

        {message && (
          <div className="mt-5 rounded-lg border bg-slate-50 p-4 text-sm">
            {message}
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={
              addManualRole
            }
            className="rounded-lg border px-4 py-2"
          >
            Add another role
          </button>

          <button
            type="button"
            onClick={
              startManualAssessment
            }
            disabled={
              loading
            }
            className="rounded-lg bg-slate-900 px-5 py-2 text-white"
          >
            Start career
            review
          </button>
        </div>
      </div>
    );
  }

  /* ============================================================
     COMPLETE
  ============================================================ */

  if (
    viewMode ===
    "complete"
  ) {
    return (
      <div className="mx-auto w-full max-w-5xl p-6">
        <div className="rounded-xl border bg-white p-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-600 text-white">
            ✓
          </div>

          <h1 className="mt-5 text-2xl font-bold">
            Career review
            complete
          </h1>

          {renderSuccessGates()}
        </div>
      </div>
    );
  }

  if (
    !currentRole
  ) {
    return (
      <div className="p-6">
        No role
        assessment is
        currently
        available.
      </div>
    );
  }

  /* ============================================================
     ASSESSMENT
  ============================================================ */

  return (
    <div className="mx-auto w-full max-w-6xl p-6">
      <div className="flex justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase text-slate-500">
            Career
            Intelligence
            review
          </p>

          <h1 className="mt-1 text-2xl font-bold">
            {
              currentRole.roleTitle
            }
          </h1>

          <p className="text-slate-600">
            {
              currentRole.organisation
            }
          </p>
        </div>

        <div className="rounded-lg border px-4 py-3">
          Role{" "}
          {currentRoleIndex +
            1}{" "}
          of{" "}
          {roles.length}
        </div>
      </div>

      {message && (
        <div className="mt-5 rounded-lg border bg-slate-50 p-4 text-sm">
          {message}
        </div>
      )}

      {/* ROLE CONTEXT */}

      <section className="mt-6 rounded-xl border bg-white p-6">
        <h2 className="text-lg font-semibold">
          Review your role
          information
        </h2>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label>
            <span className="text-sm">
              Organisation
            </span>

            <input
              value={
                currentRole.organisation
              }
              onChange={(
                e
              ) =>
                updateCurrentRole(
                  "organisation",
                  e.target
                    .value
                )
              }
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
          </label>

          <label>
            <span className="text-sm">
              Role title
            </span>

            <input
              value={
                currentRole.roleTitle
              }
              onChange={(
                e
              ) =>
                updateCurrentRole(
                  "roleTitle",
                  e.target
                    .value
                )
              }
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
          </label>

          <label>
            <span className="text-sm">
              From
            </span>

            <input
              type="date"
              value={
                currentRole.fromDate ??
                ""
              }
              onChange={(
                e
              ) => {
                updateCurrentRole(
                  "fromDate",
                  e.target
                    .value
                );

                updateCurrentRole(
                  "fromDatePrecision",
                  e.target.value
                    ? "day"
                    : "unknown"
                );

                updateCurrentRole(
                  "fromDateOriginal",
                  e.target
                    .value
                );
              }}
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
          </label>

          <div>
            <span className="text-sm">
              To
            </span>

            <input
              type="date"
              value={
                currentRole
                  .toDatePrecision ===
                "ongoing"
                  ? ""
                  : currentRole.toDate ??
                    ""
              }
              disabled={
                currentRole
                  .toDatePrecision ===
                "ongoing"
              }
              onChange={(
                e
              ) => {
                updateCurrentRole(
                  "toDate",
                  e.target
                    .value
                );

                updateCurrentRole(
                  "toDatePrecision",
                  e.target.value
                    ? "day"
                    : "unknown"
                );

                updateCurrentRole(
                  "toDateOriginal",
                  e.target
                    .value
                );
              }}
              className="mt-1 w-full rounded-lg border px-3 py-2 disabled:bg-slate-100"
            />

            <label className="mt-2 flex items-center gap-2">
              <input
                type="checkbox"
                checked={
                  currentRole
                    .toDatePrecision ===
                  "ongoing"
                }
                onChange={(
                  e
                ) =>
                  setCurrentRoleOngoing(
                    e.target
                      .checked
                  )
                }
              />

              <span className="text-sm">
                Current role
              </span>
            </label>

            {currentRole
              .toDatePrecision ===
              "ongoing" && (
              <p className="mt-1 text-sm font-semibold text-slate-600">
                Present
              </p>
            )}
          </div>
        </div>

        <textarea
          rows={7}
          value={
            currentRole.description
          }
          onChange={(
            e
          ) =>
            updateCurrentRole(
              "description",
              e.target
                .value
            )
          }
          className="mt-4 w-full rounded-lg border px-3 py-2"
        />

        <button
          type="button"
          onClick={
            saveRoleContext
          }
          disabled={
            loading
          }
          className="mt-4 rounded-lg border px-4 py-2"
        >
          Save role
          context
        </button>
      </section>

      {/* QUESTIONS */}

      {openQuestions.length >
        0 && (
        <section className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="text-lg font-semibold">
            Additional
            evidence
            required
          </h2>

          <div className="mt-5 space-y-5">
            {openQuestions.map(
              (
                question
              ) => (
                <div
                  key={
                    question.id
                  }
                  className="rounded-lg border bg-white p-4"
                >
                  <p className="font-semibold">
                    {
                      question.capability
                    }
                  </p>

                  <p className="mt-2 text-sm">
                    {
                      question.question
                    }
                  </p>

                  <textarea
                    rows={4}
                    value={
                      answers[
                        question
                          .id
                      ] ?? ""
                    }
                    onChange={(
                      e
                    ) =>
                      updateAnswer(
                        question.id,
                        e.target
                          .value
                      )
                    }
                    className="mt-3 w-full rounded-lg border px-3 py-2"
                  />
                </div>
              )
            )}
          </div>

          <button
            type="button"
            onClick={
              assessClarificationAnswers
            }
            disabled={
              loading
            }
            className="mt-5 rounded-lg bg-slate-900 px-5 py-2 text-white"
          >
            Submit
            clarification
            responses
          </button>
        </section>
      )}

      {/* CAPABILITIES */}

      <section className="mt-6 rounded-xl border bg-white p-6">
        <h2 className="text-lg font-semibold">
          Demonstrated
          capabilities
        </h2>

        <div className="mt-5 space-y-4">
          {demonstratedCapabilities.map(
            (
              capability
            ) => (
              <div
                key={
                  capability.id
                }
                className="rounded-lg border p-4"
              >
                {editingCapabilityId ===
                capability.id ? (
                  <>
                    <input
                      value={
                        editedCapabilityName
                      }
                      onChange={(
                        e
                      ) =>
                        setEditedCapabilityName(
                          e.target
                            .value
                        )
                      }
                      className="w-full rounded-lg border px-3 py-2"
                    />

                    <textarea
                      rows={4}
                      value={
                        editedCapabilityEvidence
                      }
                      onChange={(
                        e
                      ) =>
                        setEditedCapabilityEvidence(
                          e.target
                            .value
                        )
                      }
                      className="mt-3 w-full rounded-lg border px-3 py-2"
                    />

                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() =>
                          saveCapabilityEdit(
                            capability
                          )
                        }
                        className="rounded-lg bg-slate-900 px-4 py-2 text-white"
                      >
                        Save edit
                      </button>

                      <button
                        onClick={
                          cancelCapabilityEdit
                        }
                        className="rounded-lg border px-4 py-2"
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="font-semibold">
                      {capability.reviewStatus ===
                        "edited" &&
                      capability.editedName
                        ? capability.editedName
                        : capability.name}
                    </p>

                    <p className="mt-2 text-sm text-slate-600">
                      {capability.reviewStatus ===
                        "edited" &&
                      capability.editedEvidence
                        ? capability.editedEvidence
                        : capability.evidence ||
                          "No supporting evidence recorded."}
                    </p>

                    {capability.reviewStatus ===
                      "proposed" && (
                      <div className="mt-4 flex gap-2">
                        <button
                          onClick={() =>
                            reviewCapability(
                              capability,
                              "accept"
                            )
                          }
                          className="rounded-lg bg-green-700 px-4 py-2 text-white"
                        >
                          Accept
                        </button>

                        <button
                          onClick={() =>
                            startCapabilityEdit(
                              capability
                            )
                          }
                          className="rounded-lg border px-4 py-2"
                        >
                          Edit
                        </button>

                        <button
                          onClick={() =>
                            reviewCapability(
                              capability,
                              "reject"
                            )
                          }
                          className="rounded-lg border border-red-300 px-4 py-2 text-red-700"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          )}
        </div>
      </section>

      {/* GAPS */}

      {gaps.length >
        0 && (
        <section className="mt-6 rounded-xl border bg-white p-6">
          <h2 className="text-lg font-semibold">
            Evidence gaps
          </h2>

          <div className="mt-4 space-y-3">
            {gaps.map(
              (gap) => (
                <div
                  key={
                    gap.id
                  }
                  className="rounded-lg border p-4"
                >
                  <p className="font-semibold">
                    {
                      gap.name
                    }
                  </p>

                  <p className="mt-1 text-sm text-slate-500">
                    {gap.evidence ||
                      "Further evidence has not yet been established."}
                  </p>
                </div>
              )
            )}
          </div>
        </section>
      )}

      {renderSuccessGates()}

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={
            submitRole
          }
          disabled={
            loading
          }
          className="rounded-lg bg-slate-900 px-6 py-3 text-white disabled:opacity-50"
        >
          {loading
            ? "Processing..."
            : "Complete this role"}
        </button>
      </div>
    </div>
  );
}