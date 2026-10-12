import Link from 'next/link';
import { sql } from '@vercel/postgres';
import { auth } from '@/auth';
import { getAuthenticatedUserId } from '@/app/lib/career-intelligence/auth';

export const dynamic = 'force-dynamic';

type CapabilityRow = {
  id: string;
  name: string | null;
  demonstrated: boolean | null;
  capability_status: string | null;
  assessment_status: string | null;
  review_status: string | null;
  evidence_strength: number | null;
  role_count: number | string;
  evidence_count: number | string;
  roles: string | null;
};

function statusLabel(row: CapabilityRow) {
  if (row.review_status === 'accepted' || row.review_status === 'edited') return 'Confirmed';
  if (row.demonstrated === true && row.assessment_status === 'assessed') return 'Demonstrated';
  if (row.capability_status === 'needs_clarification' || row.assessment_status === 'needs_clarification' || row.demonstrated == null) return 'Needs evidence';
  return 'Awaiting review';
}

export default async function CapabilitiesPage() {
  const session = await auth();
  let capabilities: CapabilityRow[] = [];
  let loadError = false;
  try {
    const userId = await getAuthenticatedUserId();
    const result = await sql`
      SELECT
        crc.id::text AS id,
        COALESCE(NULLIF(crc.edited_competency_name, ''), NULLIF(c.name, ''), NULLIF(crc.proposed_competency_name, '')) AS name,
        crc.demonstrated,
        crc.capability_status,
        crc.assessment_status,
        crc.review_status,
        crc.ai_confidence AS evidence_strength,
        COUNT(DISTINCT cra.id)::int AS role_count,
        COUNT(DISTINCT cel.evidence_id) FILTER (WHERE cel.is_current = TRUE)::int AS evidence_count,
        STRING_AGG(DISTINCT CONCAT(COALESCE(cra.proposed_role_title, 'Role not recorded'), ' — ', COALESCE(cra.organisation_name, 'Organisation not recorded')), '||') AS roles
      FROM career_role_capabilities crc
      JOIN career_role_assessments cra ON cra.id = crc.role_assessment_id
      JOIN career_assessments ca ON ca.id = cra.assessment_id
      LEFT JOIN competencies c ON c.id = crc.canonical_competency_id
      LEFT JOIN career_capability_evidence_links cel ON cel.role_capability_id = crc.id
      WHERE ca.user_id = ${userId}
      GROUP BY crc.id, c.name
      ORDER BY CASE WHEN crc.review_status IN ('accepted', 'edited') THEN 0 WHEN crc.demonstrated = TRUE THEN 1 ELSE 2 END,
               COALESCE(NULLIF(crc.edited_competency_name, ''), NULLIF(c.name, ''), NULLIF(crc.proposed_competency_name, '')) ASC
    `;
    capabilities = result.rows as CapabilityRow[];
  } catch (error) {
    console.error('Unable to load capabilities:', error);
    loadError = true;
  }

  const confirmed = capabilities.filter((item) => item.review_status === 'accepted' || item.review_status === 'edited').length;
  const needsEvidence = capabilities.filter((item) => item.demonstrated == null || item.capability_status === 'needs_clarification' || item.assessment_status === 'needs_clarification').length;

  return (
    <main className="mx-auto max-w-7xl space-y-7 pb-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/dashboard/profile" className="text-sm font-semibold text-violet-700 hover:text-violet-900">← Career Profile</Link>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">My career</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Capabilities</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Explore your capabilities, the roles where you have demonstrated them, and the evidence supporting each one.</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-3 shadow-sm"><p className="text-sm text-slate-500">Your capabilities</p><p className="mt-1 text-2xl font-semibold text-slate-950">{capabilities.length}</p></div>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Confirmed</p><p className="mt-2 text-3xl font-semibold text-emerald-700">{confirmed}</p><p className="mt-1 text-xs text-slate-500">Reviewed and accepted</p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Need further evidence</p><p className="mt-2 text-3xl font-semibold text-amber-700">{needsEvidence}</p><p className="mt-1 text-xs text-slate-500">Strengthen with specific examples</p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Evidence-linked</p><p className="mt-2 text-3xl font-semibold text-violet-700">{capabilities.filter((item) => Number(item.evidence_count) > 0).length}</p><p className="mt-1 text-xs text-slate-500">Capabilities with current evidence</p></div>
      </section>

      {loadError ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">We could not load your capabilities. Please check that the Career Intelligence database migrations have been applied, then refresh this page.</div> : capabilities.length ? (
        <section className="space-y-3">
          {capabilities.map((item) => {
            const confirmedItem = item.review_status === 'accepted' || item.review_status === 'edited';
            const strength = Math.max(0, Math.min(100, Math.round(Number(item.evidence_strength || 0) * 100)));
            return <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-violet-200 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-semibold text-slate-950">{item.name || 'Unnamed capability'}</h2>
                  <p className="mt-2 text-sm text-slate-600">{item.roles?.split('||').slice(0, 2).join(' · ') || 'No role details recorded yet'}</p>
                </div>
                <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide ${confirmedItem ? 'bg-emerald-50 text-emerald-700' : item.demonstrated === true ? 'bg-violet-50 text-violet-700' : 'bg-amber-50 text-amber-800'}`}><span className="h-2 w-2 rounded-full bg-current" />{statusLabel(item)}</span>
              </div>
              <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
                <div><div className="flex items-center justify-between gap-3 text-sm"><span className="font-medium text-slate-600">Evidence strength</span><span className="font-semibold text-slate-800">{Number(item.evidence_count) > 0 ? `${item.evidence_count} evidence item${Number(item.evidence_count) === 1 ? '' : 's'}` : 'Evidence not linked'}</span></div><div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-violet-600" style={{ width: `${Number(item.evidence_count) > 0 ? Math.max(15, strength) : 0}%` }} /></div><p className="mt-2 text-xs text-slate-500">Demonstrated in {item.role_count} role{Number(item.role_count) === 1 ? '' : 's'}</p></div>
                <Link href={`/dashboard/capabilities/${encodeURIComponent(item.id)}`} className="inline-flex items-center justify-center rounded-lg border border-violet-200 px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50">View details <span className="ml-2" aria-hidden="true">→</span></Link>
              </div>
            </article>;
          })}
        </section>
      ) : <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center"><h2 className="text-lg font-semibold text-slate-950">Your capabilities will appear here</h2><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">Analyse your CV or add career experience to identify capabilities and connect them to supporting evidence.</p><Link href="/dashboard" className="mt-5 inline-flex rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800">Go to dashboard</Link></div>}
    </main>
  );
}
