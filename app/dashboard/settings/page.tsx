import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import SettingsClient from './settings-client';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.email) redirect('/login');
  return <SettingsClient />;
}
