import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const requiredFiles = [
  'app/lib/career-intelligence/auth.ts',
  'app/lib/career-intelligence/config.ts',
  'app/lib/career-intelligence/ai/provider.ts',
  'app/lib/career-intelligence/ai/schemas.ts',
  'app/lib/career-intelligence/data/assessments.ts',
  'app/lib/career-intelligence/data/repository.ts',
  'app/lib/career-intelligence/data/staging.ts',
  'app/lib/career-intelligence/domain/intelligence-contract.ts',
  'app/lib/career-intelligence/domain/workflow.ts',
  'app/lib/career-intelligence/http/request-schemas.ts',
  'app/lib/career-intelligence/services/capability-review.ts',
  'app/lib/career-intelligence/services/clarification.ts',
  'app/lib/career-intelligence/services/final-review.ts',
  'app/lib/career-intelligence/services/profile-promotion.ts',
  'app/lib/career-intelligence/services/repository-enrichment.ts',
  'app/lib/career-intelligence/services/role-context.ts',
  'app/lib/career-intelligence/services/role-lifecycle.ts',
  'app/lib/career-intelligence/services/role-snapshot.ts',
  'app/lib/career-intelligence/services/role-submission.ts',
  'migrations/20260917_capability_intelligence_foundation.sql',
];

const problems = [];
for (const relative of requiredFiles) {
  if (!fs.existsSync(path.join(root, relative))) {
    problems.push(`Missing required restructure file: ${relative}`);
  }
}

const routeFiles = [
  'app/api/analyse-cv/route.ts',
  'app/api/no-cv/route.ts',
];

for (const relative of routeFiles) {
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  if (source.includes('new GoogleGenAI(')) {
    problems.push(`${relative} constructs an AI provider directly instead of using the shared provider boundary.`);
  }
  if (source.includes('async function getAuthenticatedUserId(')) {
    problems.push(`${relative} contains a duplicate authentication resolver.`);
  }
  if (source.includes('async function verifyRoleOwnership(')) {
    problems.push(`${relative} contains a duplicate object-ownership check.`);
  }
}


const repositorySource = fs.readFileSync(
  path.join(root, 'app/lib/career-intelligence/data/repository.ts'),
  'utf8',
);

const approvedLookupCount = (repositorySource.match(/lifecycle_status='approved'/g) || []).length;
if (approvedLookupCount < 2) {
  problems.push('Canonical role/capability lookup is not explicitly restricted to approved repository knowledge.');
}

for (const relative of routeFiles) {
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  if (source.includes('async function getOrCreateCanonicalCompetency(')) {
    problems.push(`${relative} still contains duplicate repository competency proposal logic.`);
  }
  if (source.includes('async function finalSubmissionCheck(')) {
    problems.push(`${relative} still contains duplicate final-submission AI logic.`);
  }
  if (source.includes('async function promoteRole(')) {
    problems.push(`${relative} still contains duplicate profile-promotion logic.`);
  }
  if (!source.includes('submitRoleForProfile')) {
    problems.push(`${relative} does not use the shared role-submission lifecycle.`);
  }
}



const promotionSource = fs.readFileSync(
  path.join(root, 'app/lib/career-intelligence/services/profile-promotion.ts'),
  'utf8',
);
if (!promotionSource.includes('proposeRepositoryKnowledge')) {
  problems.push('Profile promotion does not use the shared repository-enrichment boundary.');
}

const enrichmentSource = fs.readFileSync(
  path.join(root, 'app/lib/career-intelligence/services/repository-enrichment.ts'),
  'utf8',
);
if (!enrichmentSource.includes('usableForProposal') || !enrichmentSource.includes('lifecycleStatus !== "rejected"')) {
  problems.push('Repository enrichment does not explicitly prevent rejected CKM knowledge from being reactivated.');
}

const clientRoot = path.join(root, 'app', 'ui');
function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

for (const file of walk(clientRoot).filter((file) => /\.(ts|tsx|js|jsx)$/.test(file))) {
  const source = fs.readFileSync(file, 'utf8');
  if (/process\.env\.(?:GEMINI_API_KEY|OPENAI_API_KEY|POSTGRES_URL|AUTH_SECRET|NEXTAUTH_SECRET)/.test(source)) {
    problems.push(`${path.relative(root, file)} references a server secret from UI code.`);
  }
}

if (problems.length) {
  console.error('Career Intelligence structural verification failed:');
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log(`Career Intelligence structural verification passed (${requiredFiles.length} required files; ${routeFiles.length} routes checked).`);
