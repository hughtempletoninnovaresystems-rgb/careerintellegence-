import Link from 'next/link';
import {
  ArrowRightIcon,
  CheckCircleIcon,
  SparklesIcon,
  ChartBarIcon,
  BriefcaseIcon,
  AcademicCapIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';

export default function Page() {
  return (
    <main className="min-h-screen bg-white text-slate-900">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white">
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

          <nav className="hidden items-center gap-8 md:flex">
            <a
              href="#how-it-works"
              className="text-sm font-medium text-slate-600 transition hover:text-slate-900"
            >
              How it works
            </a>
            <a
              href="#profile"
              className="text-sm font-medium text-slate-600 transition hover:text-slate-900"
            >
              Your profile
            </a>
            <a
              href="#why-gias"
              className="text-sm font-medium text-slate-600 transition hover:text-slate-900"
            >
              Why GIAS
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="hidden rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 sm:block"
            >
              Log in
            </Link>

            <Link
              href="/register"
              className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-7xl gap-16 px-6 pb-24 pt-20 lg:grid-cols-2 lg:items-center lg:px-8 lg:pb-32 lg:pt-28">
          <div className="max-w-2xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm font-medium text-slate-600">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Your career, understood
            </div>

            <h1 className="text-5xl font-semibold tracking-tight text-slate-950 sm:text-6xl lg:text-7xl">
              Turn your career history into{' '}
              <span className="text-slate-500">
                career intelligence.
              </span>
            </h1>

            <p className="mt-7 max-w-xl text-lg leading-8 text-slate-600">
              GIAS transforms your experience into an evolving professional
              profile — connecting your career experience, capabilities,
              knowledge and evidence in one place.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/register"
                className="inline-flex items-center justify-center gap-3 rounded-lg bg-slate-900 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                Build my profile
                <ArrowRightIcon className="h-5 w-5" />
              </Link>

              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-6 py-3.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                I already have an account
              </Link>
            </div>

            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm text-slate-500">
              <span className="flex items-center gap-2">
                <CheckCircleIcon className="h-5 w-5 text-emerald-600" />
                Start with your CV
              </span>
              <span className="flex items-center gap-2">
                <CheckCircleIcon className="h-5 w-5 text-emerald-600" />
                Build progressively
              </span>
              <span className="flex items-center gap-2">
                <CheckCircleIcon className="h-5 w-5 text-emerald-600" />
                You remain in control
              </span>
            </div>
          </div>

          {/* Product preview */}
          <div className="relative">
            <div className="absolute -inset-8 rounded-full bg-slate-100 blur-3xl" />

            <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-200/60">
              <div className="flex h-12 items-center justify-between border-b border-slate-200 px-5">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                  <div className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                  <div className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                </div>

                <span className="text-xs font-medium text-slate-400">
                  Career Intelligence
                </span>
              </div>

              <div className="grid min-h-[470px] grid-cols-[150px_1fr]">
                <aside className="border-r border-slate-200 bg-slate-50 p-4">
                  <div className="mb-7 flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-white">
                      <SparklesIcon className="h-4 w-4" />
                    </div>
                    <span className="text-xs font-bold">GIAS</span>
                  </div>

                  <div className="space-y-1">
                    {[
                      'Overview',
                      'Career Profile',
                      'Experience',
                      'Capabilities',
                      'Knowledge',
                    ].map((item, index) => (
                      <div
                        key={item}
                        className={`rounded-lg px-3 py-2 text-xs font-medium ${
                          index === 0
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-500'
                        }`}
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                </aside>

                <div className="p-6">
                  <p className="text-xs font-medium text-slate-400">
                    YOUR CAREER PROFILE
                  </p>

                  <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                    Welcome back
                  </h2>

                  <div className="mt-6 rounded-xl border border-slate-200 p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold">
                          Profile development
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Your career intelligence profile
                        </p>
                      </div>

                      <span className="text-sm font-semibold">
                        72%
                      </span>
                    </div>

                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full w-[72%] rounded-full bg-slate-900" />
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <div className="rounded-xl border border-slate-200 p-4">
                      <BriefcaseIcon className="h-5 w-5 text-slate-500" />
                      <p className="mt-4 text-2xl font-semibold">8</p>
                      <p className="text-xs text-slate-500">Roles</p>
                    </div>

                    <div className="rounded-xl border border-slate-200 p-4">
                      <ChartBarIcon className="h-5 w-5 text-slate-500" />
                      <p className="mt-4 text-2xl font-semibold">34</p>
                      <p className="text-xs text-slate-500">Capabilities</p>
                    </div>

                    <div className="rounded-xl border border-slate-200 p-4">
                      <AcademicCapIcon className="h-5 w-5 text-slate-500" />
                      <p className="mt-4 text-2xl font-semibold">11</p>
                      <p className="text-xs text-slate-500">Knowledge areas</p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl border border-slate-200 p-5">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">
                        Needs your attention
                      </p>
                      <span className="text-xs text-slate-400">
                        2 items
                      </span>
                    </div>

                    <div className="mt-4 space-y-3">
                      <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
                        <div className="flex items-center gap-3">
                          <DocumentTextIcon className="h-5 w-5 text-slate-500" />
                          <div>
                            <p className="text-xs font-semibold">
                              Stakeholder Management
                            </p>
                            <p className="text-[11px] text-slate-500">
                              Additional evidence required
                            </p>
                          </div>
                        </div>

                        <ArrowRightIcon className="h-4 w-4 text-slate-400" />
                      </div>

                      <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
                        <div className="flex items-center gap-3">
                          <SparklesIcon className="h-5 w-5 text-slate-500" />
                          <div>
                            <p className="text-xs font-semibold">
                              Strategic Planning
                            </p>
                            <p className="text-[11px] text-slate-500">
                              Ready for review
                            </p>
                          </div>
                        </div>

                        <ArrowRightIcon className="h-4 w-4 text-slate-400" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section
        id="how-it-works"
        className="border-y border-slate-200 bg-slate-50"
      >
        <div className="mx-auto max-w-7xl px-6 py-24 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              How it works
            </p>

            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              Start with what you already have.
            </h2>

            <p className="mt-4 text-lg leading-8 text-slate-600">
              Your CV is only the starting point. GIAS progressively develops
              a richer understanding of your professional experience.
            </p>
          </div>

          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {[
              {
                number: '01',
                title: 'Upload your CV',
                text: 'GIAS identifies the roles, experience and professional signals contained within your existing career history.',
              },
              {
                number: '02',
                title: 'Enrich your experience',
                text: 'Where evidence is incomplete, GIAS asks focused questions to understand what you actually did and how you did it.',
              },
              {
                number: '03',
                title: 'Build your intelligence profile',
                text: 'Your experience becomes an evolving profile of capabilities, knowledge and supporting evidence.',
              },
            ].map((step) => (
              <div
                key={step.number}
                className="rounded-2xl border border-slate-200 bg-white p-7"
              >
                <span className="text-sm font-semibold text-slate-400">
                  {step.number}
                </span>

                <h3 className="mt-8 text-xl font-semibold">
                  {step.title}
                </h3>

                <p className="mt-3 leading-7 text-slate-600">
                  {step.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Profile proposition */}
      <section id="profile">
        <div className="mx-auto max-w-7xl px-6 py-24 lg:px-8 lg:py-32">
          <div className="grid gap-16 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-slate-500">
                More than a CV
              </p>

              <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                Your professional profile should grow with you.
              </h2>

              <p className="mt-5 text-lg leading-8 text-slate-600">
                A CV captures what you chose to write down at a particular
                point in time. GIAS is designed to capture the broader
                intelligence behind your career.
              </p>

              <div className="mt-8 space-y-5">
                {[
                  [
                    'Career experience',
                    'Understand your roles, responsibilities and achievements.',
                  ],
                  [
                    'Capabilities',
                    'Connect what you have done with the capabilities demonstrated through your experience.',
                  ],
                  [
                    'Knowledge',
                    'Build a structured picture of the professional knowledge developed throughout your career.',
                  ],
                  [
                    'Evidence',
                    'Understand why a capability or area of knowledge appears in your profile.',
                  ],
                ].map(([title, text]) => (
                  <div key={title} className="flex gap-4">
                    <CheckCircleIcon className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
                    <div>
                      <h3 className="font-semibold">{title}</h3>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        {text}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 sm:p-8">
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                      Capability
                    </p>
                    <h3 className="mt-1 text-xl font-semibold">
                      Stakeholder Management
                    </h3>
                  </div>

                  <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                    Confirmed
                  </span>
                </div>

                <div className="mt-7">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Supporting evidence
                  </p>

                  <div className="mt-3 space-y-3">
                    <div className="rounded-lg bg-slate-50 p-4">
                      <p className="text-sm font-medium">
                        Programme Director
                      </p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        Led executive stakeholder engagement across a complex
                        transformation programme.
                      </p>
                    </div>

                    <div className="rounded-lg bg-slate-50 p-4">
                      <p className="text-sm font-medium">
                        Head of Transformation
                      </p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        Established governance involving senior stakeholders
                        across multiple business functions.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 border-t border-slate-200 pt-5">
                  <p className="text-xs text-slate-500">
                    Evidence is connected to the experience from which it was
                    identified.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why GIAS */}
      <section
        id="why-gias"
        className="border-y border-slate-200 bg-slate-900 text-white"
      >
        <div className="mx-auto max-w-7xl px-6 py-24 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-slate-400">
                Why GIAS
              </p>

              <h2 className="mt-3 text-3xl font-semibold tracking-tight">
                Intelligence that develops with your career.
              </h2>
            </div>

            <div className="lg:col-span-2 grid gap-8 sm:grid-cols-2">
              <div>
                <h3 className="font-semibold">Evidence-led</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Your profile is built from evidence rather than unsupported
                  assertions.
                </p>
              </div>

              <div>
                <h3 className="font-semibold">Progressive</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Start with your CV and continue developing your profile over
                  time.
                </p>
              </div>

              <div>
                <h3 className="font-semibold">Transparent</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Understand where information in your profile has come from
                  and why it has been identified.
                </p>
              </div>

              <div>
                <h3 className="font-semibold">Candidate controlled</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  GIAS can identify and suggest. You remain responsible for
                  what becomes part of your profile.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section>
        <div className="mx-auto max-w-4xl px-6 py-24 text-center lg:py-32">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
            <SparklesIcon className="h-7 w-7 text-slate-700" />
          </div>

          <h2 className="mt-7 text-3xl font-semibold tracking-tight sm:text-4xl">
            Start building your career intelligence profile.
          </h2>

          <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-slate-600">
            Bring your existing career history. GIAS will help turn it into
            something you can continue to develop.
          </p>

          <div className="mt-8">
            <Link
              href="/register"
              className="inline-flex items-center gap-3 rounded-lg bg-slate-900 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              Get started
              <ArrowRightIcon className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <div>
            <span className="font-semibold text-slate-700">GIAS</span>
            <span className="ml-2">
              Career Intelligence
            </span>
          </div>

          <div className="flex gap-6">
            <Link
              href="/login"
              className="transition hover:text-slate-900"
            >
              Log in
            </Link>
            <Link
              href="/register"
              className="transition hover:text-slate-900"
            >
              Register
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

