import Link from 'next/link';
import { Metadata } from 'next';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import LoginForm from '@/app/ui/login-form';

export const metadata: Metadata = {
  title: 'Login | GIAS',
};

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-[#f7f7f4] text-[#171717]">
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col px-6 py-6 sm:px-8 lg:px-10">

        {/* Top navigation */}
        <header className="flex items-center justify-between">
          <Link href="/" className="group flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#171717] text-white transition-transform duration-300 group-hover:rotate-3">
              <SparklesIcon className="h-5 w-5" />
            </div>

            <div className="leading-none">
              <div className="text-[17px] font-bold tracking-[-0.03em]">
                GIAS
              </div>
              <div className="mt-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
                Career Intelligence
              </div>
            </div>
          </Link>

          <Link
            href="/"
            className="group inline-flex items-center gap-2 text-sm font-medium text-neutral-500 transition hover:text-[#171717]"
          >
            <ArrowLeftIcon className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
            Back to home
          </Link>
        </header>

        {/* Main */}
        <div className="relative flex flex-1 items-center justify-center py-16 lg:py-20">

          {/* Background detail */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute left-1/2 top-1/2 h-[620px] w-[620px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-neutral-200/70" />

            <div className="absolute left-1/2 top-1/2 h-[440px] w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-neutral-200/60" />

            <div className="absolute left-1/2 top-1/2 h-[260px] w-[260px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-neutral-200/50" />

            <div className="absolute left-[calc(50%+245px)] top-[calc(50%-250px)] h-2 w-2 rounded-full bg-emerald-500" />

            <div className="absolute left-[calc(50%-310px)] top-[calc(50%+170px)] h-1.5 w-1.5 rounded-full bg-neutral-400" />
          </div>

          <div className="relative z-10 w-full max-w-[460px]">

            {/* Intro */}
            <div className="mb-8 text-center">
              <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-neutral-200 bg-white shadow-sm">
                <SparklesIcon className="h-5 w-5 text-neutral-700" />
              </div>

              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-neutral-400">
                Career Intelligence
              </p>

              <h1 className="mt-3 text-[38px] font-semibold tracking-[-0.045em] text-[#171717] sm:text-[42px]">
                Welcome back.
              </h1>

              <p className="mx-auto mt-3 max-w-sm text-[15px] leading-6 text-neutral-500">
                Continue developing your professional profile,
                experience and capabilities.
              </p>
            </div>

            {/* Login card */}
            <div className="rounded-[24px] border border-neutral-200 bg-white p-7 shadow-[0_20px_70px_-30px_rgba(0,0,0,0.25)] sm:p-8">

              <LoginForm />

              <div className="my-7 flex items-center gap-4">
                <div className="h-px flex-1 bg-neutral-200" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-neutral-400">
                  GIAS
                </span>
                <div className="h-px flex-1 bg-neutral-200" />
              </div>

              <div className="text-center">
                <p className="text-sm text-neutral-500">
                  New to GIAS?
                </p>

                <Link
                  href="/register"
                  className="group mt-2 inline-flex items-center gap-2 text-sm font-semibold text-[#171717]"
                >
                  Create your career profile
                  <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </div>
            </div>

            {/* Trust statement */}
            <p className="mx-auto mt-6 max-w-sm text-center text-[11px] leading-5 text-neutral-400">
              Your career profile develops over time, with you in control
              of what becomes part of your professional record.
            </p>
          </div>
        </div>

        {/* Bottom */}
        <footer className="flex items-center justify-between border-t border-neutral-200 pt-5 text-[10px] font-medium uppercase tracking-[0.12em] text-neutral-400">
          <span>GIAS</span>
          <span>Career Intelligence</span>
        </footer>
      </div>
    </main>
  );
}