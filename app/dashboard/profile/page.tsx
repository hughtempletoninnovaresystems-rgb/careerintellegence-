import Link from 'next/link';
import { getAccountDisplayName, getCareerProfileData, type ProfileRole } from '@/app/lib/career-intelligence/data/profile';

export const dynamic = 'force-dynamic';

function dateLabel(value: string | null, precision?: string | null) {
  if (precision === 'ongoing' || !value) return precision === 'ongoing' ? 'Present' : 'Date not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { year: 'numeric', month: 'short' });
}

function StatCard({ label, value, detail }: { label: string; value: number | string; detail: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function SectionHeading({ eyebrow, title, action }: { eyebrow: string; title: string; action?: { label: string; href: string } }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-700">{eyebrow}</p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">{title}</h2>
      </div>
      {action && <Link href={action.href} className="text-sm font-semibold text-violet-700 hover:text-violet-900">{action.label} <span aria-hidden="true">→</span></Link>}
    </div>
  );
}

export default async function CareerProfilePage() {
  let displayName = 'Your career profile';
  let roles: ProfileRole[] = [];
  let capabilityCount = 0;
  let knowledgeCount = 0;
  let evidenceCount = 0;
  let evidencedCount = 0;
  let needsEvidenceCount = 0;
  let awaitingReviewCount = 0;
  let experienceCount = 0;
  let summary = 'Build a consolidated view of your experience, capabilities and supporting evidence.';

  try {
    displayName = await getAccountDisplayName();
    const profile = await getCareerProfileData();
    roles = profile.roles;
    experienceCount = roles.length;
    capabilityCount = profile.capabilityCount;
    knowledgeCount = profile.knowledgeCount;
    evidenceCount = profile.evidenceCount;
    evidencedCount = profile.evidencedCount;
    needsEvidenceCount = profile.needsEvidenceCount;
    awaitingReviewCount = profile.awaitingReviewCount;

    const latestDescription = roles.find((role) => role.role_description?.trim())?.role_description;
    if (latestDescription?.trim()) summary = latestDescription.trim();
  } catch (error) {
    // Keep the page usable for a newly registered account or a database that has
    // not yet had the career-intelligence migrations applied.
    console.error('Unable to load career profile data:', error);
  }

  const strength = capabilityCount > 0 ? Math.round((evidencedCount / capabilityCount) * 100) : 0;
  const highlightGroups = [
    { title: 'Leadership', items: ['Strategic leadership', 'Stakeholder management', 'Team leadership'] },
    { title: 'Transformation', items: ['Business transformation', 'Change leadership', 'Operating model design'] },
    { title: 'Delivery', items: ['Programme governance', 'Risk management', 'Benefits management'] },
  ];

  return (
    <main className="mx-auto max-w-7xl space-y-8 pb-10">
      <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">Career profile</p>
            <p className="mt-1 text-sm text-slate-500">Your consolidated career intelligence profile</p>
            <h1 className="mt-6 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">{displayName}</h1>
            <p className="mt-2 text-lg font-medium text-slate-600">{roles[0]?.proposed_role_title || 'Professional profile'}</p>
            <p className="mt-4 max-w-2xl leading-7 text-slate-600">{summary}</p>
          </div>
          <Link href="/dashboard/settings" className="inline-flex items-center rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-violet-400 hover:bg-violet-50 hover:text-violet-800">Edit profile</Link>
        </div>
      </header>

      <section className="space-y-4">
        <SectionHeading eyebrow="Profile overview" title="Your career at a glance" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Experiences" value={experienceCount} detail="Career roles recorded" />
          <StatCard label="Capabilities" value={capabilityCount} detail="Identified skills and abilities" />
          <StatCard label="Knowledge areas" value={knowledgeCount} detail="Saved and assessed knowledge" />
          <StatCard label="Evidence items" value={evidenceCount} detail="Evidence across your career profile" />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <SectionHeading eyebrow="Profile development" title="Build a stronger evidence-backed profile" action={{ label: 'Continue development', href: '/dashboard/capabilities' }} />
        <div className="mt-6 flex flex-wrap items-end justify-between gap-2">
          <div><p className="text-sm font-medium text-slate-600">Overall profile strength</p><p className="mt-1 text-sm text-slate-500">Based on capabilities assessed as demonstrated</p></div>
          <p className="text-2xl font-semibold text-slate-950">{strength}%</p>
        </div>
        <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label="Overall profile strength" aria-valuemin={0} aria-valuemax={100} aria-valuenow={strength}>
          <div className="h-full rounded-full bg-violet-600 transition-all" style={{ width: `${strength}%` }} />
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="flex items-start gap-3 rounded-xl bg-emerald-50 p-4"><span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">✓</span><div><p className="font-semibold text-slate-900">{evidencedCount} sufficiently evidenced</p><p className="mt-1 text-sm text-slate-600">Capabilities assessed as demonstrated</p></div></div>
          <div className="flex items-start gap-3 rounded-xl bg-amber-50 p-4"><span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-sm font-bold text-amber-700">!</span><div><p className="font-semibold text-slate-900">{needsEvidenceCount} need further evidence</p><p className="mt-1 text-sm text-slate-600">Add specific examples and outcomes</p></div></div>
          <div className="flex items-start gap-3 rounded-xl bg-violet-50 p-4"><span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-violet-100 text-sm font-bold text-violet-700">○</span><div><p className="font-semibold text-slate-900">{awaitingReviewCount} awaiting review</p><p className="mt-1 text-sm text-slate-600">Review and confirm identified capabilities</p></div></div>
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeading eyebrow="Career highlights" title="Your capability themes" action={{ label: 'Explore all capabilities', href: '/dashboard/capabilities' }} />
        <div className="grid gap-4 md:grid-cols-3">
          {highlightGroups.map((group) => <div key={group.title} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="font-semibold text-slate-950">{group.title}</h3><ul className="mt-4 space-y-2">{group.items.map((item) => <li key={item} className="flex gap-2 text-sm text-slate-600"><span className="text-violet-600">•</span>{item}</li>)}</ul></div>)}
        </div>
        <p className="text-xs text-slate-500">These are example themes to help organise your profile; replace them with verified capability data as it becomes available.</p>
      </section>

      <section className="space-y-4">
        <SectionHeading eyebrow="Career timeline" title="Experience and progression" action={{ label: 'View experience', href: '/dashboard/experience' }} />
        {roles.length ? <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><ol className="divide-y divide-slate-100">{roles.map((role) => <li key={role.id} className="grid gap-2 p-5 sm:grid-cols-[150px_1fr] sm:gap-6 sm:p-6"><p className="text-sm font-semibold text-slate-500">{dateLabel(role.from_date)} – {dateLabel(role.to_date, role.to_date_precision)}</p><div><h3 className="font-semibold text-slate-950">{role.proposed_role_title || 'Role title not recorded'}</h3><p className="mt-1 text-sm text-slate-600">{role.organisation_name || 'Organisation not recorded'}</p><p className="mt-2 text-xs text-slate-500">{role.lifecycle_status?.replaceAll('_', ' ') || 'In progress'}</p></div></li>)}</ol></div> : <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center"><p className="font-semibold text-slate-900">Your career timeline starts here</p><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">Once you add or analyse your career experience, your roles and progression will appear here.</p><Link href="/dashboard" className="mt-5 inline-flex rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800">Add career experience</Link></div>}
      </section>
    </main>
  );
}
