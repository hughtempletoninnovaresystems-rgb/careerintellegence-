'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';

import {
  HomeIcon,
  UserCircleIcon,
  BriefcaseIcon,
  SparklesIcon,
  AcademicCapIcon,
  DocumentTextIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline';

const links = [
  {
    section: 'Overview',
    items: [
      {
        name: 'Home',
        href: '/dashboard',
        icon: HomeIcon,
      },
    ],
  },
  {
    section: 'My Career',
    items: [
      {
        name: 'Career Profile',
        href: '/dashboard/profile',
        icon: UserCircleIcon,
      },
      {
        name: 'Experience',
        href: '/dashboard/experience',
        icon: BriefcaseIcon,
      },
      {
        name: 'Capabilities',
        href: '/dashboard/capabilities',
        icon: SparklesIcon,
      },
      {
        name: 'Knowledge',
        href: '/dashboard/knowledge',
        icon: AcademicCapIcon,
      },
      {
        name: 'Evidence',
        href: '/dashboard/evidence',
        icon: DocumentTextIcon,
      },
    ],
  },
  {
    section: 'Account',
    items: [
      {
        name: 'Settings',
        href: '/dashboard/settings',
        icon: Cog6ToothIcon,
      },
    ],
  },
];

export default function NavLinks() {
  const pathname = usePathname();

  return (
    <nav className="space-y-6">
      {links.map((group) => (
        <div key={group.section}>
          <p className="mb-2 hidden px-3 text-xs font-semibold uppercase tracking-wider text-slate-400 md:block">
            {group.section}
          </p>

          <div className="space-y-1">
            {group.items.map((link) => {
              const LinkIcon = link.icon;

              const active =
                pathname === link.href ||
                (link.href !== '/dashboard' &&
                  pathname.startsWith(`${link.href}/`));

              return (
                <Link
                  key={link.name}
                  href={link.href}
                  className={clsx(
                    'group flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
                    active
                      ? 'bg-slate-100 text-slate-900'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                  )}
                >
                  <LinkIcon
                    className={clsx(
                      'h-5 w-5 shrink-0',
                      active
                        ? 'text-slate-900'
                        : 'text-slate-400 group-hover:text-slate-700',
                    )}
                  />

                  <span className="hidden md:block">
                    {link.name}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}