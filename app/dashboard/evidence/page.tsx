import Link from 'next/link';
import { getEvidenceRecords } from '@/app/lib/career-intelligence/data/evidence';
import EvidenceBrowser from './evidence-browser';

export const dynamic = 'force-dynamic';

export default async function EvidencePage() {
  try {
    const records = await getEvidenceRecords();
    return <EvidenceBrowser records={records} />;
  } catch (error) {
    console.error('Unable to load evidence:', error);
    return <main className="mx-auto max-w-7xl pb-10">
      <Link href="/dashboard/profile" className="text-sm font-semibold text-violet-700">← Career Profile</Link>
      <h1 className="mt-5 text-3xl font-semibold text-slate-950">Evidence</h1>
      <p role="alert" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">Unable to load your evidence records. Please check your database connection and sign-in, then refresh.</p>
    </main>;
  }
}
