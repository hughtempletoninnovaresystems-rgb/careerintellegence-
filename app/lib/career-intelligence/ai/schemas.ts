import { z } from "zod";

const capabilityName = z.string().trim().min(1).max(500);
const evidenceText = z.string().max(20_000);
const questionText = z.string().trim().min(1).max(5_000);
const reasonText = z.string().max(5_000);

export const extractedCapabilitySchema = z.object({
  name: capabilityName,
  evidence: evidenceText.default(""),
  confidence: z.coerce.number().min(0).max(1),
});

export const gapSchema = z.object({
  competency: capabilityName,
  reason: reasonText.default("Additional evidence is required."),
  question: questionText,
});

export const gapListSchema = z.object({
  gaps: z.array(gapSchema).max(50).default([]),
});

export const evaluationSchema = z.object({
  questionId: z.coerce.string().max(100),
  competency: z.coerce.string().trim().min(1).max(500),
  status: z.enum(["demonstrated", "gap", "needs_clarification"]),
  evidence: evidenceText.default(""),
  confidence: z.coerce.number().min(0).max(1),
  followUpQuestion: z.string().max(5_000).optional().default(""),
  followUpReason: z.string().max(5_000).optional().default(""),
  emergingCapabilities: z.array(extractedCapabilitySchema).max(50).optional().default([]),
});

export const evaluationListSchema = z.object({
  evaluations: z.array(evaluationSchema).max(100).default([]),
});

export const finalSubmissionCheckSchema = z.object({
  emergingCapabilities: z.array(extractedCapabilitySchema).max(50).default([]),
  clarifications: z.array(gapSchema).max(50).default([]),
});

export const manualRoleAnalysisSchema = z.object({
  capabilities: z.array(extractedCapabilitySchema).max(100).default([]),
  gaps: z.array(gapSchema).max(50).default([]),
});

const extractedRoleSchema = z.object({
  organisationName: z.string().max(500).optional().default(""),
  roleTitle: z.string().trim().min(1).max(500),
  fromDate: z.string().max(50).optional().default(""),
  toDate: z.string().max(50).optional().default(""),
  fromDateOriginal: z.string().max(100).optional().default(""),
  toDateOriginal: z.string().max(100).optional().default(""),
  roleDescription: z.string().max(20_000).optional().default(""),
  engagementModel: z.string().max(500).optional().default(""),
  employmentContext: z.string().max(500).optional().default(""),
  capabilities: z.array(extractedCapabilitySchema).max(100).optional().default([]),
});

export const cvExtractionSchema = z.object({
  candidateName: z.string().max(500).optional().default(""),
  roles: z.array(extractedRoleSchema).max(100).default([]),
});
