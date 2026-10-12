import { getExperiences, getKnowledgeAreas } from '@/app/lib/career-intelligence/data/career-pages';
import KnowledgeBrowser from './knowledge-browser';

export const dynamic = 'force-dynamic';

export default async function KnowledgePage() {
  try {
    const [areas, roles] = await Promise.all([getKnowledgeAreas(), getExperiences()]);
    return <KnowledgeBrowser areas={areas} roles={roles} />;
  } catch (error) {
    console.error('Unable to load knowledge:', error);
    return <main className="mx-auto max-w-7xl pb-10"><h1 className="text-3xl font-semibold text-slate-950">Knowledge</h1><p role="alert" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">We could not load your knowledge areas. Check your login and database connection, then refresh.</p></main>;
  }
}
