'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { DocumentTextIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import type { EvidenceRecord } from '@/app/lib/career-intelligence/data/evidence';

const statusNames: Record<EvidenceRecord['status'], string> = {
  reviewed: 'Linked to reviewed capability',
  linked: 'Linked to capability',
  superseded: 'Superseded link',
  unlinked: 'Not linked',
  recorded: 'Knowledge evidence',
  profile: 'Active profile evidence',
};

function badgeStyle(status: EvidenceRecord['status']) {
  if (status === 'reviewed' || status === 'profile') return 'bg-emerald-50 text-emerald-700';
  if (status === 'superseded' || status === 'unlinked') return 'bg-amber-50 text-amber-800';
  return 'bg-violet-50 text-violet-800';
}

export default function EvidenceBrowser({ records }: { records: EvidenceRecord[] }) {
  const [query, setQuery] = useState('');
  const [experience, setExperience] = useState('all');
  const [capability, setCapability] = useState('all');
  const [source, setSource] = useState('all');
  const [status, setStatus] = useState('all');

  const experienceOptions = useMemo(() => Array.from(new Map(records.map((item) => [item.experience_key, item.experience_label])).entries())
    .sort((a, b) => a[1].localeCompare(b[1])), [records]);
  const capabilityOptions = useMemo(() => Array.from(new Set(records.flatMap((item) => item.capabilities.map((c) => c.name)))).sort(), [records]);
  const sources = useMemo(() => Array.from(new Set(records.map((item) => item.source_type))).sort(), [records]);
  const statuses = useMemo(() => Array.from(new Set(records.map((item) => item.status))), [records]);
  const filtered = useMemo(() => records.filter((item) => {
    if (experience !== 'all' && item.experience_key !== experience) return false;
    if (capability !== 'all' && !item.capabilities.some((c) => c.name === capability)) return false;
    if (source !== 'all' && item.source_type !== source) return false;
    if (status !== 'all' && item.status !== status) return false;
    const haystack = [item.evidence_text, item.experience_label, item.source_type,
      ...item.capabilities.map((c) => c.name), ...item.knowledge_areas.map((k) => k.name)].join(' ').toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  }), [records, query, experience, capability, source, status]);
  const grouped = useMemo(() => {
    const byRole = new Map<string, { label: string; items: EvidenceRecord[] }>();
    filtered.forEach((item) => {
      if (!byRole.has(item.experience_key)) byRole.set(item.experience_key, { label: item.experience_label, items: [] });
      byRole.get(item.experience_key)!.items.push(item);
    });
    return Array.from(byRole.entries());
  }, [filtered]);
  const clear = () => { setQuery(''); setExperience('all'); setCapability('all'); setSource('all'); setStatus('all'); };

  return <main className="mx-auto max-w-7xl space-y-7 pb-10">
    <header>
      <Link href="/dashboard/profile" className="text-sm font-semibold text-violet-700 hover:text-violet-900">← Career Profile</Link>
      <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">My career</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Evidence</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Explore the evidence supporting your career profile. Every record connects to its source, roles, and the capabilities or knowledge it supports.</p>
    </header>

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-5 sm:p-6">
        <p className="text-lg font-semibold text-slate-950">{records.length} evidence item{records.length === 1 ? '' : 's'}</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">This is a traceable evidence audit trail, not a document library. Review states describe linked capabilities, not independent approval of evidence.</p>
        <div className="mt-5 space-y-3">
          <label className="relative block"><span className="sr-only">Search evidence</span><MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-2.5 h-5 w-5 text-slate-400" aria-hidden="true"/><input type="search" placeholder="Search evidence..." value={query} onChange={(e) => setQuery(e.target.value)} className="w-full rounded-lg border-slate-200 py-2 pl-10 pr-3 text-sm focus:border-violet-500 focus:ring-violet-500"/></label>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <label><span className="sr-only">Experience</span><select value={experience} onChange={(e) => setExperience(e.target.value)} className="w-full rounded-lg border-slate-200 text-sm focus:border-violet-500 focus:ring-violet-500"><option value="all">All experiences</option>{experienceOptions.map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
            <label><span className="sr-only">Capability</span><select value={capability} onChange={(e) => setCapability(e.target.value)} className="w-full rounded-lg border-slate-200 text-sm focus:border-violet-500 focus:ring-violet-500"><option value="all">All capabilities</option>{capabilityOptions.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
            <label><span className="sr-only">Source</span><select value={source} onChange={(e) => setSource(e.target.value)} className="w-full rounded-lg border-slate-200 text-sm focus:border-violet-500 focus:ring-violet-500"><option value="all">All sources</option>{sources.map((name) => <option key={name} value={name}>{name.replaceAll('_', ' ')}</option>)}</select></label>
            <label><span className="sr-only">Status</span><select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full rounded-lg border-slate-200 text-sm focus:border-violet-500 focus:ring-violet-500"><option value="all">All statuses</option>{statuses.map((name) => <option key={name} value={name}>{statusNames[name]}</option>)}</select></label>
          </div>
        </div>
        <p className="mt-4 text-sm text-slate-500">Showing {filtered.length} of {records.length} evidence items</p>
      </div>

      <div className="space-y-8 p-5 sm:p-7">
        {grouped.map(([key, group]) => <section key={key} aria-label={group.label}>
          <h2 className="mb-4 border-b border-slate-100 pb-3 text-sm font-bold text-slate-950">{group.label} <span className="ml-1 font-normal text-slate-500">({group.items.length})</span></h2>
          <div className="space-y-4">{group.items.map((item) => <article key={item.id} className="rounded-xl border border-slate-200 p-5 transition hover:border-violet-200 hover:shadow-sm">
            <p className="whitespace-pre-line text-sm leading-7 text-slate-800">{item.evidence_text.length > 280 ? `${item.evidence_text.slice(0, 280).trimEnd()}…` : item.evidence_text}</p>
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Supports
              </p>
              <p className="mt-1 text-sm text-slate-700">
                {Array.from(
                  new Set([
                    ...item.capabilities.map((c) => c.name),
                    ...item.knowledge_areas.map((k) => k.name),
                  ])
                ).join(' · ') || 'No capability or knowledge link recorded'}
              </p>
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <p className="text-xs text-slate-500">Source: {item.source_type.replaceAll('_', ' ')}</p>
              <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${badgeStyle(item.status)}`}>{statusNames[item.status]}</span>
              <Link href={`/dashboard/evidence/${encodeURIComponent(item.id)}`} className="ml-auto inline-flex rounded-lg border border-violet-200 px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50">View evidence →</Link>
            </div>
          </article>)}</div>
        </section>)}
        {!filtered.length && <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center"><DocumentTextIcon className="mx-auto h-10 w-10 text-slate-300" aria-hidden="true"/><h2 className="mt-3 font-semibold text-slate-950">{records.length ? 'No matching evidence' : 'Your evidence trail will appear here'}</h2><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">{records.length ? 'Try changing the search or filters.' : 'Evidence saved from CV analysis, knowledge records, and your promoted career profile will appear here.'}</p>{records.length ? <button type="button" onClick={clear} className="mt-5 font-semibold text-violet-700">Clear filters</button> : <Link href="/dashboard" className="mt-5 inline-flex rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800">Build your profile</Link>}</div>}
      </div>
    </section>
  </main>;
}
