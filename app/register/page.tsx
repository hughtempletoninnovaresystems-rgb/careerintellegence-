"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  SparklesIcon,
  UserIcon,
  AtSymbolIcon,
  KeyIcon,
  EyeIcon,
  EyeSlashIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";

export default function RegisterPage() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
  });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.error || "Registration failed.");
        return;
      }

      setMessage("Registration successful!");

      setForm({
        name: "",
        email: "",
        password: "",
      });
    } catch (error) {
      setMessage("Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f7f4] text-[#171717]">
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col px-6 py-6 sm:px-8 lg:px-10">

        {/* Header */}
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
        <div className="relative flex flex-1 items-center justify-center py-12 lg:py-16">

          {/* Background detail */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute left-1/2 top-1/2 h-[620px] w-[620px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-neutral-200/70" />

            <div className="absolute left-1/2 top-1/2 h-[440px] w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-neutral-200/60" />

            <div className="absolute left-1/2 top-1/2 h-[260px] w-[260px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-neutral-200/50" />

            <div className="absolute left-[calc(50%+245px)] top-[calc(50%-250px)] h-2 w-2 rounded-full bg-emerald-500" />
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
                Create your profile.
              </h1>

              <p className="mx-auto mt-3 max-w-sm text-[15px] leading-6 text-neutral-500">
                Start building a richer picture of your experience,
                capabilities and knowledge.
              </p>
            </div>

            {/* Register card */}
            <div className="rounded-[24px] border border-neutral-200 bg-white p-7 shadow-[0_20px_70px_-30px_rgba(0,0,0,0.25)] sm:p-8">

              <form onSubmit={handleSubmit} className="space-y-5">

                {/* Name */}
                <div>
                  <label
                    htmlFor="name"
                    className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600"
                  >
                    Full name
                  </label>

                  <div className="relative">
                    <UserIcon className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-neutral-400" />

                    <input
                      id="name"
                      type="text"
                      name="name"
                      placeholder="Your full name"
                      value={form.name}
                      onChange={handleChange}
                      required
                      autoComplete="name"
                      className="block h-12 w-full rounded-xl border border-neutral-200 bg-[#fafafa] pl-11 pr-4 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 hover:border-neutral-300 focus:border-neutral-800 focus:bg-white focus:ring-4 focus:ring-neutral-100"
                    />
                  </div>
                </div>

                {/* Email */}
                <div>
                  <label
                    htmlFor="email"
                    className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600"
                  >
                    Email address
                  </label>

                  <div className="relative">
                    <AtSymbolIcon className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-neutral-400" />

                    <input
                      id="email"
                      type="email"
                      name="email"
                      placeholder="you@example.com"
                      value={form.email}
                      onChange={handleChange}
                      required
                      autoComplete="email"
                      className="block h-12 w-full rounded-xl border border-neutral-200 bg-[#fafafa] pl-11 pr-4 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 hover:border-neutral-300 focus:border-neutral-800 focus:bg-white focus:ring-4 focus:ring-neutral-100"
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label
                    htmlFor="password"
                    className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600"
                  >
                    Password
                  </label>

                  <div className="relative">
                    <KeyIcon className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-neutral-400" />

                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      name="password"
                      placeholder="Create a password"
                      value={form.password}
                      onChange={handleChange}
                      required
                      minLength={8}
                      autoComplete="new-password"
                      className="block h-12 w-full rounded-xl border border-neutral-200 bg-[#fafafa] pl-11 pr-12 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 hover:border-neutral-300 focus:border-neutral-800 focus:bg-white focus:ring-4 focus:ring-neutral-100"
                    />

                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={
                        showPassword
                          ? "Hide password"
                          : "Show password"
                      }
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
                    >
                      {showPassword ? (
                        <EyeSlashIcon className="h-[18px] w-[18px]" />
                      ) : (
                        <EyeIcon className="h-[18px] w-[18px]" />
                      )}
                    </button>
                  </div>

                  <p className="mt-2 text-[11px] text-neutral-400">
                    Minimum 8 characters.
                  </p>
                </div>

                {/* Message */}
                <div
                  className="min-h-0"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {message && (
                    <div
                      className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${
                        message === "Registration successful!"
                          ? "border-emerald-100 bg-emerald-50"
                          : "border-red-100 bg-red-50"
                      }`}
                    >
                      <CheckCircleIcon
                        className={`mt-0.5 h-5 w-5 shrink-0 ${
                          message === "Registration successful!"
                            ? "text-emerald-600"
                            : "text-red-500"
                        }`}
                      />

                      <p
                        className={`text-sm leading-5 ${
                          message === "Registration successful!"
                            ? "text-emerald-700"
                            : "text-red-600"
                        }`}
                      >
                        {message}
                      </p>
                    </div>
                  )}
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading}
                  className="group flex h-12 w-full items-center justify-center rounded-xl bg-[#171717] text-sm font-semibold text-white shadow-sm transition duration-200 hover:bg-neutral-800 hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-neutral-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span>
                    {loading
                      ? "Creating your profile..."
                      : "Create my profile"}
                  </span>

                  {!loading && (
                    <ArrowRightIcon className="ml-2 h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                  )}
                </button>
              </form>

              {/* Login */}
              <div className="my-7 flex items-center gap-4">
                <div className="h-px flex-1 bg-neutral-200" />

                <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-neutral-400">
                  GIAS
                </span>

                <div className="h-px flex-1 bg-neutral-200" />
              </div>

              <div className="text-center">
                <p className="text-sm text-neutral-500">
                  Already have a profile?
                </p>

                <Link
                  href="/login"
                  className="group mt-2 inline-flex items-center gap-2 text-sm font-semibold text-[#171717]"
                >
                  Sign in
                  <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </div>
            </div>

            {/* Trust */}
            <p className="mx-auto mt-6 max-w-sm text-center text-[11px] leading-5 text-neutral-400">
              Your profile develops over time. You remain in control
              of the information that becomes part of it.
            </p>
          </div>
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-between border-t border-neutral-200 pt-5 text-[10px] font-medium uppercase tracking-[0.12em] text-neutral-400">
          <span>GIAS</span>
          <span>Career Intelligence</span>
        </footer>
      </div>
    </main>
  );
}

