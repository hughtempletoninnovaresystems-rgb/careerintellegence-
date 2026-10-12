import { getExperiences } from '@/app/lib/career-intelligence/data/career-pages';
import ExperienceBrowser from './experience-browser';

export const dynamic = 'force-dynamic';

export default async function ExperiencePage() {
  try {
    const roles = await getExperiences();
    return <ExperienceBrowser roles={roles} />;
  } catch (error) {
    console.error('Unable to load experience:', error);
    return <main className="mx-auto max-w-7xl pb-10"><h1 className="text-3xl font-semibold text-slate-950">Experience</h1><p role="alert" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">We could not load your career experience. Check your login and database connection, then refresh.</p></main>;
  }
}
