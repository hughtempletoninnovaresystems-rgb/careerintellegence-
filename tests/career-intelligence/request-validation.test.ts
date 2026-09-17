import assert from "node:assert/strict";
import test from "node:test";
import { analyseCvActionSchema, noCvActionSchema } from "../../app/lib/career-intelligence/http/request-schemas.ts";

const roleAssessmentId = "11111111-1111-4111-8111-111111111111";
const capabilityId = "22222222-2222-4222-8222-222222222222";

test("manual capability review accepts the UI reviewStatus contract", () => {
  const parsed = noCvActionSchema.safeParse({
    action: "review_capability",
    roleAssessmentId,
    capabilityId,
    reviewStatus: "accepted",
  });

  assert.equal(parsed.success, true);
});

test("manual capability review rejects an invalid review status", () => {
  const parsed = noCvActionSchema.safeParse({
    action: "review_capability",
    roleAssessmentId,
    capabilityId,
    reviewStatus: "approve_without_review",
  });

  assert.equal(parsed.success, false);
});

test("CV role assessment requires at least one non-empty answer", () => {
  const parsed = analyseCvActionSchema.safeParse({
    action: "assess_role",
    roleAssessmentId,
    questions: [],
  });

  assert.equal(parsed.success, false);
});

test("manual start accepts the current cvupload role contract", () => {
  const parsed = noCvActionSchema.safeParse({
    action: "start_manual",
    candidateName: "Synthetic Candidate",
    processingOrder: "latest_first",
    roles: [
      {
        organisation: "Example Engineering Ltd",
        roleTitle: "Service Engineer",
        description: "Maintained and repaired customer equipment.",
        fromDate: "2024-01-01",
        toDate: null,
        fromDatePrecision: "day",
        toDatePrecision: "ongoing",
        fromDateOriginal: "2024-01-01",
        toDateOriginal: "Present",
        engagementType: "Employee",
        employmentType: "Permanent",
      },
    ],
  });

  assert.equal(parsed.success, true);
});

test("manual start rejects a role without the required evidence context", () => {
  const parsed = noCvActionSchema.safeParse({
    action: "start_manual",
    roles: [
      {
        organisation: "Example Engineering Ltd",
        roleTitle: "Service Engineer",
        description: "",
      },
    ],
  });

  assert.equal(parsed.success, false);
});

test("CV role update accepts the current cvupload context payload", () => {
  const parsed = analyseCvActionSchema.safeParse({
    action: "update_role_context",
    roleAssessmentId,
    organisationName: "Example Engineering Ltd",
    roleTitle: "Service Engineer",
    roleDescription: "Maintained and repaired customer equipment.",
    fromDate: "2024-01-01",
    toDate: null,
    fromDatePrecision: "day",
    toDatePrecision: "ongoing",
    fromDateOriginal: "2024-01-01",
    toDateOriginal: "Present",
    engagementModel: "Employee",
    employmentContext: "Permanent",
  });

  assert.equal(parsed.success, true);
});
