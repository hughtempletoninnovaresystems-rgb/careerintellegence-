'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { AcademicCapIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import type { ExperienceItem } from '@/app/lib/career-intelligence/data/experience';
import type { KnowledgeItem } from '@/app/lib/career-intelligence/data/knowledge';
import { knowledgeDomain } from '@/app/lib/career-intelligence/domain/career-display';

const domainOrder = ['Transformation & Change', 'Programme & Delivery', 'Leadership & People', 'Technology & Methods', 'Other knowledge'];

export default function KnowledgeBrowser({ areas, roles }: { areas: KnowledgeItem[]; roles: ExperienceItem[] }) {
  const [query, setQuery] = useState('');
  const [domain, setDomain] = useState('all');
  const [experience, setExperience] = useState('all');
  const availableDomains = domainOrder.filter((name) => areas.some((area) => knowledgeDomain(area.name) === name));
  const filtered = useMemo(() => areas.filter((area) => {
    if (domain !== 'all' && knowledgeDomain(area.name) !== domain) return false;
    if (experience !== 'all' && !area.experience_ids.includes(experience)) return false;
    return [area.name, area.description].join(' ').toLowerCase().includes(query.trim().toLowerCase());
  }), [areas, domain, experience, query]);

  return <main className="mx-auto max-w-7xl space-y-7 pb-10">
    <header>
      <Link href="/dashboard/profile" className="text-sm font-semibold text-violet-700 hover:text-violet-900">← Career Profile</Link>
      <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">My career</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Knowledge</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Knowledge demonstrated through your career experience.</p>
    </header>

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="grid gap-3 border-b border-slate-100 p-5 sm:grid-cols-[minmax(0,1fr)_190px_220px] sm:p-6">
        <label className="relative block"><span className="sr-only">Search knowledge</span><MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-2.5 h-5 w-5 text-slate-400" aria-hidden="true"/><input type="search" placeholder="Search knowledge..." value={query} onChange={(event) => setQuery(event.target.value)} className="w-full rounded-lg border border-slate-200 py-2 pl-10 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-violet-500 focus:ring-violet-500"/></label>
        <label><span className="sr-only">Domain</span><select value={domain} onChange={(event) => setDomain(event.target.value)} className="w-full rounded-lg border-slate-200 text-sm text-slate-700 focus:border-violet-500 focus:ring-violet-500"><option value="all">All domains</option>{availableDomains.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
        <label><span className="sr-only">Experience</span><select value={experience} onChange={(event) => setExperience(event.target.value)} className="w-full rounded-lg border-slate-200 text-sm text-slate-700 focus:border-violet-500 focus:ring-violet-500"><option value="all">All experiences</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.proposed_role_title || 'Untitled role'} · {role.organisation_name || 'Unknown organisation'}</option>)}</select></label>
      </div>
      <div className="px-5 pt-5 sm:px-7"><p className="text-sm font-medium text-slate-500">{filtered.length} knowledge area{filtered.length === 1 ? '' : 's'}{filtered.length !== areas.length ? ` of ${areas.length}` : ''}</p></div>
      <div className="space-y-8 p-5 sm:p-7">
        {domainOrder.map((group) => {
          const items = filtered.filter((area) => knowledgeDomain(area.name) === group);
          if (!items.length) return null;
          return <section key={group} aria-label={group}>
            <h2 className="mb-4 border-b border-slate-100 pb-3 text-xs font-bold uppercase tracking-[0.15em] text-violet-800">{group}</h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{items.map((area) => <article key={area.id} className="flex flex-col rounded-xl border border-slate-200 p-5 transition hover:border-violet-200 hover:shadow-sm">
              <h3 className="text-base font-semibold text-slate-950">{area.name}</h3>
              {area.description && <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{area.description}</p>}
              <div className="mt-5 space-y-1.5 text-sm text-slate-600"><p><strong className="font-semibold text-slate-900">{area.capability_count}</strong> related capabilities</p><p><strong className="font-semibold text-slate-900">{area.experience_count}</strong> experiences</p><p><strong className="font-semibold text-slate-900">{area.evidence_count}</strong> evidence items</p>{area.knowledge_record_count > 0 && <p className="font-semibold text-emerald-700">{area.knowledge_record_count} saved knowledge record{area.knowledge_record_count === 1 ? '' : 's'}</p>}</div>
              <Link href={`/dashboard/knowledge/${encodeURIComponent(area.id)}`} className="mt-5 self-end rounded-lg border border-violet-200 px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50">Explore <span className="ml-1" aria-hidden="true">→</span></Link>
            </article>)}</div>
          </section>;
        })}
        {!filtered.length && <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center"><AcademicCapIcon className="mx-auto h-10 w-10 text-slate-300" aria-hidden="true"/><h2 className="mt-3 font-semibold text-slate-950">{areas.length ? 'No matching knowledge areas' : 'Knowledge areas will appear here'}</h2><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">{areas.length ? 'Try changing the search or filters.' : 'Knowledge areas appear when your candidate knowledge, assessed capabilities, or promoted profile capabilities are saved in the database.'}</p>{areas.length ? <button type="button" onClick={() => {setQuery('');setDomain('all');setExperience('all');}} className="mt-5 font-semibold text-violet-700 hover:text-violet-900">Clear filters</button> : <Link href="/dashboard" className="mt-5 inline-flex rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800">Build your profile</Link>}</div>}
      </div>
    </section>
    {areas.length > 0 && <p className="text-xs leading-5 text-slate-500">Knowledge includes your saved candidate_knowledge records, assessment-linked competencies and promoted profile capabilities. Domain headings are suggested visual groupings, not a stored taxonomy.</p>}
  </main>;
}
