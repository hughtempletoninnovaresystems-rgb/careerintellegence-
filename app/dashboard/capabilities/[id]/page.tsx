import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sql } from '@vercel/postgres';
import { getAuthenticatedUserId } from '@/app/lib/career-intelligence/auth';

export const dynamic = 'force-dynamic';

type Props = { params: { id: string } };
type RoleRow = { id: string; proposed_role_title: string | null; organisation_name: string | null; from_date: string | null; to_date: string | null; to_date_precision: string | null };
type EvidenceRow = { evidence_id: string; evidence_text: string | null; relationship_type: string | null; source_type: string | null };

function dateLabel(value: string | null, precision: string | null) {
  if (precision === 'ongoing' || !value) return precision === 'ongoing' ? 'Present' : 'Date not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

export default async function CapabilityDetailPage({ params }: Props) {
  const { id } = params;
  let capability: any = null;
  let roles: RoleRow[] = [];
  let evidence: EvidenceRow[] = [];
  let knowledge: string[] = [];
  try {
    const userId = await getAuthenticatedUserId();
    const result = await sql`
      SELECT crc.*, COALESCE(NULLIF(crc.edited_competency_name, ''), NULLIF(c.name, ''), NULLIF(crc.proposed_competency_name, '')) AS display_name,
             c.name AS canonical_name
      FROM career_role_capabilities crc
      JOIN career_role_assessments cra ON cra.id = crc.role_assessment_id
      JOIN career_assessments ca ON ca.id = cra.assessment_id
      LEFT JOIN competencies c ON c.id = crc.canonical_competency_id
      WHERE crc.id::text = ${id} AND ca.user_id = ${userId}
      LIMIT 1
    `;
    capability = result.rows[0] || null;
    if (!capability) notFound();
    const roleResult = await sql`
      SELECT cra.id::text AS id, cra.proposed_role_title, cra.organisation_name,
             cra.from_date::text AS from_date, cra.to_date::text AS to_date, cra.to_date_precision
      FROM career_role_assessments cra
      JOIN career_assessments ca ON ca.id = cra.assessment_id
      JOIN career_role_capabilities crc ON crc.role_assessment_id = cra.id
      WHERE crc.id::text = ${id} AND ca.user_id = ${userId}
      ORDER BY cra.sequence_no DESC, cra.created_at DESC
    `;
    roles = roleResult.rows as RoleRow[];
    const evidenceResult = await sql`
      SELECT cel.evidence_id::text AS evidence_id, ce.evidence_text, cel.relationship_type, ce.source_type
      FROM career_capability_evidence_links cel
      JOIN career_role_capabilities crc ON crc.id = cel.role_capability_id
      JOIN career_role_assessments cra ON cra.id = crc.role_assessment_id
      JOIN career_assessments ca ON ca.id = cra.assessment_id
      LEFT JOIN career_capability_evidence ce ON ce.id = cel.evidence_id
      WHERE crc.id::text = ${id} AND ca.user_id = ${userId} AND cel.is_current = TRUE
      ORDER BY cel.relationship_type, cel.evidence_id
    `;
    evidence = evidenceResult.rows as EvidenceRow[];
    if (capability.canonical_competency_id) {
      const knowledgeResult = await sql`SELECT name FROM competencies WHERE id = ${capability.canonical_competency_id}`;
      knowledge = knowledgeResult.rows.map((row: any) => String(row.name));
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) throw error;
    console.error('Unable to load capability detail:', error);
    if (!capability) notFound();
  }

  const confirmed = capability.review_status === 'accepted' || capability.review_status === 'edited';
  const demonstrated = capability.demonstrated === true && capability.assessment_status === 'assessed';
  const status = confirmed ? 'Confirmed' : demonstrated ? 'Demonstrated' : 'Awaiting review';
  const score = Math.max(0, Math.min(100, Math.round(Number(capability.ai_confidence || 0) * 100)));
  const overview = String(capability.edited_evidence || capability.evidence || '').trim() || 'This capability has been identified in your career history. Add or review specific examples and outcomes to strengthen the evidence supporting it.';

  return <main className="mx-auto max-w-7xl space-y-5 pb-10">
    <Link href="/dashboard/capabilities" className="inline-flex items-center gap-2 text-sm font-semibold text-violet-700 hover:text-violet-900">← Capabilities</Link>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4 bg-gradient-to-r from-violet-50 to-white p-6 sm:p-8">
        <div className="flex items-start gap-4"><div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-violet-700 text-2xl text-white" aria-hidden="true">✦</div><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-700">Capability detail</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">{capability.display_name || 'Unnamed capability'}</h1></div></div>
        <span className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-bold uppercase tracking-wide ${confirmed ? 'bg-emerald-100 text-emerald-800' : demonstrated ? 'bg-violet-100 text-violet-800' : 'bg-amber-100 text-amber-800'}`}><span className="h-2 w-2 rounded-full bg-current" />{status}</span>
      </div>
      <div className="p-6 sm:p-8"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold text-slate-800">Evidence strength</h2><span className="text-sm font-bold uppercase tracking-wide text-violet-700">{evidence.length ? (score >= 70 ? 'Strong' : score >= 40 ? 'Developing' : 'Early') : 'Not yet linked'}</span></div><div className="mt-3 flex gap-1" role="progressbar" aria-label="Evidence strength" aria-valuemin={0} aria-valuemax={100} aria-valuenow={evidence.length ? score : 0}>{Array.from({ length: 20 }, (_, index) => <span key={index} className={`h-3 flex-1 rounded-sm ${evidence.length && index < Math.round(score / 5) ? 'bg-violet-600' : 'bg-violet-100'}`} />)}</div><p className="mt-2 text-xs text-slate-500">Based on recorded assessment confidence and current linked evidence.</p></div>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7"><h2 className="flex items-center gap-3 text-sm font-bold uppercase tracking-[0.12em] text-violet-800"><span aria-hidden="true">▤</span> Overview</h2><p className="mt-5 whitespace-pre-line text-sm leading-7 text-slate-600">{overview}</p></section>

    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7"><h2 className="flex items-center gap-3 text-sm font-bold uppercase tracking-[0.12em] text-violet-800"><span aria-hidden="true">▣</span> Demonstrated in</h2>{roles.length ? <ul className="mt-4 divide-y divide-slate-100">{roles.map((role) => <li key={role.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><h3 className="font-semibold text-slate-900">{role.proposed_role_title || 'Role title not recorded'}</h3><p className="mt-1 text-sm text-slate-500">{role.organisation_name || 'Organisation not recorded'} · {dateLabel(role.from_date, null)} – {dateLabel(role.to_date, role.to_date_precision)}</p></div><Link href={`/dashboard/experience`} className="inline-flex rounded-lg border border-violet-200 px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50">View</Link></li>)}</ul> : <p className="mt-4 text-sm text-slate-600">No linked role details are available yet.</p>}</section>

    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7"><h2 className="flex items-center gap-3 text-sm font-bold uppercase tracking-[0.12em] text-violet-800"><span aria-hidden="true">▤</span> Supporting evidence</h2>{evidence.length ? <ul className="mt-4 divide-y divide-slate-100">{evidence.map((item) => <li key={item.evidence_id} className="flex items-start gap-3 py-4"><span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-violet-600"/><div className="min-w-0 flex-1"><p className="text-sm leading-6 text-slate-700">{item.evidence_text || 'Evidence item linked; text is not available in this view.'}</p><p className="mt-1 text-xs capitalize text-slate-400">{(item.relationship_type || 'supporting').replaceAll('_', ' ')}{item.source_type ? ` · ${item.source_type.replaceAll('_', ' ')}` : ''}</p></div><Link href="/dashboard/evidence" className="shrink-0 rounded-lg border border-violet-200 px-3 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50">View</Link></li>)}</ul> : <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">No current evidence items are linked directly to this capability. Review the original role assessment or add a specific example to strengthen it.</div>}</section>

    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7"><h2 className="flex items-center gap-3 text-sm font-bold uppercase tracking-[0.12em] text-violet-800"><span aria-hidden="true">▱</span> Related knowledge</h2><div className="mt-4 flex flex-wrap gap-2">{knowledge.length ? knowledge.map((item) => <span key={item} className="rounded-full bg-violet-50 px-4 py-2 text-sm font-medium text-violet-800">{item}</span>) : <p className="text-sm text-slate-500">Related knowledge areas will appear here when linked to this capability.</p>}</div></section>
  </main>;
}
