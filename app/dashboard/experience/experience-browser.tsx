'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { BriefcaseIcon, MagnifyingGlassIcon, PlusIcon } from '@heroicons/react/24/outline';
import type { ExperienceItem } from '@/app/lib/career-intelligence/data/experience';
import { experienceDateRange } from '@/app/lib/career-intelligence/domain/career-display';

type Filter = 'all' | 'current' | 'attention';

export default function ExperienceBrowser({ roles }: { roles: ExperienceItem[] }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => roles.filter((role) => {
    if (filter === 'current' && role.to_date_precision !== 'ongoing') return false;
    if (filter === 'attention' && Number(role.needs_attention_count) === 0) return false;
    const text = [role.proposed_role_title, role.organisation_name, role.role_description].join(' ').toLowerCase();
    return text.includes(search.trim().toLowerCase());
  }), [roles, filter, search]);
  const attention = roles.filter((role) => Number(role.needs_attention_count) > 0).length;
  const current = roles.filter((role) => role.to_date_precision === 'ongoing').length;

  return <main className="mx-auto max-w-7xl space-y-7 pb-10">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <Link href="/dashboard/profile" className="text-sm font-semibold text-violet-700 hover:text-violet-900">← Career Profile</Link>
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">My career</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Experience</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Explore the roles and experiences that make up your career.</p>
      </div>
      <Link href="/dashboard?source=manual" className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-violet-800">
        <PlusIcon className="h-5 w-5" aria-hidden="true"/> Add Experience
      </Link>
    </header>

    <section className="grid gap-4 sm:grid-cols-3" aria-label="Experience summary">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Recorded roles</p><p className="mt-2 text-3xl font-semibold text-slate-950">{roles.length}</p></div>
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Current roles</p><p className="mt-2 text-3xl font-semibold text-violet-700">{current}</p></div>
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Roles needing attention</p><p className="mt-2 text-3xl font-semibold text-amber-700">{attention}</p></div>
    </section>

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 p-5 sm:p-6">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter experience">
          {([['all','All'],['current','Current'],['attention','Needs Attention']] as const).map(([key, label]) =>
            <button key={key} type="button" onClick={() => setFilter(key)} aria-pressed={filter === key} className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${filter === key ? 'bg-violet-700 text-white' : 'border border-slate-200 text-slate-600 hover:border-violet-200 hover:bg-violet-50'}`}>{label}</button>
          )}
        </div>
        <label className="relative block w-full sm:w-64">
          <span className="sr-only">Search experiences</span>
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-2.5 h-5 w-5 text-slate-400" aria-hidden="true"/>
          <input type="search" placeholder="Search experience..." value={search} onChange={(event) => setSearch(event.target.value)} className="w-full rounded-lg border border-slate-200 py-2 pl-10 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-violet-500 focus:ring-violet-500" />
        </label>
      </div>
      <div className="p-5 sm:p-7">
        <div className="mb-6 flex items-center justify-between gap-3">
          <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-violet-800">Career timeline</h2>
          <p className="text-xs text-slate-500">{filtered.length} of {roles.length} roles</p>
        </div>
        {filtered.length ? <ol className="space-y-8 border-l-2 border-violet-100 pl-6 sm:pl-8">
          {filtered.map((role) => {
            const isCurrent = role.to_date_precision === 'ongoing';
            const needsAttention = Number(role.needs_attention_count) > 0;
            const title = role.proposed_role_title || 'Role title not recorded';
            return <li key={role.id} className="relative">
              <span className="absolute -left-[31px] top-0.5 h-3 w-3 rounded-full border-[3px] border-white bg-violet-600 ring-2 ring-violet-200 sm:-left-[39px]" aria-hidden="true" />
              <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">{experienceDateRange(role)}</p>
              <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-violet-200 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><h3 className="text-lg font-semibold text-slate-950">{title}</h3><p className="mt-1 text-sm text-slate-600">{role.organisation_name || 'Organisation not recorded'}</p></div>
                  {isCurrent && <span className="rounded-full bg-violet-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-violet-800">Current</span>}
                </div>
                {role.role_description && <p className="mt-4 line-clamp-3 whitespace-pre-line text-sm leading-6 text-slate-600">{role.role_description}</p>}
                <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 border-t border-slate-100 pt-4 text-sm text-slate-600">
                  <span><strong className="font-semibold text-slate-900">{role.capability_count}</strong> Capabilities</span>
                  <span><strong className="font-semibold text-slate-900">{role.knowledge_count}</strong> Knowledge areas</span>
                  <span><strong className="font-semibold text-slate-900">{role.evidence_count}</strong> Evidence items</span>
                </div>
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                  <p className={`text-sm font-medium ${needsAttention ? 'text-amber-700' : 'text-emerald-700'}`}>
                    {needsAttention ? `◐ ${role.needs_attention_count} capabilit${Number(role.needs_attention_count) === 1 ? 'y' : 'ies'} need further evidence` : role.capability_count > 0 ? '✓ No flagged evidence gaps' : 'No capabilities assessed yet'}
                  </p>
                  <Link href={`/dashboard/experience/${encodeURIComponent(role.id)}`} className="inline-flex rounded-lg border border-violet-200 px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50">{needsAttention ? 'Continue' : 'View role'} <span className="ml-2" aria-hidden="true">→</span></Link>
                </div>
              </article>
            </li>;
          })}
        </ol> : <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center">
          <BriefcaseIcon className="mx-auto h-10 w-10 text-slate-300" aria-hidden="true"/>
          <h3 className="mt-3 text-base font-semibold text-slate-900">{roles.length ? 'No matching experiences' : 'Your career timeline starts here'}</h3>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">{roles.length ? 'Try changing your search or filter.' : 'Add your first role through the existing manual career assessment to build your timeline.'}</p>
          {roles.length ? <button type="button" onClick={() => {setFilter('all');setSearch('');}} className="mt-5 font-semibold text-violet-700 hover:text-violet-900">Clear filters</button> : <Link href="/dashboard?source=manual" className="mt-5 inline-flex rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800">Add experience</Link>}
        </div>}
      </div>
    </section>
  </main>;
}
