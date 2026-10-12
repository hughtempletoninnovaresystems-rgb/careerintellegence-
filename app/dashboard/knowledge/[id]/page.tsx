import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getExperience } from '@/app/lib/career-intelligence/data/experience';
import { getKnowledgeArea, getKnowledgeProfileCapabilities } from '@/app/lib/career-intelligence/data/knowledge';
import { getKnowledgeCapabilities } from '@/app/lib/career-intelligence/data/capabilities';
import { getKnowledgeEvidence } from '@/app/lib/career-intelligence/data/evidence';
import { experienceDateRange, knowledgeDomain } from '@/app/lib/career-intelligence/domain/career-display';

export const dynamic = 'force-dynamic';

type Props = { params: { id: string }; searchParams?: { evidence?: string } };

export default async function KnowledgeDetailPage({ params, searchParams }: Props) {
  let area;
  let capabilities;
  let evidence;
  let profileCapabilities;
  try {
    area = await getKnowledgeArea(params.id);
    if (!area) notFound();
    [capabilities, evidence, profileCapabilities] = await Promise.all([getKnowledgeCapabilities(params.id), getKnowledgeEvidence(params.id), getKnowledgeProfileCapabilities(params.id)]);
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) throw error;
    console.error('Unable to load knowledge detail:', error);
    return <main className="mx-auto max-w-7xl"><Link href="/dashboard/knowledge" className="text-sm font-semibold text-violet-700">← Knowledge</Link><p role="alert" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">Unable to load this knowledge area. Please refresh or return to Knowledge.</p></main>;
  }
  if (!area) notFound();

  // Experience IDs come from the user-scoped knowledge query. Each role read is
  // also user-scoped, so an arbitrary URL cannot expose someone else's roles.
  const roles = (await Promise.all(area.experience_ids.map((id) => getExperience(id)))).filter((role): role is NonNullable<typeof role> => Boolean(role));
  const allEvidence = searchParams?.evidence === 'all';
  const shownEvidence = allEvidence ? evidence : evidence.slice(0, 4);
  return <main className="mx-auto max-w-7xl space-y-6 pb-10">
    <Link href="/dashboard/knowledge" className="inline-flex text-sm font-semibold text-violet-700 hover:text-violet-900">← Knowledge</Link>
    <header className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="bg-gradient-to-r from-violet-50 to-white p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-700">{knowledgeDomain(area.name)} · Knowledge area</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">{area.name}</h1>
        <p className="mt-3 text-sm text-slate-600">{area.capability_count} related capabilities · {area.experience_count} roles · {area.evidence_count} evidence items</p>
        {area.knowledge_record_count > 0 && <p className="mt-3 inline-flex rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">Saved in candidate knowledge · {area.knowledge_record_count} role record{area.knowledge_record_count === 1 ? '' : 's'}{area.confidence !== null ? ` · highest recorded confidence ${Math.round(area.confidence * 100)}%` : ''}</p>}
      </div>
    </header>

    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
      <h2 className="text-sm font-bold uppercase tracking-[0.13em] text-violet-800">What your profile demonstrates</h2>
      <div className="mt-4 border-t border-slate-100 pt-4"><p className="whitespace-pre-line text-sm leading-7 text-slate-700">{area.description?.trim() || 'This area is recorded in your career knowledge or capability history. Explore the associated roles and supporting evidence below.'}</p></div>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
      <h2 className="text-sm font-bold uppercase tracking-[0.13em] text-violet-800">Related capabilities</h2>
      {capabilities.length ? <ul className="mt-4 divide-y divide-slate-100">{capabilities.map((item) => <li key={item.id} className="flex items-center justify-between gap-4 py-4"><div><p className="font-semibold text-slate-900">{item.name}</p><p className="mt-1 text-xs text-slate-500">{item.evidence_count} evidence item(s) for this capability</p></div><Link href={`/dashboard/capabilities/${encodeURIComponent(item.id)}`} className="shrink-0 text-sm font-semibold text-violet-700 hover:text-violet-900">View →</Link></li>)}</ul> : <p className="mt-4 text-sm text-slate-600">No linked assessment capabilities have been recorded.</p>}
      {profileCapabilities.length > 0 && <div className="mt-6 border-t border-slate-100 pt-5"><h3 className="text-sm font-semibold text-slate-900">Promoted profile capabilities</h3><ul className="mt-3 divide-y divide-slate-100">{profileCapabilities.map((item) => <li key={item.id} className="py-3"><p className="font-medium text-slate-900">{item.name}</p><p className="mt-1 text-xs text-slate-500">{item.role_title}{item.organisation_name ? ` — ${item.organisation_name}` : ''}</p></li>)}</ul></div>}
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
      <h2 className="text-sm font-bold uppercase tracking-[0.13em] text-violet-800">Demonstrated through</h2>
      {roles.length ? <ul className="mt-4 divide-y divide-slate-100">{roles.map((role) => <li key={role.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><p className="font-semibold text-slate-900">{role.proposed_role_title || 'Role title not recorded'}</p><p className="mt-1 text-sm text-slate-500">{role.organisation_name || 'Organisation not recorded'} · {experienceDateRange(role)}</p></div><Link href={`/dashboard/experience/${encodeURIComponent(role.id)}`} className="text-sm font-semibold text-violet-700 hover:text-violet-900">View role →</Link></li>)}</ul> : <p className="mt-4 text-sm text-slate-600">No assessment experience is linked to this knowledge area.</p>}
      {area.recorded_role_names.length > 0 && <div className="mt-5 border-t border-slate-100 pt-4"><h3 className="text-sm font-semibold text-slate-900">Roles recorded in candidate knowledge</h3><ul className="mt-3 list-inside list-disc space-y-2 text-sm text-slate-700">{area.recorded_role_names.map((name) => <li key={name}>{name}</li>)}</ul></div>}
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7" id="supporting-evidence">
      <div className="flex flex-wrap items-center justify-between gap-4"><h2 className="text-sm font-bold uppercase tracking-[0.13em] text-violet-800">Supporting evidence</h2><p className="text-xs text-slate-500">{evidence.length} linked item(s)</p></div>
      {shownEvidence.length ? <ul className="mt-4 divide-y divide-slate-100">{shownEvidence.map((item, index) => <li key={`${item.id}-${index}`} className="py-4"><p className="whitespace-pre-line text-sm leading-7 text-slate-700">{item.evidence_text || 'Evidence text is not available.'}</p><p className="mt-2 text-xs capitalize text-slate-500">{(item.relationship_type || 'supporting').replaceAll('_', ' ')} · {(item.source_type || 'source not recorded').replaceAll('_', ' ')}</p><Link className="mt-2 inline-block text-sm font-semibold text-violet-700 hover:text-violet-900" href={`/dashboard/evidence/${encodeURIComponent(item.id)}`}>View evidence →</Link></li>)}</ul> : <p className="mt-4 text-sm text-slate-600">No current evidence items have been linked to this knowledge area yet.</p>}
      {evidence.length > 4 && <Link href={allEvidence ? `/dashboard/knowledge/${encodeURIComponent(area.id)}#supporting-evidence` : `/dashboard/knowledge/${encodeURIComponent(area.id)}?evidence=all#supporting-evidence`} className="mt-5 inline-flex rounded-lg border border-violet-200 px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50">{allEvidence ? 'Show fewer' : `View all ${evidence.length} evidence items`} →</Link>}
    </section>
  </main>;
}
