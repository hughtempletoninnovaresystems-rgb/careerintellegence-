/**
 * A capability is promotable only when the exact current revision has been
 * reviewed and at least one current supporting source link remains active.
 */
export function isPromotionEligible(capability: {
  demonstrated?: boolean | null;
  capabilityStatus?: string | null;
  assessmentStatus?: string | null;
  reviewStatus?: string | null;
  revisionNo?: number | string | null;
  reviewedRevisionNo?: number | string | null;
  currentSupportingEvidenceCount?: number | string | null;
}) {
  const revisionNo = Number(capability.revisionNo);
  const hasExactCurrentReview =
    Number.isInteger(revisionNo) &&
    revisionNo >= 1 &&
    Number(capability.reviewedRevisionNo) === revisionNo;
  const hasCurrentSupportingEvidence =
    Number(capability.currentSupportingEvidenceCount || 0) > 0;

  return (
    capability.demonstrated === true &&
    capability.capabilityStatus === "demonstrated" &&
    capability.assessmentStatus === "assessed" &&
    (capability.reviewStatus === "accepted" || capability.reviewStatus === "edited") &&
    hasExactCurrentReview &&
    hasCurrentSupportingEvidence
  );
}
