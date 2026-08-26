'use client';

import {
  AtSymbolIcon,
  KeyIcon,
  ExclamationCircleIcon,
  EyeIcon,
  EyeSlashIcon,
} from '@heroicons/react/24/outline';
import { ArrowRightIcon } from '@heroicons/react/20/solid';
import { Button } from '@/app/ui/button';
import { useFormState, useFormStatus } from 'react-dom';
import { useState } from 'react';
import { authenticate } from '@/app/lib/actions';
import Link from 'next/link';

export default function LoginForm() {
  const [errorMessage, dispatch] = useFormState(
    authenticate,
    undefined,
  );

  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={dispatch} className="space-y-5">

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
            required
            autoComplete="email"
            className="block h-12 w-full rounded-xl border border-neutral-200 bg-[#fafafa] pl-11 pr-4 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 hover:border-neutral-300 focus:border-neutral-800 focus:bg-white focus:ring-4 focus:ring-neutral-100"
          />
        </div>
      </div>

      {/* Password */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label
            htmlFor="password"
            className="block text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600"
          >
            Password
          </label>

          <Link
            href="#"
            className="text-xs font-medium text-neutral-400 transition hover:text-neutral-800"
          >
            Forgot password?
          </Link>
        </div>

        <div className="relative">
          <KeyIcon className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-neutral-400" />

          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            name="password"
            placeholder="Enter your password"
            required
            minLength={6}
            autoComplete="current-password"
            className="block h-12 w-full rounded-xl border border-neutral-200 bg-[#fafafa] pl-11 pr-12 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 hover:border-neutral-300 focus:border-neutral-800 focus:bg-white focus:ring-4 focus:ring-neutral-100"
          />

          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            aria-label={
              showPassword ? 'Hide password' : 'Show password'
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
      </div>

      {/* Error */}
      <div
        className="min-h-0"
        aria-live="polite"
        aria-atomic="true"
      >
        {errorMessage && (
          <div className="flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3">
            <ExclamationCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />

            <p className="text-sm leading-5 text-red-600">
              {errorMessage}
            </p>
          </div>
        )}
      </div>

      <LoginButton />
    </form>
  );
}

function LoginButton() {
  const { pending } = useFormStatus();

  return (
    <Button
      className="group flex h-12 w-full items-center justify-center rounded-xl bg-[#171717] text-sm font-semibold text-white shadow-sm transition duration-200 hover:bg-neutral-800 hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-neutral-200 disabled:cursor-not-allowed disabled:opacity-60"
      aria-disabled={pending}
      disabled={pending}
    >
      <span>
        {pending ? 'Signing you in…' : 'Sign in'}
      </span>

      {!pending && (
        <ArrowRightIcon className="ml-2 h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
      )}
    </Button>
  );
}
