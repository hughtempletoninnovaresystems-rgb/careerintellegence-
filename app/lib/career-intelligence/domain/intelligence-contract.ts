/**
 * Stable, provider-neutral rules distilled from the Career Intelligence
 * Occupational Capability & Evidence Acquisition Intelligence Contract.
 *
 * They are kept outside provider adapters so the business rule survives a
 * future AI-provider replacement.
 */
export const CAPABILITY_IDENTITY_RULES = `
CAPABILITY IDENTITY RULES:

- Represent a capability as a distinct object only where the underlying ability can be assessed and recorded independently.
- Before returning a capability expression containing multiple constituent abilities, apply this counterfactual test:
  Could a credible person demonstrate one constituent ability strongly while legitimately having materially weaker or no evidence for another?
- If yes, split the expression into independently assessable capability identities unless the separation would only create techniques, methods, tools, technologies, procedural steps, contextual variants, seniority levels or manifestations of the same underlying ability.
- Treat technologies, tools, techniques, methods, operating contexts and seniority/responsibility context as evidence or attributes of the underlying capability unless they require a materially different underlying ability.
- Do not let evidence for one capability establish another merely because the abilities are commonly performed together.
- Qualifications, certification, job title and seniority can support context but do not by themselves define capability identity or prove personal application.
`;

export const EVIDENCE_ASSESSMENT_RULES = `
EVIDENCE RULES:

- Concrete personal application is required for sufficiently demonstrated capability evidence.
- Do not infer capability possession solely from role title, seniority, qualification, certification, technology exposure or a capability label.
- Do not infer absence of competence from insufficient evidence.
- Preserve the role and responsibility context of evidence; supervision, delegation, autonomy and oversight are application context rather than automatically different capability identities.
- Historical evidence must not be overwritten by evidence from a later role.
- Where a plausible signal exists but evidence is insufficient, request clarification rather than inventing evidence.
`;

export const CANDIDATE_OWNED_EVIDENCE_RULES = `
CANDIDATE-OWNED EVIDENCE RULES:

- Where evidence is presented to the candidate or persisted as candidate-owned Career/Knowledge Profile evidence, write it in first-person candidate voice.
- Do not introduce "the candidate", "they", "he" or "she" unless reproducing an attributable third-party source.
- Improve clarity and structure only; do not alter ownership, scope, certainty, strength or substantive meaning.
- Never invent evidence.
`;
