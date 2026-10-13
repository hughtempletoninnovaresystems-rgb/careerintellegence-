import { NextResponse } from 'next/server';
import { db, sql } from '@vercel/postgres';
import { ZodError } from 'zod';
import { getAuthenticatedUserId } from '@/app/lib/career-intelligence/auth';
import { settingsUpdateSchema } from '@/app/lib/settings/validation';
import { privateHeaders, sameOrigin, settingsError } from '@/app/lib/settings/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const userId = await getAuthenticatedUserId();
    const result = await sql`
      SELECT u.name, u.email,
             COALESCE(s.preferred_role_title, '') AS preferred_role_title,
             COALESCE(s.reduce_motion, FALSE) AS reduce_motion
      FROM users u
      LEFT JOIN user_settings s ON s.user_id = u.id
      WHERE u.id = ${userId}
      LIMIT 1
    `;
    if (!result.rows.length) return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
    const row = result.rows[0];
    return NextResponse.json({
      name: row.name,
      email: row.email,
      preferredRoleTitle: row.preferred_role_title,
      reduceMotion: Boolean(row.reduce_motion),
    }, { headers: privateHeaders });
  } catch (error) {
    return settingsError(error);
  }
}

export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  try {
    const userId = await getAuthenticatedUserId();
    const data = settingsUpdateSchema.parse(await request.json());
    if (data.section === 'profile') {
      // Name is stored in users and the role preference in user_settings.
      // All queries are parameterized; the authenticated user ID is server-derived.
      const client = await db.connect();
      try {
        await client.sql`BEGIN`;
        await client.sql`UPDATE users SET name = ${data.name} WHERE id = ${userId}`;
        await client.sql`
          INSERT INTO user_settings (user_id, preferred_role_title)
          VALUES (${userId}, ${data.preferredRoleTitle})
          ON CONFLICT (user_id) DO UPDATE SET
            preferred_role_title = EXCLUDED.preferred_role_title,
            updated_at = NOW()
        `;
        await client.sql`COMMIT`;
      } catch (error) {
        await client.sql`ROLLBACK`;
        throw error;
      } finally {
        client.release();
      }
      return NextResponse.json({ ok: true, name: data.name, preferredRoleTitle: data.preferredRoleTitle }, { headers: privateHeaders });
    }
    await sql`
      INSERT INTO user_settings (user_id, reduce_motion)
      VALUES (${userId}, ${data.reduceMotion})
      ON CONFLICT (user_id) DO UPDATE SET
        reduce_motion = EXCLUDED.reduce_motion,
        updated_at = NOW()
    `;
    return NextResponse.json({ ok: true, reduceMotion: data.reduceMotion }, { headers: privateHeaders });
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json(
      { error: error.errors[0]?.message || 'Invalid settings.' }, { status: 400 },
    );
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
    return settingsError(error);
  }
}
