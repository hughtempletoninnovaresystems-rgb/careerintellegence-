import { NextResponse } from 'next/server';
import { AuthenticationRequiredError } from '@/app/lib/career-intelligence/errors';

export function sameOrigin(request: Request) {
  // Origin can be absent for same-origin server clients. Reject any supplied
  // Origin that does not exactly match the request's external URL origin.
  const origin = request.headers.get('origin');
  if (!origin) return true;
  const forwardedHost = request.headers.get('x-forwarded-host');
  const host = forwardedHost || request.headers.get('host');
  if (!host) return false;
  const protocol = request.headers.get('x-forwarded-proto') || new URL(request.url).protocol.replace(':', '');
  return origin === `${protocol}://${host}`;
}

export function settingsError(error: unknown) {
  if (error instanceof AuthenticationRequiredError) {
    return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  }
  console.error('Settings request failed', { name: error instanceof Error ? error.name : 'unknown' });
  return NextResponse.json(
    { error: 'Unable to access settings. Confirm the user_settings migration has been applied.' },
    { status: 500 },
  );
}

export const privateHeaders = { 'Cache-Control': 'private, no-store, max-age=0' };
