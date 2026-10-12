/**
 * Formatting and display-only categorisation shared by the Experience and
 * Knowledge pages. Intentionally contains no SQL or server-only imports.
 */
export function displayDate(value: string | null, precision?: string | null) {
  if (precision === 'ongoing') return 'Present';
  if (!value) return 'Date not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

export function experienceDateRange(role: {
  from_date: string | null;
  to_date: string | null;
  to_date_precision: string | null;
}) {
  return `${displayDate(role.from_date)} – ${displayDate(role.to_date, role.to_date_precision)}`;
}

export function needsEvidence(item: {
  demonstrated: boolean | null;
  capability_status: string | null;
  assessment_status: string | null;
}) {
  return item.demonstrated == null || item.capability_status === 'needs_clarification' || item.assessment_status === 'needs_clarification';
}

// Domains are suggested display groupings based on competency names,
// not values from a persisted knowledge taxonomy.
export function knowledgeDomain(name: string): string {
  if (/change|transformation|organisation|organiz|operating model|culture|adoption/i.test(name)) return 'Transformation & Change';
  if (/programme|program |project|delivery|risk|governance|benefit|portfolio|assurance|planning/i.test(name)) return 'Programme & Delivery';
  if (/leadership|stakeholder|people|team|communication|coaching|talent|management/i.test(name)) return 'Leadership & People';
  if (/technolog|digital|data|system|technical|method|tool|architecture|engineering/i.test(name)) return 'Technology & Methods';
  return 'Other knowledge';
}
