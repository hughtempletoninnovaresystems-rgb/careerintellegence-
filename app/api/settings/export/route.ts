import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { getAuthenticatedUserId } from '@/app/lib/career-intelligence/auth';
import { settingsError } from '@/app/lib/settings/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Snapshot export of recorded career intelligence. Each query is constrained by
// the authenticated user ID, including child tables through their owning parent.
export async function GET() {
  try {
    const userId = await getAuthenticatedUserId();
    const [account, assessments, roles, capabilities, evidence, knowledge, profileRoles, profileCapabilities] = await Promise.all([
      sql`SELECT id, name, email FROM users WHERE id = ${userId}`,
      sql`SELECT * FROM career_assessments WHERE user_id = ${userId}`,
      sql`SELECT cra.* FROM career_role_assessments cra JOIN career_assessments ca ON ca.id = cra.assessment_id WHERE ca.user_id = ${userId}`,
      sql`SELECT crc.* FROM career_role_capabilities crc JOIN career_role_assessments cra ON cra.id = crc.role_assessment_id JOIN career_assessments ca ON ca.id = cra.assessment_id WHERE ca.user_id = ${userId}`,
      sql`SELECT ce.* FROM career_capability_evidence ce JOIN career_assessments ca ON ca.id = ce.assessment_id WHERE ca.user_id = ${userId}`,
      sql`SELECT * FROM candidate_knowledge WHERE user_id = ${userId}`,
      sql`SELECT * FROM candidate_profile_roles WHERE user_id = ${userId}`,
      sql`SELECT prc.* FROM candidate_profile_role_capabilities prc JOIN candidate_profile_roles pr ON pr.id = prc.candidate_profile_role_id WHERE pr.user_id = ${userId}`,
    ]);
    return new NextResponse(JSON.stringify({
      exportedAt: new Date().toISOString(),
      format: 'career-intelligence-snapshot-v1',
      note: 'Career profile snapshot; not a full personal-data subject-access export.',
      account: account.rows[0] ?? null,
      assessments: assessments.rows,
      roles: roles.rows,
      capabilities: capabilities.rows,
      evidence: evidence.rows,
      candidateKnowledge: knowledge.rows,
      profileRoles: profileRoles.rows,
      profileCapabilities: profileCapabilities.rows,
    }, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="career-intelligence-${new Date().toISOString().slice(0, 10)}.json"`,
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return settingsError(error);
  }
}
