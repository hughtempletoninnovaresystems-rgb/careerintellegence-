import Link from 'next/link';
import { Metadata } from 'next';
import { ArrowLeftIcon, SparklesIcon } from '@heroicons/react/24/outline';
import LoginForm from '@/app/ui/login-form';

export const metadata: Metadata = {
  title: 'Login | GIAS Career Intelligence',
};

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-slate-950">
      <div className="grid min-h-screen lg:grid-cols-2">

        {/* Left: GIAS proposition */}
        <section className="relative hidden overflow-hidden lg:flex">
          <div className="absolute inset-0 bg-slate-950" />

          {/* Subtle background structure */}
          <div className="absolute -left-32 -top-32 h-[500px] w-[500px] rounded-full border border-slate-800" />
          <div className="absolute -left-16 -top-16 h-[350px] w-[350px] rounded-full border border-slate-800/70" />
          <div className="absolute bottom-[-180px] right-[-120px] h-[500px] w-[500px] rounded-full border border-slate-800" />

          <div className="relative z-10 flex w-full flex-col justify-between p-10 xl:p-16">

            {/* Logo */}
            <Link href="/" className="flex w-fit items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-slate-950">
                <SparklesIcon className="h-5 w-5" />
              </div>

              <div>
                <div className="text-lg font-semibold tracking-tight text-white">
                  GIAS
                </div>
                <div className="text-xs font-medium text-slate-400">
                  Career Intelligence
                </div>
              </div>
            </Link>

            {/* Main message */}
            <div className="max-w-xl pb-16">
              <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Your career. Your intelligence.
              </div>

              <h1 className="text-5xl font-semibold tracking-tight text-white xl:text-6xl">
                Welcome back to your{' '}
                <span className="text-slate-500">
                  career intelligence.
                </span>
              </h1>

              <p className="mt-6 max-w-lg text-lg leading-8 text-slate-400">
                Continue developing the professional profile built from your
                experience, capabilities, knowledge and evidence.
              </p>

              {/* Mini profile visual */}
              <div className="mt-12 max-w-md rounded-2xl border border-slate-800 bg-slate-900/70 p-5 backdrop-blur">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                      Profile development
                    </p>
                    <p className="mt-1 text-sm font-semibold text-white">
                      Career Intelligence Profile
                    </p>
                  </div>

                  <span className="text-sm font-semibold text-white">
                    72%
                  </span>
                </div>

                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-800">
                  <div className="h-full w-[72%] rounded-full bg-white" />
                </div>

                <div className="mt-5 grid grid-cols-3 gap-3">
                  <div className="rounded-lg bg-slate-800/60 p-3">
                    <p className="text-lg font-semibold text-white">8</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Roles
                    </p>
                  </div>

                  <div className="rounded-lg bg-slate-800/60 p-3">
                    <p className="text-lg font-semibold text-white">34</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Capabilities
                    </p>
                  </div>

                  <div className="rounded-lg bg-slate-800/60 p-3">
                    <p className="text-lg font-semibold text-white">11</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Knowledge
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <p className="text-xs text-slate-600">
              GIAS · Career Intelligence
            </p>
          </div>
        </section>

        {/* Right: Login */}
        <section className="flex min-h-screen items-center justify-center bg-white px-6 py-12 sm:px-10 lg:min-h-0">
          <div className="w-full max-w-md">

            {/* Mobile logo */}
            <div className="mb-12 lg:hidden">
              <Link href="/" className="flex w-fit items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-white">
                  <SparklesIcon className="h-5 w-5" />
                </div>

                <div>
                  <div className="text-lg font-semibold tracking-tight">
                    GIAS
                  </div>
                  <div className="text-xs font-medium text-slate-500">
                    Career Intelligence
                  </div>
                </div>
              </Link>
            </div>

            {/* Back */}
            <Link
              href="/"
              className="mb-10 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-900"
            >
              <ArrowLeftIcon className="h-4 w-4" />
              Back to GIAS
            </Link>

            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-slate-400">
                Welcome back
              </p>

              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                Sign in to your profile
              </h2>

              <p className="mt-3 text-sm leading-6 text-slate-500">
                Continue building and exploring your career intelligence.
              </p>
            </div>

            <div className="mt-8">
              <LoginForm />
            </div>

            <div className="mt-8 border-t border-slate-200 pt-6 text-center">
              <p className="text-sm text-slate-500">
                Don&apos;t have a GIAS profile?
              </p>

              <Link
                href="/register"
                className="mt-2 inline-flex text-sm font-semibold text-slate-900 transition hover:text-slate-500"
              >
                Create your profile
                <span className="ml-1">→</span>
              </Link>
            </div>

            <p className="mt-10 text-center text-xs leading-5 text-slate-400">
              By continuing, you agree to use GIAS responsibly and maintain
              the accuracy of information in your career profile.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
