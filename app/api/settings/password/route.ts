import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import bcrypt from 'bcryptjs';
import { ZodError } from 'zod';
import { getAuthenticatedUserId } from '@/app/lib/career-intelligence/auth';
import { passwordUpdateSchema } from '@/app/lib/settings/validation';
import { privateHeaders, sameOrigin, settingsError } from '@/app/lib/settings/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  try {
    const userId = await getAuthenticatedUserId();
    const { currentPassword, newPassword } = passwordUpdateSchema.parse(await request.json());
    const result = await sql`SELECT password FROM users WHERE id = ${userId} LIMIT 1`;
    const currentHash = result.rows[0]?.password as string | undefined;
    if (!currentHash || !(await bcrypt.compare(currentPassword, currentHash))) {
      return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 400, headers: privateHeaders });
    }
    if (await bcrypt.compare(newPassword, currentHash)) {
      return NextResponse.json({ error: 'Choose a different password.' }, { status: 400, headers: privateHeaders });
    }
    const nextHash = await bcrypt.hash(newPassword, 12);
    const updated = await sql`
      UPDATE users SET password = ${nextHash}
      WHERE id = ${userId} AND password = ${currentHash}
      RETURNING id
    `;
    if (!updated.rows.length) return NextResponse.json({ error: 'Password changed in another session. Try again.' }, { status: 409 });
    return NextResponse.json({ ok: true }, { headers: privateHeaders });
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: error.errors[0]?.message || 'Invalid password.' }, { status: 400 });
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
    return settingsError(error);
  }
}
