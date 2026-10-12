import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getEvidenceRecord } from '@/app/lib/career-intelligence/data/evidence';

export const dynamic = 'force-dynamic';

type Props = { params: { id: string } };

function display(value: unknown): string {
  if (typeof value === 'string') return value.replaceAll('_', ' ');
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return 'Not recorded';
}

export default async function EvidenceDetailPage({ params }: Props) {
  let record;
  try {
    record = await getEvidenceRecord(params.id);
  } catch (error) {
    console.error('Unable to load evidence detail:', error);
    return <main className="mx-auto max-w-7xl pb-10"><Link href="/dashboard/evidence" className="text-sm font-semibold text-violet-700">← Evidence</Link><p role="alert" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">Unable to load this evidence record. Please refresh or return to Evidence.</p></main>;
  }
  if (!record) notFound();
  const provenance = record.provenance || {};
  const assessmentFields: [string, unknown][] = [
    ['Evidence quality', provenance.evidence_quality ?? provenance.quality],
    ['Context', provenance.context_assessment ?? provenance.context],
    ['Action demonstrated', provenance.action_demonstrated ?? provenance.action_assessment],
    ['Outcome demonstrated', provenance.outcome_demonstrated ?? provenance.outcome_assessment],
  ];
  const currentCapabilities = record.capabilities.filter((item) => item.is_current);
  const associatedRoleIds = new Set([record.experience_id, ...record.capabilities.map((item) => item.role_id)].filter(Boolean));
  return <main className="mx-auto max-w-5xl space-y-6 pb-10">
    <Link href="/dashboard/evidence" className="inline-flex text-sm font-semibold text-violet-700 hover:text-violet-900">← Evidence</Link>
    <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-700">Evidence record · {record.source_family}</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-950">Evidence</h1>
      <blockquote className="mt-6 whitespace-pre-line border-l-4 border-violet-200 pl-5 text-base leading-8 text-slate-800">{record.evidence_text}</blockquote>
      <p className="mt-4 text-xs text-slate-500">Recorded {record.created_at ? new Date(record.created_at).toLocaleDateString('en-GB') : 'date unavailable'}</p>
    </header>

    <section className="grid gap-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:grid-cols-2 sm:p-7">
      <div><h2 className="text-xs font-bold uppercase tracking-[0.13em] text-violet-800">Source</h2><p className="mt-3 text-sm text-slate-800">{display(record.source_type)}</p>{record.source_section && <p className="mt-2 text-sm text-slate-500">Section: {record.source_section}</p>}</div>
      <div><h2 className="text-xs font-bold uppercase tracking-[0.13em] text-violet-800">Experience</h2><p className="mt-3 text-sm text-slate-800">{record.experience_label}</p>{record.experience_id && <Link href={`/dashboard/experience/${encodeURIComponent(record.experience_id)}`} className="mt-2 inline-flex text-sm font-semibold text-violet-700">View experience →</Link>}</div>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
      <h2 className="text-xs font-bold uppercase tracking-[0.13em] text-violet-800">Supports</h2>
      <div className="mt-4 space-y-3">
        {record.capabilities.length > 0 && <div><h3 className="text-sm font-semibold text-slate-900">Capabilities</h3><ul className="mt-2 divide-y divide-slate-100">{record.capabilities.map((item, index) => <li key={`${item.id || item.name}-${index}`} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="text-sm text-slate-900">{item.name}</p><p className="mt-1 text-xs text-slate-500">{display(item.relationship_type || 'supporting')} · {item.is_current ? 'Current link' : 'Historical link'}{item.review_status ? ` · Capability review: ${display(item.review_status)}` : ''}</p>{item.evidence_state && <p className="mt-1 text-xs text-slate-500">Evidence state: {item.evidence_state}</p>}</div>{item.id && <Link href={`/dashboard/capabilities/${encodeURIComponent(item.id)}`} className="text-sm font-semibold text-violet-700">View capability →</Link>}</li>)}</ul></div>}
        {record.knowledge_areas.length > 0 && <div><h3 className="text-sm font-semibold text-slate-900">Knowledge areas</h3><ul className="mt-2 divide-y divide-slate-100">{record.knowledge_areas.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><p className="text-sm text-slate-900">{item.name}</p><Link href={`/dashboard/knowledge/${encodeURIComponent(item.id)}`} className="text-sm font-semibold text-violet-700">Explore →</Link></li>)}</ul></div>}
        {!record.capabilities.length && !record.knowledge_areas.length && <p className="text-sm text-slate-600">This evidence is retained in the audit trail, but no capability or knowledge link is recorded.</p>}
      </div>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
      <h2 className="text-xs font-bold uppercase tracking-[0.13em] text-violet-800">Assessment</h2>
      <p className="mt-3 text-xs leading-6 text-slate-500">Quality fields are shown only if they were recorded in the source provenance. A linked capability review does not mean the evidence has its own approval state.</p>
      <dl className="mt-5 grid gap-3 sm:grid-cols-2">{assessmentFields.map(([label, value]) => <div key={label} className="rounded-lg bg-slate-50 p-4"><dt className="text-sm text-slate-600">{label}</dt><dd className="mt-1 text-sm font-semibold text-slate-900">{display(value)}</dd></div>)}</dl>
      {record.evaluation_status && <p className="mt-4 text-sm text-slate-700">Source answer evaluation: <strong>{display(record.evaluation_status)}</strong>{record.evaluation_confidence !== null ? ` (${Math.round(record.evaluation_confidence * 100)}% confidence)` : ''}</p>}
      {record.confidence !== null && <p className="mt-3 text-sm text-slate-700">Recorded source confidence: <strong>{Math.round(record.confidence * 100)}%</strong></p>}
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
      <h2 className="text-xs font-bold uppercase tracking-[0.13em] text-violet-800">Profile connections</h2>
      <div className="mt-5 grid gap-4 sm:grid-cols-3"><div><p className="text-2xl font-semibold text-slate-950">{currentCapabilities.length}</p><p className="mt-1 text-sm text-slate-600">Current capabilities</p></div><div><p className="text-2xl font-semibold text-slate-950">{record.knowledge_areas.length}</p><p className="mt-1 text-sm text-slate-600">Knowledge areas</p></div><div><p className="text-2xl font-semibold text-slate-950">{associatedRoleIds.size || (record.experience_label ? 1 : 0)}</p><p className="mt-1 text-sm text-slate-600">Associated roles</p></div></div>
      {record.source_family === 'career' && <p className="mt-5 border-t border-slate-100 pt-4 text-xs text-slate-500">Source type and capability review information are retained as recorded. Current and historical links remain visible for audit purposes.</p>}
    </section>
  </main>;
}
