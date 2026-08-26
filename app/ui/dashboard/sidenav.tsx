import Link from 'next/link';
import NavLinks from '@/app/ui/dashboard/nav-links';
import { PowerIcon } from '@heroicons/react/24/outline';
import { signOut } from '@/auth';

export default function SideNav() {
  return (
    <div className="flex h-full flex-col border-r border-slate-200 bg-white px-3 py-4 md:px-4">
      <Link
        href="/dashboard"
        className="mb-8 block px-3"
      >
        <div className="text-xl font-semibold tracking-tight text-slate-900">
          Career Intelligence
        </div>

        <div className="mt-1 text-xs font-medium uppercase tracking-widest text-slate-400">
          Professional Profile
        </div>
      </Link>

      <div className="flex grow flex-row justify-between space-x-2 md:flex-col md:space-x-0">
        <NavLinks />

        <div className="hidden grow md:block" />

        <form
          action={async () => {
            'use server';
            await signOut();
          }}
        >
          <button
            type="submit"
            className="flex h-11 w-full items-center justify-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-900 md:justify-start"
          >
            <PowerIcon className="h-5 w-5 shrink-0" />
            <span className="hidden md:block">
              Sign Out
            </span>
          </button>
        </form>
      </div>
    </div>
  );
}