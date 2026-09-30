export type ReviewStatus =
  | "proposed"
  | "accepted"
  | "edited"
  | "rejected";

export type CapabilityStatus =
  | "signal"
  | "demonstrated"
  | "gap";

export type AssessmentStatus =
  | "proposed"
  | "needs_clarification"
  | "assessed";

export type DatePrecision =
  | "day"
  | "month"
  | "year"
  | "ongoing"
  | "unknown";

export type ExtractedCapability = {
  name: string;
  evidence: string;
  confidence: number;
};

export type Gap = {
  competency: string;
  reason: string;
  question: string;
};

export type Evaluation = {
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

export type SuccessGate = {
  id: string;
  assessmentId: string;
  roleAssessmentId?: string | null;
  scopeKey: string;
  gateKey: string;
  status: string;
  metadata: Record<string, unknown>;
  achievedAt: string;
};

/*
 * Intelligence Contract dimensions. These are deliberately independent of
 * workflow/review state so future assessment logic does not collapse distinct
 * concepts into career_role_capabilities.assessment_status/review_status.
 */
export type EvidenceState =
  | "E0"
  | "E1"
  | "E2"
  | "E3"
  | "not_applicable";

export type CapabilityApplicability =
  | "applicable"
  | "not_applicable"
  | "undetermined";

export type CurrentApplicationStatus =
  | "current"
  | "historical"
  | "not_established"
  | "not_applicable";

export type CapabilityCurrencyStatus =
  | "current"
  | "investigation_required"
  | "uncertain"
  | "not_assessed";

export type CapabilityIdentityDecision =
  | "accept_capability"
  | "split_composite"
  | "subsume_attribute"
  | "reject_candidate";

export type CapabilityAttributeType =
  | "technique"
  | "method"
  | "tool"
  | "technology"
  | "application_context"
  | "responsibility_context"
  | "specialism";