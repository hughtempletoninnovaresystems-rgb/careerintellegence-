// Dependency-free static regression checks. These cannot substitute DB/API tests.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (path) => readFileSync(path, 'utf8');
for (const name of ['analyse-cv', 'no-cv']) {
  const route = read(`app/api/${name}/route.ts`);
  const start = route.indexOf('async function reassessEditedCapability(');
  const end = route.indexOf('async function handleReviewCapability(', start);
  assert.ok(start !== -1 && end > start, `edit handler missing: ${name}`);
  const handler = route.slice(start, end);
  assert.doesNotMatch(handler, /^\u00a0/m, `Non-breaking indentation remains in ${name} edit handler`);
  for (const match of handler.matchAll(/sql`[\s\S]*?`/g)) {
    assert.ok(!match[0].includes('\u00a0'), `Nonbreaking SQL whitespace ${name}`);
  }
  assert.match(route, /case "add_capability"/, `candidate add missing in ${name}`);
}
const clarification = read('app/lib/career-intelligence/services/clarification.ts');
for (const fragment of [
  'await client.sql`BEGIN`', 'await client.sql`COMMIT`', 'await client.sql`ROLLBACK`',
  'recordSuccessGateAtomic(client', 'addClarificationRound(roleAssessmentId, followUps, client)',
  'await loadStagedCapabilityIdentities(roleAssessmentId, client)',
  'evidenceRelationshipType: "context"', 'existingEmerging.id',
]) assert.ok(clarification.includes(fragment), fragment);
assert.ok(!clarification.includes("review_status='accepted'"), 'auto accepted gap');
const provider = read('app/lib/career-intelligence/ai/provider.ts');
assert.match(provider, /const provider = careerIntelligenceConfig.aiProvider/);
assert.doesNotMatch(provider, /GoogleGenAI|pilotProvider/, 'Every prompt must use the shared OpenAI configuration');
const config = read('app/lib/career-intelligence/config.ts');
assert.match(config, /aiProvider: "openai"/);
assert.match(config, /aiModel: "gpt-6\.1-sol"/);
assert.match(config, /aiReasoningEffort: "medium"/);
assert.match(read('app/lib/career-intelligence/services/revised-pilot.ts'), /CAREER_REVISED_PILOT_ENABLED/);
assert.match(read('app/lib/career-intelligence/ai/schemas.ts'), /followUpQuestion: z\.string\(\)\.trim\(\)\.min\(1\)\.max\(5_000\)\.nullable\(\)/);
assert.match(read('app/ui/dashboard/cvupload.tsx'), /useCareerProcessing\(\)/);
assert.match(read('app/lib/career-intelligence/services/role-submission.ts'), /unresolved_evidence_review_required/);
console.log('Work pack v1.2 static checks passed: 2 edit handlers, safe legacy policy, transaction/contract/action anchors.');
