import test from "node:test";
import assert from "node:assert/strict";
import { hashCapabilityReviewContent } from "../../app/lib/career-intelligence/services/review-hash.ts";
import { isPromotionEligible } from "../../app/lib/career-intelligence/services/promotion-eligibility.ts";

const baseCapability = {
  demonstrated: true,
  capabilityStatus: "demonstrated",
  assessmentStatus: "assessed",
  reviewStatus: "accepted",
  revisionNo: 4,
  reviewedRevisionNo: 4,
  currentSupportingEvidenceCount: 1,
};

test("promotion requires an exact current review and current supporting evidence", () => {
  assert.equal(isPromotionEligible(baseCapability), true);
  assert.equal(isPromotionEligible({ ...baseCapability, reviewedRevisionNo: 3 }), false);
  assert.equal(isPromotionEligible({ ...baseCapability, currentSupportingEvidenceCount: 0 }), false);
  assert.equal(isPromotionEligible({ ...baseCapability, reviewStatus: "proposed" }), false);
  assert.equal(isPromotionEligible({ ...baseCapability, capabilityStatus: "gap" }), false);
  assert.equal(isPromotionEligible({ ...baseCapability, demonstrated: false }), false);
});

test("an edited capability is promotable only when its edited revision was reviewed", () => {
  assert.equal(isPromotionEligible({ ...baseCapability, reviewStatus: "edited" }), true);
  assert.equal(isPromotionEligible({ ...baseCapability, reviewStatus: "edited", reviewedRevisionNo: null }), false);
});

test("review content hash changes when the revision or supporting source IDs change", () => {
  const original = {
    canonicalCompetencyId: "canonical-1",
    proposedName: "Incident management",
    editedName: null,
    evidence: "I coordinated an incident response.",
    editedEvidence: null,
    demonstrated: true,
    capabilityStatus: "demonstrated",
    assessmentStatus: "assessed",
    revisionNo: 4,
    supportingEvidenceIds: ["evidence-a"],
  };
  const hash = hashCapabilityReviewContent(original);
  assert.equal(hashCapabilityReviewContent(original), hash);
  assert.notEqual(hashCapabilityReviewContent({ ...original, revisionNo: 5 }), hash);
  assert.notEqual(hashCapabilityReviewContent({ ...original, supportingEvidenceIds: ["evidence-b"] }), hash);
  assert.equal(
    hashCapabilityReviewContent({ ...original, supportingEvidenceIds: ["evidence-b", "evidence-a"] }),
    hashCapabilityReviewContent({ ...original, supportingEvidenceIds: ["evidence-a", "evidence-b"] }),
  );
});
