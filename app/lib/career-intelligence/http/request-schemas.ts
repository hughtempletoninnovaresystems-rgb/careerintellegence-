import { z } from "zod";

const roleAssessmentId = z.string().uuid();
const capabilityId = z.string().uuid();
const shortText = z.string().trim().max(500);
const dateText = z.string().trim().max(50);
const evidenceText = z.string().max(20_000);
const datePrecision = z.enum(["day", "month", "year", "ongoing", "unknown"]);

const clarificationAnswer = z.object({
  gapId: z.string().uuid().optional(),
  questionId: z.string().uuid().optional(),
  competency: shortText.optional(),
  reason: z.string().max(5_000).optional(),
  question: z.string().max(5_000).optional(),
  answer: z.string().trim().min(1).max(20_000),
});

const cvRoleContextFields = {
  fromDate: dateText.nullable().optional(),
  toDate: dateText.nullable().optional(),
  fromDatePrecision: datePrecision.nullable().optional(),
  toDatePrecision: datePrecision.nullable().optional(),
  fromDateOriginal: dateText.nullable().optional(),
  toDateOriginal: dateText.nullable().optional(),
  engagementModel: shortText.nullable().optional(),
  employmentContext: shortText.nullable().optional(),
};

export const analyseCvActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("assess_role"),
    roleAssessmentId,
    questions: z.array(clarificationAnswer).min(1).max(50),
  }).passthrough(),
  z.object({
    action: z.literal("review_capability"),
    roleAssessmentId,
    capabilityId,
    reviewStatus: z.enum(["accepted", "edited", "rejected"]),
    competencyName: shortText.min(1).optional(),
    evidence: evidenceText.optional(),
  }).passthrough(),
  z.object({
    action: z.literal("update_role_context"),
    roleAssessmentId,
    organisationName: shortText.min(1),
    roleTitle: shortText.min(1),
    roleDescription: z.string().trim().min(1).max(20_000),
    ...cvRoleContextFields,
  }).passthrough(),
  z.object({
    action: z.literal("submit_role"),
    roleAssessmentId,
  }).passthrough(),
]);

const manualRoleSchema = z.object({
  organisation: shortText.min(1),
  roleTitle: shortText.min(1),
  description: z.string().trim().min(1).max(20_000),
  fromDate: dateText.nullable().optional(),
  toDate: dateText.nullable().optional(),
  fromDatePrecision: datePrecision.nullable().optional(),
  toDatePrecision: datePrecision.nullable().optional(),
  fromDateOriginal: dateText.nullable().optional(),
  toDateOriginal: dateText.nullable().optional(),
  engagementType: shortText.nullable().optional(),
  employmentType: shortText.nullable().optional(),
});

export const noCvActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("start_manual"),
    candidateName: shortText.optional(),
    processingOrder: z.enum(["latest_first", "earliest_first"]).optional(),
    roles: z.array(manualRoleSchema).min(1).max(50),
  }).passthrough(),
  z.object({
    action: z.literal("assess_role"),
    roleAssessmentId,
    answers: z.array(clarificationAnswer).min(1).max(50),
  }).passthrough(),
  z.object({
    action: z.literal("review_capability"),
    roleAssessmentId,
    capabilityId,
    reviewStatus: z.enum(["accepted", "edited", "rejected"]),
    competencyName: shortText.min(1).optional(),
    name: shortText.min(1).optional(),
    evidence: evidenceText.optional(),
  }).passthrough(),
  z.object({
    action: z.literal("update_role_context"),
    roleAssessmentId,
    organisation: shortText.min(1),
    roleTitle: shortText.min(1),
    description: z.string().trim().min(1).max(20_000),
    fromDate: dateText.nullable().optional(),
    toDate: dateText.nullable().optional(),
    fromDatePrecision: datePrecision.nullable().optional(),
    toDatePrecision: datePrecision.nullable().optional(),
    fromDateOriginal: dateText.nullable().optional(),
    toDateOriginal: dateText.nullable().optional(),
    engagementType: shortText.nullable().optional(),
    employmentType: shortText.nullable().optional(),
  }).passthrough(),
  z.object({
    action: z.literal("submit_role"),
    roleAssessmentId,
  }).passthrough(),
]);
