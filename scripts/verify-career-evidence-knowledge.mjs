/** Static regression checks requiring no external packages or credentials. */
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');
const knowledge = read('app/lib/career-intelligence/data/knowledge.ts');
const evidence = read('app/lib/career-intelligence/data/evidence.ts');
const profile = read('app/lib/career-intelligence/data/profile.ts');
const experience = read('app/lib/career-intelligence/data/experience.ts');
const browser = read('app/dashboard/evidence/evidence-browser.tsx');
const detail = read('app/dashboard/evidence/[id]/page.tsx');

for (const [name, source, required] of [
  ['Knowledge records', knowledge, ['candidate_knowledge', 'competencies', 'candidate_profile_role_capabilities', 'getAuthenticatedUserId', 'user_id = ${userId}', 'experience_ids']],
  ['Knowledge evidence', evidence, ['knowledge_evidence', 'candidate_knowledge', 'ke.candidate_knowledge_id', 'ck.user_id = ${userId}', 'knowledge_areas']],
  ['Career evidence', evidence, ['career_capability_evidence', 'career_capability_evidence_links', 'linked_assessment.user_id = ${userId}', 'ca.user_id = ${userId}']],
  ['Profile evidence', evidence, ['candidate_profile_role_capabilities', 'candidate_profile_roles', 'pr.user_id = ${userId}']],
  ['Knowledge summary', profile, ['candidate_knowledge', 'candidate_profile_role_capabilities', 'career_role_capabilities']],
  ['Experience knowledge summary', experience, ['candidate_knowledge', 'knowledge_evidence']],
  ['Evidence browser', browser, ['Search evidence', 'All experiences', 'All capabilities', 'All sources', 'All statuses', 'View evidence']],
  ['Evidence detail', detail, ['Evidence quality', 'Context', 'Action demonstrated', 'Outcome demonstrated', 'Profile connections']],
]) {
  for (const marker of required) assert.ok(source.includes(marker), `${name} missing ${marker}`);
}
for (const file of [
  'app/dashboard/evidence/page.tsx', 'app/dashboard/evidence/[id]/page.tsx',
  'app/dashboard/knowledge/page.tsx', 'app/dashboard/knowledge/[id]/page.tsx',
]) {
  const source = read(file);
  assert.ok(!source.includes('sql`') && !source.includes('@vercel/postgres'), `SQL leaked into ${file}`);
}
assert.ok(read('app/ui/dashboard/nav-links.tsx').includes("href: '/dashboard/evidence'"));
assert.ok(read('app/dashboard/capabilities/[id]/page.tsx').includes('/dashboard/evidence/career-'));
console.log('Knowledge ownership, all three evidence sources, routes and audit-view structure verified.');
