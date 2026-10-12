import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getExperience } from '@/app/lib/career-intelligence/data/experience';
import { getRoleKnowledge } from '@/app/lib/career-intelligence/data/knowledge';
import { getRoleCapabilities } from '@/app/lib/career-intelligence/data/capabilities';
import { getRoleEvidence } from '@/app/lib/career-intelligence/data/evidence';
import { experienceDateRange, needsEvidence } from '@/app/lib/career-intelligence/domain/career-display';

export const dynamic = 'force-dynamic';

type Props = { params: { id: string }; searchParams?: { tab?: string } };
const tabs = ['overview', 'capabilities', 'knowledge', 'evidence'] as const;
type Tab = typeof tabs[number];

export default async function ExperienceDetailPage({ params, searchParams }: Props) {
  let role;
  let capabilities;
  let knowledge;
  let evidence;
  try {
    role = await getExperience(params.id);
    if (!role) notFound();
    [capabilities, knowledge, evidence] = await Promise.all([
      getRoleCapabilities(params.id), getRoleKnowledge(params.id), getRoleEvidence(params.id),
    ]);
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) throw error;
    console.error('Unable to load experience detail:', error);
    return <main className="mx-auto max-w-7xl"><Link href="/dashboard/experience" className="text-sm font-semibold text-violet-700">← Experience</Link><p role="alert" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">Unable to load the role workspace. Please refresh or return to Experience.</p></main>;
  }
  if (!role) notFound();
  const tab: Tab = tabs.includes(searchParams?.tab as Tab) ? searchParams!.tab as Tab : 'overview';
  const confirmedCount = capabilities.filter((item) => item.review_status === 'accepted' || item.review_status === 'edited').length;
  const attentionCount = capabilities.filter(needsEvidence).length;
  const roleTitle = role.proposed_role_title || 'Role title not recorded';
  const base = `/dashboard/experience/${encodeURIComponent(role.id)}`;

  return <main className="mx-auto max-w-7xl space-y-6 pb-10">
    <Link href="/dashboard/experience" className="inline-flex text-sm font-semibold text-violet-700 hover:text-violet-900">← Experience</Link>
    <header className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4 bg-gradient-to-r from-violet-50 to-white p-6 sm:p-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-700">Role workspace</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">{roleTitle}</h1>
          <p className="mt-2 text-sm text-slate-600">{role.organisation_name || 'Organisation not recorded'} · {experienceDateRange(role)}</p>
        </div>
        {role.to_date_precision === 'ongoing' && <span className="rounded-full bg-violet-100 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-violet-800">Current</span>}
      </div>
      <nav className="flex gap-1 overflow-x-auto border-t border-slate-100 px-4 sm:px-6" aria-label="Role workspace sections">
        {tabs.map((item) => <Link key={item} href={item === 'overview' ? base : `${base}?tab=${item}`} aria-current={tab === item ? 'page' : undefined} className={`whitespace-nowrap border-b-2 px-4 py-4 text-sm font-semibold capitalize transition ${tab === item ? 'border-violet-700 text-violet-800' : 'border-transparent text-slate-500 hover:border-violet-200 hover:text-violet-700'}`}>{item}</Link>)}
      </nav>
    </header>

    {tab === 'overview' && <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
        <h2 className="text-sm font-bold uppercase tracking-[0.13em] text-violet-800">Role context</h2>
        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="whitespace-pre-line text-sm leading-7 text-slate-700">{role.role_description?.trim() || 'No role description has been recorded yet.'}</p>
          <p className="mt-4 text-xs text-slate-500">Assessment status: {(role.lifecycle_status || 'Not recorded').replaceAll('_', ' ')}</p>
        </div>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
        <h2 className="text-sm font-bold uppercase tracking-[0.13em] text-violet-800">Profile development</h2>
        <div className="mt-4 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-3">
          <div><p className="text-3xl font-semibold text-slate-950">{role.capability_count}</p><p className="mt-1 text-sm text-slate-600">Capabilities identified</p></div>
          <div><p className="text-3xl font-semibold text-emerald-700">{confirmedCount}</p><p className="mt-1 text-sm text-slate-600">Confirmed</p></div>
          <div><p className="text-3xl font-semibold text-amber-700">{attentionCount}</p><p className="mt-1 text-sm text-slate-600">Need attention</p></div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Link href={`${base}?tab=knowledge`} className="rounded-xl border border-violet-100 bg-violet-50 px-5 py-4 text-sm font-semibold text-violet-800 hover:bg-violet-100">{knowledge.length} knowledge areas <span className="float-right" aria-hidden="true">→</span></Link>
          <Link href={`${base}?tab=evidence`} className="rounded-xl border border-violet-100 bg-violet-50 px-5 py-4 text-sm font-semibold text-violet-800 hover:bg-violet-100">{evidence.length} linked evidence records <span className="float-right" aria-hidden="true">→</span></Link>
        </div>
      </section>
      {attentionCount > 0 && <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">{attentionCount} capabilities need further evidence. Open the Capabilities tab to review them. To continue an in-progress assessment, use the existing assessment flow on the <Link className="font-semibold underline" href="/dashboard">dashboard</Link>.</p>}
    </div>}

    {tab === 'capabilities' && <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
      <h2 className="text-lg font-semibold text-slate-950">Capabilities in this role</h2>
      {capabilities.length ? <ul className="mt-4 divide-y divide-slate-100">{capabilities.map((item) => <li key={item.id} className="flex flex-wrap items-start justify-between gap-4 py-5"><div className="min-w-0 flex-1"><h3 className="font-semibold text-slate-900">{item.name}</h3>{item.evidence && <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm leading-6 text-slate-600">{item.evidence}</p>}<p className={`mt-2 text-xs font-semibold ${needsEvidence(item) ? 'text-amber-700' : 'text-emerald-700'}`}>{needsEvidence(item) ? 'Needs further evidence' : item.review_status === 'accepted' || item.review_status === 'edited' ? 'Confirmed' : 'Assessed' } · {item.evidence_count} evidence item(s)</p></div><Link href={`/dashboard/capabilities/${encodeURIComponent(item.id)}`} className="rounded-lg border border-violet-200 px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50">View details →</Link></li>)}</ul> : <p className="mt-4 text-sm text-slate-600">No capabilities have been identified for this role yet.</p>}
    </section>}

    {tab === 'knowledge' && <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
      <h2 className="text-lg font-semibold text-slate-950">Knowledge demonstrated in this role</h2>
      {knowledge.length ? <div className="mt-5 grid gap-4 sm:grid-cols-2">{knowledge.map((area) => <Link href={`/dashboard/knowledge/${encodeURIComponent(area.id)}`} key={area.id} className="rounded-xl border border-slate-200 p-5 transition hover:border-violet-300 hover:bg-violet-50"><h3 className="font-semibold text-slate-900">{area.name}</h3><p className="mt-2 text-sm text-slate-600">{area.capability_count} related capabilities · {area.evidence_count} linked evidence items across your profile</p><span className="mt-4 inline-block text-sm font-semibold text-violet-700">Explore →</span></Link>)}</div> : <p className="mt-4 text-sm text-slate-600">No saved knowledge or canonical competencies are linked to this role yet.</p>}
    </section>}

    {tab === 'evidence' && <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
      <h2 className="text-lg font-semibold text-slate-950">Supporting evidence</h2>
      {evidence.length ? <ul className="mt-4 divide-y divide-slate-100">{evidence.map((item, index) => <li key={`${item.id}-${index}`} className="py-4"><p className="whitespace-pre-line text-sm leading-7 text-slate-700">{item.evidence_text || 'Evidence text is not available.'}</p><p className="mt-2 text-xs capitalize text-slate-500">{(item.relationship_type || 'supporting').replaceAll('_', ' ')} · {(item.source_type || 'source not recorded').replaceAll('_', ' ')}</p><Link className="mt-2 inline-block text-sm font-semibold text-violet-700" href={`/dashboard/evidence/${encodeURIComponent(item.id)}`}>View evidence →</Link></li>)}</ul> : <p className="mt-4 text-sm text-slate-600">No evidence records are associated with this role yet.</p>}
    </section>}
  </main>;
}
