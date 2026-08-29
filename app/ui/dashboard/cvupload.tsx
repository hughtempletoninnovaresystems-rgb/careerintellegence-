"use client";

import { useMemo, useState } from "react";

/*
 * ============================================================
 * GIAS / CAREER INTELLIGENCE — MULTI-ROLE CV JOURNEY
 * ============================================================
 *
 * BUSINESS FLOW IMPLEMENTED BY THIS COMPONENT
 *
 * 1. Upload CV.
 * 2. Backend identifies ALL roles found in the CV.
 * 3. Each role is associated with:
 *      - organisation
 *      - from date
 *      - to date
 *      - role title
 *      - description/context where available
 * 4. Roles are processed one at a time.
 * 5. Within each role:
 *      - candidate can edit role context before final submission
 *      - GIAS presents identified capabilities
 *      - gaps / clarification questions are answered
 *      - submitted answers are evaluated
 *      - newly emerging capabilities/evidence are added to the
 *        same role review workspace
 *      - if further clarification is required, the role loops
 *        around again
 *      - candidate reviews capabilities: Accept / Edit / Reject
 * 6. Role cannot complete until:
 *      - no unresolved clarification questions remain
 *      - no capability items remain in PROPOSED state
 *      - role context is valid
 * 7. Candidate explicitly submits the role.
 * 8. Backend promotes approved role knowledge.
 * 9. UI advances to next role.
 * 10. Repeat until all roles are complete.
 *
 * CV PROCESSING JOURNEY
 * ---------------------
 * The upload screen now displays:
 *
 *   - 0–100% progress bar
 *   - current processing activity
 *   - completed processing steps with ticks
 *   - Knowledge Base matching as a distinct step
 *   - AI interpretation/enrichment as a distinct step
 *
 * IMPORTANT
 * ---------
 * The current API returns one response when CV processing completes.
 * Therefore the progress indicator represents the client-side
 * processing journey rather than genuine server-side percentage
 * progress.
 *
 * The UI is deliberately structured so that these stages can later
 * be driven by real backend progress events without redesigning
 * the component.
 *
 * API CONTRACT
 * ------------
 * The existing backend supports:
 *
 *   analyse_cv_roles
 *   start_manual
 *   assess_role
 *   review_capability
 *   update_role_context
 *   submit_role
 *
 * CV route:
 *   /api/analyse-cv
 *
 * Manual / no-CV route:
 *   /api/no-cv
 */

const CV_ROUTE_ENDPOINT = "/api/analyse-cv";
const NO_CV_ROUTE_ENDPOINT = "/api/no-cv";

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

type RoleLifecycleStatus =
  | "not_started"
  | "in_progress"
  | "review_ready"
  | "submitted"
  | "completed";

type GapQuestion = {
  id?: string;
  competency: string;
  reason: string;
  question: string;
};

type StagedCapability = {
  id: string;

  assessmentId: string;
  roleAssessmentId: string;

  competencyId?: string | null;

  proposedCompetencyName: string;

  sourceType:
    | "cv"
    | "assessment"
    | "repository"
    | "manual";

  sourceSection?: string | null;

  evidence?: string | null;

  confidence?: number | null;

  demonstrated?: boolean | null;

  capabilityStatus:
    CapabilityStatus;

  assessmentStatus:
    AssessmentStatus;

  reviewStatus:
    ReviewStatus;

  editedCompetencyName?: string | null;
  editedEvidence?: string | null;
};

type RoleContext = {
  roleAssessmentId: string;

  canonicalRoleId?: string | null;

  organisationName: string;

  roleTitle: string;

  fromDate?: string | null;

  toDate?: string | null;

  roleDescription?: string | null;

  engagementModel?: string | null;

  employmentContext?: string | null;

  lifecycleStatus:
    RoleLifecycleStatus;

  gaps: GapQuestion[];

  stagedCapabilities:
    StagedCapability[];
};

type CVAnalysisResponse = {
  assessmentId?: string;

  candidateName?: string;

  roles?: RoleContext[];

  message?: string;
  error?: string;
};

type RoleAssessmentResponse = {
  success?: boolean;

  roleAssessmentId?: string;

  stagedCapabilities?:
    StagedCapability[];

  gaps?: GapQuestion[];

  lifecycleStatus?:
    RoleLifecycleStatus;

  requiresFurtherClarification?:
    boolean;

  message?: string;
  error?: string;
};

type CapabilityReviewResponse = {
  success?: boolean;

  capability?: StagedCapability;

  error?: string;
};

type RoleContextResponse = {
  success?: boolean;

  role?: RoleContext;

  error?: string;
};

type RoleSubmissionResponse = {
  success?: boolean;

  roleAssessmentId?: string;

  lifecycleStatus?:
    RoleLifecycleStatus;

  promotedCapabilityCount?:
    number;

  emergingCapabilities?:
    StagedCapability[];

  gaps?: GapQuestion[];

  requiresFurtherClarification?:
    boolean;

  message?: string;
  error?: string;
};

/* ============================================================
   HELPERS
============================================================ */

function mergeCapabilities(
  existing: StagedCapability[],
  incoming: StagedCapability[]
): StagedCapability[] {
  const map =
    new Map<string, StagedCapability>();

  for (const item of existing) {
    map.set(item.id, item);
  }

  for (const item of incoming) {
    map.set(item.id, item);
  }

  return Array.from(
    map.values()
  );
}

function roleDateLabel(
  role: RoleContext
): string {
  const from =
    role.fromDate?.trim() ||
    "Unknown start";

  const to =
    role.toDate?.trim() ||
    "Present / unknown";

  return `${from} – ${to}`;
}

function confidencePercent(
  value?: number | null
): number {
  const number =
    Number(value);

  if (
    !Number.isFinite(number)
  ) {
    return 0;
  }

  return Math.round(
    Math.max(
      0,
      Math.min(1, number)
    ) * 100
  );
}

type EntryPath = "cv" | "manual";

type ProcessingOrder =
  | "latest_first"
  | "earliest_first";

type ManualRoleInput = {
  organisationName: string;
  roleTitle: string;
  fromDate: string;
  toDate: string;
  roleDescription: string;
  engagementModel: string;
  employmentContext: string;
};

const blankManualRole =
  (): ManualRoleInput => ({
    organisationName: "",
    roleTitle: "",
    fromDate: "",
    toDate: "",
    roleDescription: "",
    engagementModel: "",
    employmentContext: "",
  });

/* ============================================================
   CV PROCESSING STEPS
============================================================ */

type CVProcessingStep = {
  id: string;
  label: string;
};

const CV_PROCESSING_STEPS:
  CVProcessingStep[] = [
    {
      id: "upload",
      label: "Uploading CV",
    },
    {
      id: "extract",
      label: "Extracting CV content",
    },
    {
      id: "roles",
      label:
        "Identifying roles, organisations and dates",
    },
    {
      id: "knowledge_base",
      label:
        "Matching evidence against the Capability Knowledge Base",
    },
    {
      id: "ai",
      label:
        "Using AI to interpret and enrich the evidence",
    },
    {
      id: "prepare",
      label:
        "Preparing role-by-role capability review",
    },
  ];

/* ============================================================
   COMPONENT
============================================================ */

export default function CareerIntelligenceJourney() {
  const [entryPath, setEntryPath] =
    useState<EntryPath | null>(
      null
    );

  const [
    processingOrder,
    setProcessingOrder,
  ] =
    useState<ProcessingOrder>(
      "latest_first"
    );

  const [
    manualCandidateName,
    setManualCandidateName,
  ] =
    useState("");

  const [
    manualRoles,
    setManualRoles,
  ] =
    useState<ManualRoleInput[]>([
      blankManualRole(),
    ]);

  const activeEndpoint =
    entryPath === "manual"
      ? NO_CV_ROUTE_ENDPOINT
      : CV_ROUTE_ENDPOINT;

  /* ------------------------------------------------------------
     CV JOURNEY STATE
  ------------------------------------------------------------ */

  const [
    candidateName,
    setCandidateName,
  ] = useState("");

  const [
    assessmentId,
    setAssessmentId,
  ] = useState<string | null>(
    null
  );

  const [
    roles,
    setRoles,
  ] = useState<RoleContext[]>(
    []
  );

  const [
    currentRoleIndex,
    setCurrentRoleIndex,
  ] = useState(0);

  /* ------------------------------------------------------------
     CV PROCESSING PROGRESS
  ------------------------------------------------------------ */

  const [
    cvProgress,
    setCvProgress,
  ] = useState(0);

  const [
    cvProcessingStep,
    setCvProcessingStep,
  ] = useState(0);

  /* ------------------------------------------------------------
     PAGE / REQUEST STATE
  ------------------------------------------------------------ */

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    assessing,
    setAssessing,
  ] = useState(false);

  const [
    savingRole,
    setSavingRole,
  ] = useState(false);

  const [
    submittingRole,
    setSubmittingRole,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState<string | null>(
    null
  );

  const [
    message,
    setMessage,
  ] = useState<string | null>(
    null
  );

  /* ------------------------------------------------------------
     CLARIFICATION ANSWERS
  ------------------------------------------------------------ */

  const [
    answers,
    setAnswers,
  ] = useState<
    Record<string, string>
  >({});

  /* ------------------------------------------------------------
     ROLE CONTEXT EDITING
  ------------------------------------------------------------ */

  const [
    editingRole,
    setEditingRole,
  ] = useState(false);

  const [
    roleDraft,
    setRoleDraft,
  ] =
    useState<RoleContext | null>(
      null
    );

  /* ------------------------------------------------------------
     CAPABILITY EDITING
  ------------------------------------------------------------ */

  const [
    editingCapabilityId,
    setEditingCapabilityId,
  ] =
    useState<string | null>(
      null
    );

  const [
    editCapabilityName,
    setEditCapabilityName,
  ] = useState("");

  const [
    editEvidence,
    setEditEvidence,
  ] = useState("");

  const [
    savingCapabilityId,
    setSavingCapabilityId,
  ] =
    useState<string | null>(
      null
    );

  /* ============================================================
     DERIVED STATE
  ============================================================ */

  const currentRole =
    roles[currentRoleIndex] ??
    null;

  const totalRoles =
    roles.length;

  const completedRoles =
    roles.filter(
      (role) =>
        role.lifecycleStatus ===
          "completed" ||
        role.lifecycleStatus ===
          "submitted"
    ).length;

  const currentReviewableCapabilities =
    useMemo(
      () =>
        currentRole
          ? currentRole.stagedCapabilities.filter(
              (item) =>
                item.capabilityStatus ===
                  "demonstrated" &&
                item.assessmentStatus !==
                  "needs_clarification"
            )
          : [],
      [currentRole]
    );

  const currentConfirmedGaps =
    useMemo(
      () =>
        currentRole
          ? currentRole.stagedCapabilities.filter(
              (item) =>
                item.capabilityStatus ===
                  "gap" &&
                item.assessmentStatus ===
                  "assessed"
            )
          : [],
      [currentRole]
    );

  const unresolvedCapabilities =
    currentReviewableCapabilities.filter(
      (item) =>
        item.reviewStatus ===
        "proposed"
    );

  const unresolvedClarifications =
    currentRole?.gaps ?? [];

  const canSubmitRole =
    Boolean(
      currentRole &&
      currentRole.roleTitle.trim() &&
      currentRole.organisationName.trim() &&
      unresolvedClarifications.length ===
        0 &&
      unresolvedCapabilities.length ===
        0 &&
      currentRole.lifecycleStatus !==
        "completed" &&
      currentRole.lifecycleStatus !==
        "submitted"
    );

  const allRolesComplete =
    totalRoles > 0 &&
    completedRoles ===
      totalRoles;

  /* ============================================================
     LOCAL ROLE UPDATE
  ============================================================ */

  function updateRoleLocally(
    roleAssessmentId: string,
    updater:
      (
        role: RoleContext
      ) => RoleContext
  ) {
    setRoles(
      (previous) =>
        previous.map(
          (role) =>
            role.roleAssessmentId ===
            roleAssessmentId
              ? updater(role)
              : role
        )
    );
  }

  /* ============================================================
     ENTRY PATH / MANUAL ROLE ENTRY
  ============================================================ */

  function choosePath(
    path: EntryPath
  ) {
    setEntryPath(path);
    setError(null);
    setMessage(null);
    setRoles([]);
    setCurrentRoleIndex(0);
  }

  function updateManualRole(
    index: number,
    field: keyof ManualRoleInput,
    value: string
  ) {
    setManualRoles(
      (previous) =>
        previous.map(
          (role, i) =>
            i === index
              ? {
                  ...role,
                  [field]: value,
                }
              : role
        )
    );
  }

  function addManualRole() {
    setManualRoles(
      (previous) => [
        ...previous,
        blankManualRole(),
      ]
    );
  }

  function removeManualRole(
    index: number
  ) {
    setManualRoles(
      (previous) =>
        previous.length === 1
          ? previous
          : previous.filter(
              (_, i) =>
                i !== index
            )
    );
  }

  async function startManualJourney() {
    const incomplete =
      manualRoles.some(
        (role) =>
          !role.organisationName.trim() ||
          !role.roleTitle.trim()
      );

    if (incomplete) {
      setError(
        "Please provide an organisation and role title for every role."
      );
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const orderedRoles =
        processingOrder ===
        "latest_first"
          ? [...manualRoles]
          : [...manualRoles].reverse();

      const response =
        await fetch(
          NO_CV_ROUTE_ENDPOINT,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              action:
                "start_manual",
              candidateName:
                manualCandidateName,
              processingOrder,
              roles: orderedRoles,
            }),
          }
        );

      const text =
        await response.text();

      let data:
        CVAnalysisResponse;

      try {
        data =
          JSON.parse(text);
      } catch {
        throw new Error(
          text ||
            "The server returned an invalid manual-role response."
        );
      }

      if (
        !response.ok ||
        data.error
      ) {
        throw new Error(
          data.error ||
            "Manual role assessment could not be started."
        );
      }

      const preparedRoles =
        Array.isArray(data.roles)
          ? data.roles
          : [];

      if (
        !preparedRoles.length
      ) {
        throw new Error(
          "No roles were prepared for assessment."
        );
      }

      setCandidateName(
        data.candidateName ||
          manualCandidateName
      );

      setAssessmentId(
        data.assessmentId ||
          null
      );

      setRoles(
        preparedRoles
      );

      setCurrentRoleIndex(0);

      setMessage(
        data.message ||
          "Manual role assessment started."
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unknown manual-role error."
      );
    } finally {
      setLoading(false);
    }
  }

  /* ============================================================
     UPLOAD CV
  ============================================================ */

  async function upload(
    file: File
  ) {
    setLoading(true);

    setError(null);
    setMessage(null);

    setCandidateName("");
    setAssessmentId(null);
    setRoles([]);
    setCurrentRoleIndex(0);
    setAnswers({});
    setEditingRole(false);
    setRoleDraft(null);
    setEditingCapabilityId(
      null
    );

    /*
     * Start visual CV-processing journey.
     */
    setCvProgress(0);
    setCvProcessingStep(0);

    let progressTimer:
      ReturnType<typeof setInterval> | null =
      null;

    try {
      const formData =
        new FormData();

      formData.append(
        "cv",
        file
      );

      formData.append(
        "action",
        "analyse_cv_roles"
      );

      /*
       * The existing API returns a single response
       * after processing. The timer therefore provides
       * a meaningful visual representation of the
       * processing stages without pretending that the
       * percentage is a backend measurement.
       *
       * It will never exceed 90% until the server has
       * actually returned successfully.
       */
      progressTimer =
        setInterval(() => {
          setCvProgress(
            (previous) => {
              if (
                previous >= 90
              ) {
                return previous;
              }

              const next =
                Math.min(
                  previous + 3,
                  90
                );

              /*
               * Six stages are mapped across the
               * available 0–90% processing window.
               */
              const stage =
                Math.min(
                  CV_PROCESSING_STEPS.length -
                    1,
                  Math.floor(
                    (
                      next /
                      90
                    ) *
                    (
                      CV_PROCESSING_STEPS.length -
                      1
                    )
                  )
                );

              setCvProcessingStep(
                stage
              );

              return next;
            }
          );
        }, 350);

      /*
       * STEP 1
       */
      setCvProcessingStep(0);
      setCvProgress(5);

      const response =
        await fetch(
          CV_ROUTE_ENDPOINT,
          {
            method: "POST",
            body: formData,
          }
        );

      /*
       * STEP 2
       */
      setCvProcessingStep(1);
      setCvProgress(25);

      const text =
        await response.text();

      /*
       * STEP 3
       */
      setCvProcessingStep(2);
      setCvProgress(45);

      let data:
        CVAnalysisResponse;

      try {
        data =
          JSON.parse(text);
      } catch {
        throw new Error(
          text ||
            "The server returned an invalid CV analysis response."
        );
      }

      if (
        !response.ok ||
        data.error
      ) {
        throw new Error(
          data.error ||
            "CV analysis failed."
        );
      }

      const discoveredRoles =
        Array.isArray(data.roles)
          ? data.roles
          : [];

      if (
        discoveredRoles.length ===
        0
      ) {
        throw new Error(
          "No employment roles were identified from the CV."
        );
      }

      /*
       * STEP 4
       * Capability Knowledge Base matching.
       */
      setCvProcessingStep(3);
      setCvProgress(65);

      /*
       * STEP 5
       * AI interpretation/enrichment.
       */
      setCvProcessingStep(4);
      setCvProgress(82);

      /*
       * STEP 6
       * Prepare role-by-role workspace.
       */
      setCvProcessingStep(5);
      setCvProgress(95);

      setCandidateName(
        data.candidateName ||
          ""
      );

      setAssessmentId(
        data.assessmentId ||
          null
      );

      setRoles(
        discoveredRoles
      );

      setCurrentRoleIndex(0);

      setCvProgress(100);

      setCvProcessingStep(
        CV_PROCESSING_STEPS.length
      );

      setMessage(
        `CV analysed. ${discoveredRoles.length} role${
          discoveredRoles.length ===
          1
            ? ""
            : "s"
        } identified.`
      );
    } catch (err) {
      if (progressTimer) {
        clearInterval(
          progressTimer
        );
      }

      setCvProgress(0);
      setCvProcessingStep(0);

      setError(
        err instanceof Error
          ? err.message
          : "Unknown CV analysis error."
      );
    } finally {
      if (progressTimer) {
        clearInterval(
          progressTimer
        );
      }

      setLoading(false);
    }
  }

  /* ============================================================
     ROLE CONTEXT EDITING
  ============================================================ */

  function beginRoleEdit() {
    if (!currentRole) {
      return;
    }

    setRoleDraft({
      ...currentRole,
    });

    setEditingRole(true);
    setError(null);
  }

  function cancelRoleEdit() {
    setEditingRole(false);
    setRoleDraft(null);
  }

  function updateRoleDraft(
    field:
      | "organisationName"
      | "roleTitle"
      | "fromDate"
      | "toDate"
      | "roleDescription"
      | "engagementModel"
      | "employmentContext",
    value: string
  ) {
    setRoleDraft(
      (previous) => {
        if (!previous) {
          return previous;
        }

        return {
          ...previous,
          [field]:
            value,
        };
      }
    );
  }

  async function saveRoleContext() {
    if (
      !roleDraft ||
      !currentRole
    ) {
      return;
    }

    if (
      !roleDraft.roleTitle.trim()
    ) {
      setError(
        "A role title is required."
      );

      return;
    }

    if (
      !roleDraft
        .organisationName
        .trim()
    ) {
      setError(
        "An organisation name is required."
      );

      return;
    }

    setSavingRole(true);
    setError(null);

    try {
      const payload = {
        action:
          "update_role_context",

        assessmentId,

        roleAssessmentId:
          roleDraft
            .roleAssessmentId,

        organisationName:
          roleDraft
            .organisationName,

        roleTitle:
          roleDraft.roleTitle,

        fromDate:
          roleDraft.fromDate,

        toDate:
          roleDraft.toDate,

        roleDescription:
          roleDraft
            .roleDescription,

        engagementModel:
          roleDraft
            .engagementModel,

        employmentContext:
          roleDraft
            .employmentContext,
      };

      const response =
        await fetch(
          activeEndpoint,
          {
            method: "POST",

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

      const text =
        await response.text();

      let data:
        RoleContextResponse;

      try {
        data =
          JSON.parse(text);
      } catch {
        throw new Error(
          text ||
            "The server returned an invalid role update response."
        );
      }

      if (
        !response.ok ||
        data.error
      ) {
        throw new Error(
          data.error ||
            "Role details could not be updated."
        );
      }

      const savedRole =
        data.role ||
        roleDraft;

      updateRoleLocally(
        currentRole
          .roleAssessmentId,
        () => savedRole
      );

      setEditingRole(false);
      setRoleDraft(null);

      setMessage(
        "Role details updated."
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unknown role update error."
      );
    } finally {
      setSavingRole(false);
    }
  }

  /* ============================================================
     CLARIFICATION ANSWERS
  ============================================================ */

  function answerKey(
    gap: GapQuestion,
    index: number
  ) {
    return (
      gap.id ||
      `${currentRole?.roleAssessmentId}-${index}-${gap.competency}`
    );
  }

  function updateAnswer(
    gap: GapQuestion,
    index: number,
    value: string
  ) {
    const key =
      answerKey(
        gap,
        index
      );

    setAnswers(
      (previous) => ({
        ...previous,
        [key]:
          value,
      })
    );
  }

  async function submitClarifications() {
    if (
      !currentRole ||
      currentRole.gaps.length ===
        0
    ) {
      return;
    }

    const unanswered =
      currentRole.gaps.some(
        (gap, index) => {
          const key =
            answerKey(
              gap,
              index
            );

          return !answers[
            key
          ]?.trim();
        }
      );

    if (unanswered) {
      setError(
        "Please answer every clarification question before continuing."
      );

      return;
    }

    setAssessing(true);
    setError(null);
    setMessage(null);

    try {
      const payload = {
        action:
          "assess_role",

        assessmentId,

        roleAssessmentId:
          currentRole
            .roleAssessmentId,

        roleContext: {
          organisationName:
            currentRole
              .organisationName,

          roleTitle:
            currentRole
              .roleTitle,

          fromDate:
            currentRole
              .fromDate,

          toDate:
            currentRole
              .toDate,

          roleDescription:
            currentRole
              .roleDescription,

          engagementModel:
            currentRole
              .engagementModel,

          employmentContext:
            currentRole
              .employmentContext,
        },

        questions:
          currentRole.gaps.map(
            (
              gap,
              index
            ) => {
              const key =
                answerKey(
                  gap,
                  index
                );

              return {
                gapId:
                  gap.id,

                competency:
                  gap.competency,

                reason:
                  gap.reason,

                question:
                  gap.question,

                answer:
                  answers[key] ||
                  "",
              };
            }
          ),
      };

      const response =
        await fetch(
          activeEndpoint,
          {
            method: "POST",

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

      const text =
        await response.text();

      let data:
        RoleAssessmentResponse;

      try {
        data =
          JSON.parse(text);
      } catch {
        throw new Error(
          text ||
            "The server returned an invalid role assessment response."
        );
      }

      if (
        !response.ok ||
        data.error
      ) {
        throw new Error(
          data.error ||
            "Role assessment failed."
        );
      }

      updateRoleLocally(
        currentRole
          .roleAssessmentId,
        (role) => ({
          ...role,

          stagedCapabilities:
            mergeCapabilities(
              role
                .stagedCapabilities,
              data
                .stagedCapabilities ||
                []
            ),

          gaps:
            data.gaps ||
            [],

          lifecycleStatus:
            data
              .lifecycleStatus ||
            (
              data
                .requiresFurtherClarification
                ? "in_progress"
                : "review_ready"
            ),
        })
      );

      setAnswers({});

      if (
        data
          .requiresFurtherClarification
      ) {
        setMessage(
          data.message ||
            "Additional capability evidence has emerged. Further clarification is required before this role can be completed."
        );
      } else {
        setMessage(
          data.message ||
            "Clarification complete. Review the capability evidence for this role."
        );
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unknown assessment error."
      );
    } finally {
      setAssessing(false);
    }
  }

  /* ============================================================
     CAPABILITY REVIEW
  ============================================================ */

  function beginCapabilityEdit(
    capability:
      StagedCapability
  ) {
    setEditingCapabilityId(
      capability.id
    );

    setEditCapabilityName(
      capability
        .editedCompetencyName ||
        capability
          .proposedCompetencyName
    );

    setEditEvidence(
      capability
        .editedEvidence ??
        capability.evidence ??
        ""
    );

    setError(null);
  }

  function cancelCapabilityEdit() {
    setEditingCapabilityId(
      null
    );

    setEditCapabilityName("");

    setEditEvidence("");
  }

  async function saveCapabilityDecision(
    capability:
      StagedCapability,
    reviewStatus:
      | "accepted"
      | "edited"
      | "rejected",
    competencyName?: string,
    evidence?: string
  ) {
    if (!currentRole) {
      return;
    }

    setSavingCapabilityId(
      capability.id
    );

    setError(null);

    try {
      const payload = {
        action:
          "review_capability",

        assessmentId,

        roleAssessmentId:
          currentRole
            .roleAssessmentId,

        capabilityId:
          capability.id,

        reviewStatus,

        competencyName:
          reviewStatus ===
          "edited"
            ? competencyName
            : undefined,

        evidence:
          reviewStatus ===
          "edited"
            ? evidence
            : undefined,
      };

      const response =
        await fetch(
          activeEndpoint,
          {
            method: "POST",

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

      const text =
        await response.text();

      let data:
        CapabilityReviewResponse;

      try {
        data =
          JSON.parse(text);
      } catch {
        throw new Error(
          text ||
            "The server returned an invalid capability review response."
        );
      }

      if (
        !response.ok ||
        data.error ||
        !data.capability
      ) {
        throw new Error(
          data.error ||
            "The capability review could not be saved."
        );
      }

      updateRoleLocally(
        currentRole
          .roleAssessmentId,
        (role) => ({
          ...role,

          stagedCapabilities:
            role
              .stagedCapabilities
              .map(
                (item) =>
                  item.id ===
                  data
                    .capability
                    ?.id
                    ? data
                        .capability!
                    : item
              ),
        })
      );

      if (
        editingCapabilityId ===
        capability.id
      ) {
        cancelCapabilityEdit();
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unknown capability review error."
      );
    } finally {
      setSavingCapabilityId(
        null
      );
    }
  }

  /* ============================================================
     SUBMIT ROLE
  ============================================================ */

  async function submitCurrentRole() {
    if (!currentRole) {
      return;
    }

    if (
      currentRole.gaps.length >
      0
    ) {
      setError(
        "This role still has clarification questions to resolve."
      );

      return;
    }

    if (
      unresolvedCapabilities.length >
      0
    ) {
      setError(
        "Please accept, edit or reject every proposed capability before submitting this role."
      );

      return;
    }

    setSubmittingRole(true);
    setError(null);
    setMessage(null);

    try {
      const payload = {
        action:
          "submit_role",

        assessmentId,

        roleAssessmentId:
          currentRole
            .roleAssessmentId,
      };

      const response =
        await fetch(
          activeEndpoint,
          {
            method: "POST",

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

      const text =
        await response.text();

      let data:
        RoleSubmissionResponse;

      try {
        data =
          JSON.parse(text);
      } catch {
        throw new Error(
          text ||
            "The server returned an invalid role submission response."
        );
      }

      if (
        !response.ok ||
        data.error
      ) {
        throw new Error(
          data.error ||
            "The role could not be submitted."
        );
      }

      const emerging =
        data
          .emergingCapabilities ||
        [];

      const nextGaps =
        data.gaps || [];

      const requiresLoop =
        Boolean(
          data
            .requiresFurtherClarification ||
            nextGaps.length >
              0 ||
            emerging.some(
              (item) =>
                item.reviewStatus ===
                "proposed"
            )
        );

      if (requiresLoop) {
        updateRoleLocally(
          currentRole
            .roleAssessmentId,
          (role) => ({
            ...role,

            stagedCapabilities:
              mergeCapabilities(
                role
                  .stagedCapabilities,
                emerging
              ),

            gaps:
              nextGaps,

            lifecycleStatus:
              nextGaps.length >
              0
                ? "in_progress"
                : "review_ready",
          })
        );

        setAnswers({});

        setMessage(
          data.message ||
            "Submission identified additional capability intelligence. Review the new evidence and complete any further clarification before resubmitting this role."
        );

        return;
      }

      updateRoleLocally(
        currentRole
          .roleAssessmentId,
        (role) => ({
          ...role,

          lifecycleStatus:
            data
              .lifecycleStatus ||
            "completed",
        })
      );

      if (
        currentRoleIndex <
        roles.length - 1
      ) {
        const nextIndex =
          currentRoleIndex +
          1;

        setRoles(
          (previous) =>
            previous.map(
              (
                role,
                index
              ) =>
                index ===
                  nextIndex &&
                role.lifecycleStatus ===
                  "not_started"
                  ? {
                      ...role,
                      lifecycleStatus:
                        "in_progress",
                    }
                  : role
            )
        );

        setCurrentRoleIndex(
          nextIndex
        );

        setAnswers({});
        setEditingRole(false);
        setRoleDraft(null);
        setEditingCapabilityId(
          null
        );

        setMessage(
          data.message ||
            "Role completed. The next role is now ready for review."
        );
      } else {
        setMessage(
          data.message ||
            "Final role completed."
        );
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unknown role submission error."
      );
    } finally {
      setSubmittingRole(false);
    }
  }

  /* ============================================================
     ROLE NAVIGATION
  ============================================================ */

  function selectRole(
    index: number
  ) {
    if (
      index < 0 ||
      index >= roles.length
    ) {
      return;
    }

    if (
      index >
      currentRoleIndex
    ) {
      return;
    }

    setCurrentRoleIndex(
      index
    );

    setAnswers({});
    setEditingRole(false);
    setRoleDraft(null);
    setEditingCapabilityId(
      null
    );

    setError(null);
  }

  /* ============================================================
     UI
  ============================================================ */

  return (
    <main className="mx-auto max-w-5xl p-6">

      <h1 className="mb-6 text-2xl font-bold">
        Career Intelligence — CV Review
      </h1>

      {/* ========================================================
          ENTRY PATH
      ======================================================== */}

      {!entryPath &&
        roles.length === 0 && (
          <div className="rounded-lg border bg-white p-6">

            <h2 className="text-xl font-semibold">
              Do you have a CV to upload?
            </h2>

            <p className="mt-2 text-slate-600">
              Choose how you would like to
              build your career history.
              Both routes join the same
              role-by-role capability review
              process.
            </p>

            <div className="mt-5 flex flex-wrap gap-3">

              <button
                type="button"
                onClick={() =>
                  choosePath("cv")
                }
                className="rounded-lg bg-slate-900 px-6 py-3 font-semibold text-white"
              >
                Yes — upload CV
              </button>

              <button
                type="button"
                onClick={() =>
                  choosePath("manual")
                }
                className="rounded-lg border border-slate-300 px-6 py-3 font-semibold"
              >
                No — enter roles manually
              </button>

            </div>
          </div>
        )}

      {/* ========================================================
          CV UPLOAD
      ======================================================== */}

      {entryPath === "cv" &&
        roles.length === 0 && (
          <div className="rounded-lg border bg-white p-5">

            <div className="flex items-start justify-between gap-4">

              <div>
                <h2 className="text-lg font-semibold">
                  Upload CV
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  All identifiable roles,
                  organisations, dates and
                  role-specific capability
                  evidence will be extracted.
                </p>
              </div>

              {!loading && (
                <button
                  type="button"
                  onClick={() =>
                    setEntryPath(null)
                  }
                  className="text-sm font-medium text-slate-600"
                >
                  Change
                </button>
              )}

            </div>

            {!loading && (
              <input
                type="file"
                accept=".pdf,.docx"
                disabled={loading}
                onChange={(event) => {
                  const file =
                    event.target.files?.[0];

                  if (file) {
                    upload(file);
                  }
                }}
                className="mt-5 block w-full text-sm"
              />
            )}

            {/* ==================================================
                CV PROCESSING PROGRESS
            ================================================== */}

            {loading && (
              <div className="mt-6 rounded-lg border bg-slate-50 p-5">

                <div className="flex items-center justify-between gap-4">

                  <div>
                    <p className="font-semibold text-slate-800">
                      Analysing your CV
                    </p>

                    <p className="mt-1 text-sm text-slate-500">
                      Please wait while GIAS
                      processes your career
                      history.
                    </p>
                  </div>

                  <p className="text-lg font-bold text-slate-900">
                    {cvProgress}%
                  </p>

                </div>

                <div
                  className="mt-5 h-3 w-full overflow-hidden rounded-full bg-slate-200"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={cvProgress}
                  aria-label="CV processing progress"
                >

                  <div
                    className="h-full rounded-full bg-slate-900 transition-all duration-300 ease-out"
                    style={{
                      width:
                        `${cvProgress}%`,
                    }}
                  />

                </div>

                <p className="mt-3 text-sm font-medium text-slate-700">
                  {cvProcessingStep >=
                  CV_PROCESSING_STEPS.length
                    ? "CV processing complete"
                    : CV_PROCESSING_STEPS[
                        cvProcessingStep
                      ]?.label ||
                      "Preparing your career review..."}
                </p>

                <div className="mt-5 space-y-3">

                  {CV_PROCESSING_STEPS.map(
                    (
                      step,
                      index
                    ) => {

                      const complete =
                        index <
                        cvProcessingStep;

                      const active =
                        index ===
                        cvProcessingStep &&
                        cvProcessingStep <
                          CV_PROCESSING_STEPS.length;

                      return (
                        <div
                          key={step.id}
                          className={`flex items-center gap-3 rounded-lg p-3 ${
                            active
                              ? "bg-white"
                              : complete
                                ? "bg-white"
                                : "bg-slate-100/70"
                          }`}
                        >

                          <div
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                              complete
                                ? "bg-green-600 text-white"
                                : active
                                  ? "border-2 border-slate-900 bg-white text-slate-900"
                                  : "border border-slate-300 bg-white text-slate-400"
                            }`}
                          >

                            {complete ? (
                              <span aria-hidden="true">
                                ✓
                              </span>
                            ) : (
                              <span>
                                {index + 1}
                              </span>
                            )}

                          </div>

                          <div className="flex-1">

                            <p
                              className={`text-sm ${
                                complete
                                  ? "font-semibold text-green-700"
                                  : active
                                    ? "font-semibold text-slate-900"
                                    : "text-slate-500"
                              }`}
                            >
                              {step.label}
                            </p>

                            {active && (
                              <p className="mt-1 text-xs text-slate-500">
                                Processing...
                              </p>
                            )}

                            {complete && (
                              <p className="mt-1 text-xs text-green-600">
                                Complete
                              </p>
                            )}

                          </div>

                        </div>
                      );
                    }
                  )}

                </div>

              </div>
            )}

          </div>
        )}

      {/* ========================================================
          MANUAL ROLE ENTRY
      ======================================================== */}

      {entryPath === "manual" &&
        roles.length === 0 && (
          <div className="rounded-lg border bg-white p-5">

            <div className="flex items-start justify-between gap-4">

              <div>
                <h2 className="text-lg font-semibold">
                  Enter career roles
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Enter each role in
                  most-recent-to-oldest order.
                  You can choose below whether
                  the assessment starts with the
                  latest or earliest role.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setEntryPath(null)
                }
                className="text-sm font-medium text-slate-600"
              >
                Change
              </button>

            </div>

            <label className="mt-5 block text-sm font-medium">

              Candidate name (optional)

              <input
                type="text"
                value={
                  manualCandidateName
                }
                onChange={(e) =>
                  setManualCandidateName(
                    e.target.value
                  )
                }
                className="mt-1 w-full rounded-lg border p-3 font-normal"
              />

            </label>

            <div className="mt-5 rounded-lg bg-slate-50 p-4">

              <p className="text-sm font-semibold">
                Where should we start?
              </p>

              <div className="mt-3 flex flex-wrap gap-4 text-sm">

                <label className="flex items-center gap-2">

                  <input
                    type="radio"
                    checked={
                      processingOrder ===
                      "latest_first"
                    }
                    onChange={() =>
                      setProcessingOrder(
                        "latest_first"
                      )
                    }
                  />

                  Start with latest role

                </label>

                <label className="flex items-center gap-2">

                  <input
                    type="radio"
                    checked={
                      processingOrder ===
                      "earliest_first"
                    }
                    onChange={() =>
                      setProcessingOrder(
                        "earliest_first"
                      )
                    }
                  />

                  Start with earliest role

                </label>

              </div>

            </div>

            <div className="mt-6 space-y-5">

              {manualRoles.map(
                (
                  role,
                  index
                ) => (

                  <div
                    key={index}
                    className="rounded-lg border p-5"
                  >

                    <div className="flex items-center justify-between gap-4">

                      <h3 className="font-semibold">
                        Role {index + 1}
                      </h3>

                      {manualRoles.length >
                        1 && (
                        <button
                          type="button"
                          onClick={() =>
                            removeManualRole(
                              index
                            )
                          }
                          className="text-sm font-medium text-red-700"
                        >
                          Remove
                        </button>
                      )}

                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">

                      <label className="text-sm font-medium">

                        Organisation /
                        business name

                        <input
                          type="text"
                          value={
                            role.organisationName
                          }
                          onChange={(e) =>
                            updateManualRole(
                              index,
                              "organisationName",
                              e.target
                                .value
                            )
                          }
                          className="mt-1 w-full rounded-lg border p-3 font-normal"
                        />

                      </label>

                      <label className="text-sm font-medium">

                        Role title

                        <input
                          type="text"
                          value={
                            role.roleTitle
                          }
                          onChange={(e) =>
                            updateManualRole(
                              index,
                              "roleTitle",
                              e.target
                                .value
                            )
                          }
                          className="mt-1 w-full rounded-lg border p-3 font-normal"
                        />

                      </label>

                      <label className="text-sm font-medium">

                        From date

                        <input
                          type="text"
                          value={
                            role.fromDate
                          }
                          onChange={(e) =>
                            updateManualRole(
                              index,
                              "fromDate",
                              e.target
                                .value
                            )
                          }
                          placeholder="e.g. Jun 2015"
                          className="mt-1 w-full rounded-lg border p-3 font-normal"
                        />

                      </label>

                      <label className="text-sm font-medium">

                        To date

                        <input
                          type="text"
                          value={
                            role.toDate
                          }
                          onChange={(e) =>
                            updateManualRole(
                              index,
                              "toDate",
                              e.target
                                .value
                            )
                          }
                          placeholder="e.g. Feb 2022 or Present"
                          className="mt-1 w-full rounded-lg border p-3 font-normal"
                        />

                      </label>

                      <label className="text-sm font-medium">

                        Engagement model
                        (optional)

                        <input
                          type="text"
                          value={
                            role.engagementModel
                          }
                          onChange={(e) =>
                            updateManualRole(
                              index,
                              "engagementModel",
                              e.target
                                .value
                            )
                          }
                          placeholder="Employee, Contractor, Freelance..."
                          className="mt-1 w-full rounded-lg border p-3 font-normal"
                        />

                      </label>

                      <label className="text-sm font-medium">

                        Employment /
                        working context
                        (optional)

                        <input
                          type="text"
                          value={
                            role.employmentContext
                          }
                          onChange={(e) =>
                            updateManualRole(
                              index,
                              "employmentContext",
                              e.target
                                .value
                            )
                          }
                          className="mt-1 w-full rounded-lg border p-3 font-normal"
                        />

                      </label>

                    </div>

                    <label className="mt-4 block text-sm font-medium">

                      Brief role description
                      (optional)

                      <textarea
                        value={
                          role.roleDescription
                        }
                        onChange={(e) =>
                          updateManualRole(
                            index,
                            "roleDescription",
                            e.target
                              .value
                          )
                        }
                        rows={4}
                        className="mt-1 w-full rounded-lg border p-3 font-normal"
                        placeholder="Briefly describe responsibilities or leave blank and GIAS will ask evidence-seeking questions."
                      />

                    </label>

                  </div>

                )
              )}

            </div>

            <div className="mt-5 flex flex-wrap gap-3">

              <button
                type="button"
                onClick={
                  addManualRole
                }
                className="rounded-lg border px-4 py-2 text-sm font-semibold"
              >
                Add another role
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={
                  startManualJourney
                }
                className="rounded-lg bg-slate-900 px-6 py-3 font-semibold text-white disabled:opacity-50"
              >
                {loading
                  ? "Preparing roles..."
                  : "Start assessment"}
              </button>

            </div>

          </div>
        )}

      {/* ========================================================
          GLOBAL ERROR / MESSAGE
      ======================================================== */}

      {error && (
        <div className="mt-6 rounded-lg bg-red-50 p-4 text-red-800">
          {error}
        </div>
      )}

      {message && (
        <div className="mt-6 rounded-lg bg-blue-50 p-4 text-blue-800">
          {message}
        </div>
      )}

      {/* ========================================================
          MULTI-ROLE JOURNEY
      ======================================================== */}

      {currentRole && (
        <div className="mt-8">

          {/* CANDIDATE / PROGRESS */}

          <div className="rounded-lg border bg-white p-5">

            {candidateName && (
              <h2 className="text-2xl font-semibold">
                {candidateName}
              </h2>
            )}

            <div className="mt-4">

              <div className="flex items-center justify-between gap-4">

                <p className="font-medium">
                  Role{" "}
                  {currentRoleIndex + 1}{" "}
                  of{" "}
                  {totalRoles}
                </p>

                <p className="text-sm text-slate-500">
                  {completedRoles}{" "}
                  completed
                </p>

              </div>

              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">

                <div
                  className="h-full bg-slate-900"
                  style={{
                    width:
                      `${Math.round(
                        (
                          completedRoles /
                          totalRoles
                        ) *
                          100
                      )}%`,
                  }}
                />

              </div>

            </div>

          </div>

          {/* ROLE NAVIGATION */}

          <div className="mt-5 flex flex-wrap gap-2">

            {roles.map(
              (
                role,
                index
              ) => {

                const isCurrent =
                  index ===
                  currentRoleIndex;

                const complete =
                  role.lifecycleStatus ===
                    "completed" ||
                  role.lifecycleStatus ===
                    "submitted";

                const disabled =
                  index !==
                  currentRoleIndex;

                return (
                  <button
                    key={
                      role.roleAssessmentId
                    }
                    type="button"
                    disabled={
                      disabled
                    }
                    onClick={() =>
                      selectRole(
                        index
                      )
                    }
                    className={`rounded-lg border px-3 py-2 text-sm ${
                      isCurrent
                        ? "border-slate-900 bg-slate-900 text-white"
                        : complete
                          ? "border-green-300 bg-green-50 text-green-800"
                          : "border-slate-300 bg-white text-slate-700"
                    } disabled:cursor-not-allowed disabled:opacity-40`}
                  >
                    {index + 1}.{" "}
                    {role.roleTitle}
                  </button>
                );
              }
            )}

          </div>

          {/* ====================================================
              ROLE CONTEXT
          ==================================================== */}

          <div className="mt-6 rounded-lg border bg-white p-5">

            <div className="flex items-start justify-between gap-4">

              <div>

                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Role under review
                </p>

                <h3 className="mt-1 text-xl font-semibold">
                  {
                    currentRole.roleTitle
                  }
                </h3>

                <p className="mt-1 text-slate-600">
                  {
                    currentRole
                      .organisationName
                  }
                </p>

                <p className="mt-1 text-sm text-slate-500">
                  {
                    roleDateLabel(
                      currentRole
                    )
                  }
                </p>

              </div>

              {currentRole.lifecycleStatus !==
                "completed" && (
                <button
                  type="button"
                  onClick={
                    beginRoleEdit
                  }
                  className="rounded-lg border px-4 py-2 text-sm font-semibold"
                >
                  Edit role
                </button>
              )}

            </div>

            {currentRole
              .roleDescription && (
              <p className="mt-4 text-sm text-slate-700">
                {
                  currentRole
                    .roleDescription
                }
              </p>
            )}

            <div className="mt-4 flex flex-wrap gap-2 text-xs">

              {currentRole
                .engagementModel && (
                <span className="rounded-full bg-slate-100 px-3 py-1">
                  {
                    currentRole
                      .engagementModel
                  }
                </span>
              )}

              {currentRole
                .employmentContext && (
                <span className="rounded-full bg-slate-100 px-3 py-1">
                  {
                    currentRole
                      .employmentContext
                  }
                </span>
              )}

              <span className="rounded-full bg-slate-100 px-3 py-1">
                {
                  currentRole
                    .lifecycleStatus
                }
              </span>

            </div>

          </div>

          {/* ROLE EDITOR */}

          {editingRole &&
            roleDraft && (
              <div className="mt-5 rounded-lg border bg-slate-50 p-5">

                <h3 className="font-semibold">
                  Edit role details
                </h3>

                <div className="mt-4 grid gap-4 md:grid-cols-2">

                  <label className="text-sm font-medium">

                    Organisation

                    <input
                      type="text"
                      value={
                        roleDraft
                          .organisationName
                      }
                      onChange={(e) =>
                        updateRoleDraft(
                          "organisationName",
                          e.target
                            .value
                        )
                      }
                      className="mt-1 w-full rounded-lg border bg-white p-3 font-normal"
                    />

                  </label>

                  <label className="text-sm font-medium">

                    Role title

                    <input
                      type="text"
                      value={
                        roleDraft
                          .roleTitle
                      }
                      onChange={(e) =>
                        updateRoleDraft(
                          "roleTitle",
                          e.target
                            .value
                        )
                      }
                      className="mt-1 w-full rounded-lg border bg-white p-3 font-normal"
                    />

                  </label>

                  <label className="text-sm font-medium">

                    From

                    <input
                      type="text"
                      value={
                        roleDraft
                          .fromDate ||
                        ""
                      }
                      onChange={(e) =>
                        updateRoleDraft(
                          "fromDate",
                          e.target
                            .value
                        )
                      }
                      className="mt-1 w-full rounded-lg border bg-white p-3 font-normal"
                    />

                  </label>

                  <label className="text-sm font-medium">

                    To

                    <input
                      type="text"
                      value={
                        roleDraft
                          .toDate ||
                        ""
                      }
                      onChange={(e) =>
                        updateRoleDraft(
                          "toDate",
                          e.target
                            .value
                        )
                      }
                      className="mt-1 w-full rounded-lg border bg-white p-3 font-normal"
                    />

                  </label>

                  <label className="text-sm font-medium">

                    Engagement model

                    <input
                      type="text"
                      value={
                        roleDraft
                          .engagementModel ||
                        ""
                      }
                      onChange={(e) =>
                        updateRoleDraft(
                          "engagementModel",
                          e.target
                            .value
                        )
                      }
                      className="mt-1 w-full rounded-lg border bg-white p-3 font-normal"
                    />

                  </label>

                  <label className="text-sm font-medium">

                    Employment context

                    <input
                      type="text"
                      value={
                        roleDraft
                          .employmentContext ||
                        ""
                      }
                      onChange={(e) =>
                        updateRoleDraft(
                          "employmentContext",
                          e.target
                            .value
                        )
                      }
                      className="mt-1 w-full rounded-lg border bg-white p-3 font-normal"
                    />

                  </label>

                </div>

                <label className="mt-4 block text-sm font-medium">

                  Role description

                  <textarea
                    value={
                      roleDraft
                        .roleDescription ||
                      ""
                    }
                    onChange={(e) =>
                      updateRoleDraft(
                        "roleDescription",
                        e.target
                          .value
                      )
                    }
                    rows={5}
                    className="mt-1 w-full rounded-lg border bg-white p-3 font-normal"
                  />

                </label>

                <div className="mt-4 flex gap-3">

                  <button
                    type="button"
                    disabled={
                      savingRole
                    }
                    onClick={
                      saveRoleContext
                    }
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {
                      savingRole
                        ? "Saving..."
                        : "Save role"
                    }
                  </button>

                  <button
                    type="button"
                    disabled={
                      savingRole
                    }
                    onClick={
                      cancelRoleEdit
                    }
                    className="rounded-lg border px-4 py-2 text-sm font-semibold"
                  >
                    Cancel
                  </button>

                </div>

              </div>
            )}

          {/* ====================================================
              CLARIFICATION LOOP
          ==================================================== */}

          {currentRole.gaps.length >
            0 && (
            <div className="mt-8">

              <div className="rounded-lg bg-amber-50 p-5">

                <h3 className="text-xl font-semibold text-amber-900">
                  Clarification required
                </h3>

                <p className="mt-2 text-amber-800">
                  GIAS requires additional
                  evidence for this role. The
                  role will remain active until
                  these questions and any
                  resulting capability evidence
                  have been resolved.
                </p>

              </div>

              <div className="mt-5 space-y-5">

                {currentRole.gaps.map(
                  (
                    gap,
                    index
                  ) => {

                    const key =
                      answerKey(
                        gap,
                        index
                      );

                    return (
                      <div
                        key={key}
                        className="rounded-lg border bg-white p-5"
                      >

                        <h4 className="font-semibold">
                          {
                            gap
                              .competency
                          }
                        </h4>

                        <p className="mt-2 text-sm text-slate-600">
                          {gap.reason}
                        </p>

                        <div className="mt-4 rounded-lg bg-slate-50 p-4">

                          <p className="font-medium">
                            {
                              gap
                                .question
                            }
                          </p>

                        </div>

                        <textarea
                          value={
                            answers[
                              key
                            ] ||
                            ""
                          }
                          onChange={(e) =>
                            updateAnswer(
                              gap,
                              index,
                              e.target
                                .value
                            )
                          }
                          rows={6}
                          disabled={
                            assessing
                          }
                          placeholder="Provide evidence from your experience..."
                          className="mt-4 w-full rounded-lg border p-3 text-sm"
                        />

                      </div>
                    );
                  }
                )}

              </div>

              <button
                type="button"
                onClick={
                  submitClarifications
                }
                disabled={
                  assessing
                }
                className="mt-5 rounded-lg bg-slate-900 px-6 py-3 font-semibold text-white disabled:opacity-50"
              >
                {
                  assessing
                    ? "Evaluating..."
                    : "Submit clarification"
                }
              </button>

            </div>
          )}

          {/* ====================================================
              CAPABILITY REVIEW
          ==================================================== */}

          {currentReviewableCapabilities.length >
            0 && (
            <div className="mt-8">

              <div className="rounded-lg bg-indigo-50 p-5">

                <h3 className="text-xl font-semibold text-indigo-900">
                  Review role capability evidence
                </h3>

                <p className="mt-2 text-indigo-800">
                  Review all capability
                  intelligence identified for
                  this role. Accepted and edited
                  items will be added to your
                  profile when the role is
                  finally submitted.
                </p>

              </div>

              <div className="mt-5 space-y-5">

                {currentReviewableCapabilities.map(
                  (
                    capability
                  ) => {

                    const editing =
                      editingCapabilityId ===
                      capability.id;

                    const displayedName =
                      capability
                        .reviewStatus ===
                          "edited" &&
                      capability
                        .editedCompetencyName
                        ? capability
                            .editedCompetencyName
                        : capability
                            .proposedCompetencyName;

                    const displayedEvidence =
                      capability
                        .reviewStatus ===
                          "edited" &&
                      capability
                        .editedEvidence
                        ? capability
                            .editedEvidence
                        : capability
                            .evidence ||
                          "";

                    return (
                      <div
                        key={
                          capability.id
                        }
                        className="rounded-lg border bg-white p-5"
                      >

                        {editing ? (
                          <>

                            <label className="block text-sm font-medium">

                              Capability

                              <input
                                type="text"
                                value={
                                  editCapabilityName
                                }
                                onChange={(e) =>
                                  setEditCapabilityName(
                                    e.target
                                      .value
                                  )
                                }
                                className="mt-1 w-full rounded-lg border p-3 font-normal"
                              />

                            </label>

                            <label className="mt-4 block text-sm font-medium">

                              Evidence

                              <textarea
                                value={
                                  editEvidence
                                }
                                onChange={(e) =>
                                  setEditEvidence(
                                    e.target
                                      .value
                                  )
                                }
                                rows={5}
                                className="mt-1 w-full rounded-lg border p-3 font-normal"
                              />

                            </label>

                            <div className="mt-4 flex gap-3">

                              <button
                                type="button"
                                disabled={
                                  savingCapabilityId ===
                                    capability.id ||
                                  !editCapabilityName.trim()
                                }
                                onClick={() =>
                                  saveCapabilityDecision(
                                    capability,
                                    "edited",
                                    editCapabilityName.trim(),
                                    editEvidence.trim()
                                  )
                                }
                                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                              >
                                Save change
                              </button>

                              <button
                                type="button"
                                onClick={
                                  cancelCapabilityEdit
                                }
                                className="rounded-lg border px-4 py-2 text-sm font-semibold"
                              >
                                Cancel
                              </button>

                            </div>

                          </>
                        ) : (
                          <>

                            <div className="flex items-start justify-between gap-4">

                              <div>

                                <h4 className="font-semibold">
                                  {
                                    displayedName
                                  }
                                </h4>

                                <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">

                                  {
                                    capability
                                      .sourceType
                                  }

                                  {
                                    capability
                                      .sourceSection
                                      ? ` · ${capability.sourceSection}`
                                      : ""
                                  }

                                </p>

                              </div>

                              <div className="text-right">

                                <p className="text-sm font-medium text-slate-500">
                                  {
                                    confidencePercent(
                                      capability
                                        .confidence
                                    )
                                  }
                                  %
                                </p>

                                <p className="mt-1 text-xs font-semibold uppercase text-slate-500">
                                  {
                                    capability
                                      .reviewStatus
                                  }
                                </p>

                              </div>

                            </div>

                            {displayedEvidence && (
                              <div className="mt-4 rounded-lg bg-slate-50 p-4">

                                <p className="text-sm text-slate-700">
                                  {
                                    displayedEvidence
                                  }
                                </p>

                              </div>
                            )}

                            <div className="mt-4 flex flex-wrap gap-3">

                              <button
                                type="button"
                                disabled={
                                  savingCapabilityId ===
                                  capability.id
                                }
                                onClick={() =>
                                  saveCapabilityDecision(
                                    capability,
                                    "accepted"
                                  )
                                }
                                className="rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                              >
                                Accept
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  beginCapabilityEdit(
                                    capability
                                  )
                                }
                                className="rounded-lg border px-4 py-2 text-sm font-semibold"
                              >
                                Edit
                              </button>

                              <button
                                type="button"
                                disabled={
                                  savingCapabilityId ===
                                  capability.id
                                }
                                onClick={() =>
                                  saveCapabilityDecision(
                                    capability,
                                    "rejected"
                                  )
                                }
                                className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50"
                              >
                                Reject
                              </button>

                            </div>

                          </>
                        )}

                      </div>
                    );
                  }
                )}

              </div>

            </div>
          )}

          {/* ====================================================
              CONFIRMED GAPS
          ==================================================== */}

          {currentConfirmedGaps.length >
            0 && (
            <div className="mt-8">

              <h3 className="text-xl font-semibold">
                Confirmed capability gaps
              </h3>

              <p className="mt-1 text-sm text-slate-600">
                These capabilities have been
                assessed but sufficient evidence
                has not been established for
                this role.
              </p>

              <div className="mt-4 space-y-3">

                {currentConfirmedGaps.map(
                  (
                    gap
                  ) => (

                    <div
                      key={gap.id}
                      className="rounded-lg border bg-amber-50 p-4"
                    >

                      <p className="font-semibold text-amber-900">
                        {
                          gap
                            .proposedCompetencyName
                        }
                      </p>

                      {gap.evidence && (
                        <p className="mt-2 text-sm text-amber-800">
                          {
                            gap
                              .evidence
                          }
                        </p>
                      )}

                    </div>

                  )
                )}

              </div>

            </div>
          )}

          {/* ====================================================
              ROLE SUBMISSION
          ==================================================== */}

          {currentRole.lifecycleStatus !==
            "completed" &&
            currentRole.lifecycleStatus !==
              "submitted" && (
              <div className="mt-8 rounded-lg border bg-slate-50 p-5">

                <h3 className="text-lg font-semibold">
                  Complete this role
                </h3>

                {currentRole.gaps.length >
                  0 && (
                  <p className="mt-2 text-sm text-amber-700">

                    {
                      currentRole
                        .gaps.length
                    }{" "}
                    clarification item
                    {
                      currentRole
                        .gaps.length ===
                      1
                        ? ""
                        : "s"
                    }{" "}
                    remain.

                  </p>
                )}

                {unresolvedCapabilities.length >
                  0 && (
                  <p className="mt-2 text-sm text-amber-700">

                    {
                      unresolvedCapabilities
                        .length
                    }{" "}
                    capability item
                    {
                      unresolvedCapabilities
                        .length ===
                      1
                        ? ""
                        : "s"
                    }{" "}
                    still require review.

                  </p>
                )}

                {canSubmitRole && (
                  <p className="mt-2 text-sm text-slate-600">
                    All currently identified
                    evidence has been resolved.
                    Submitting this role will run
                    a final evaluation for emerging
                    capability or evidence before
                    the role is completed.
                  </p>
                )}

                <button
                  type="button"
                  disabled={
                    !canSubmitRole ||
                    submittingRole
                  }
                  onClick={
                    submitCurrentRole
                  }
                  className="mt-4 rounded-lg bg-slate-900 px-6 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {
                    submittingRole
                      ? "Submitting role..."
                      : "Submit role"
                  }
                </button>

              </div>
            )}

          {/* ====================================================
              ROLE COMPLETE
          ==================================================== */}

          {(currentRole.lifecycleStatus ===
            "completed" ||
            currentRole.lifecycleStatus ===
              "submitted") && (
            <div className="mt-8 rounded-lg bg-green-50 p-5">

              <h3 className="text-lg font-semibold text-green-800">
                Role completed
              </h3>

              <p className="mt-2 text-green-700">
                This role has been reviewed and
                submitted successfully.
              </p>

            </div>
          )}

          {/* ====================================================
              JOURNEY COMPLETE
          ==================================================== */}

          {allRolesComplete && (
            <div className="mt-8 rounded-lg bg-green-100 p-6">

              <h2 className="text-2xl font-semibold text-green-900">
                Career history review complete
              </h2>

              <p className="mt-2 text-green-800">
                All identified roles have been
                reviewed, clarified where
                necessary, accepted and
                submitted.
              </p>

            </div>
          )}

        </div>
      )}

    </main>
  );
}