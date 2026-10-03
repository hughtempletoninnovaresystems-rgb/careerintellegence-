import { sql } from "@vercel/postgres";
import type { CareerQueryClient } from "../data/query-client";
import { getCareerSql } from "../db/career-sql";

export type RepositoryProposalSource = {
  assessmentId: string;
  roleAssessmentId: string;
  userId: string;
};

export type RepositoryCapabilityInput = {
  name: string;
  approvedCanonicalCompetencyId?: string | null;
};

type RepositoryObject = {
  id: string;
  lifecycleStatus: string;
  created: boolean;
  usableForProposal: boolean;
};

async function findApprovedRole(
  query: CareerQueryClient["sql"],
  title: string,
) {
  const result = await query`
    SELECT id, lifecycle_status
    FROM roles
    WHERE lifecycle_status='approved'
      AND (
        LOWER(name)=LOWER(${title})
        OR LOWER(job_title)=LOWER(${title})
      )
    ORDER BY created_at
    LIMIT 1
  `;

  return result.rows[0] || null;
}

async function findApprovedCompetency(
  query: CareerQueryClient["sql"],
  name: string,
) {
  const result = await query`
    SELECT id, lifecycle_status
    FROM competencies
    WHERE lifecycle_status='approved'
      AND LOWER(name)=LOWER(${name})
    ORDER BY created_at
    LIMIT 1
  `;

  return result.rows[0] || null;
}

async function findRoleAnyStatus(
  query: CareerQueryClient["sql"],
  title: string,
) {
  const result = await query`
    SELECT id, lifecycle_status
    FROM roles
    WHERE LOWER(name)=LOWER(${title})
       OR LOWER(job_title)=LOWER(${title})
    ORDER BY
      CASE lifecycle_status
        WHEN 'approved' THEN 0
        WHEN 'proposed' THEN 1
        ELSE 2
      END,
      created_at
    LIMIT 1
  `;

  return result.rows[0] || null;
}

async function findCompetencyAnyStatus(
  query: CareerQueryClient["sql"],
  name: string,
) {
  const result = await query`
    SELECT id, lifecycle_status
    FROM competencies
    WHERE LOWER(name)=LOWER(${name})
    ORDER BY
      CASE lifecycle_status
        WHEN 'approved' THEN 0
        WHEN 'proposed' THEN 1
        ELSE 2
      END,
      created_at
    LIMIT 1
  `;

  return result.rows[0] || null;
}

function asRepositoryObject(row: any, created: boolean): RepositoryObject {
  const lifecycleStatus = String(row.lifecycle_status);

  return {
    id: String(row.id),
    lifecycleStatus,
    created,
    // A rejected global repository object must never be silently reused or
    // reactivated by a candidate assessment. Governance must resolve it.
    usableForProposal: lifecycleStatus !== "rejected",
  };
}

async function ensureRepositoryRole({
  query,
  title,
  description,
  source,
}: {
  query: CareerQueryClient["sql"];
  title: string;
  description?: string | null;
  source: RepositoryProposalSource;
}): Promise<RepositoryObject> {
  /*
   * CI-DRWP-007:
   *
   * Perform the approved canonical lookup through the same query executor as
   * the remainder of repository acquisition. Calling findCanonicalRole() here
   * would escape the connected transaction because that repository helper uses
   * global sql.
   */
  const approved = await findApprovedRole(query, title);

  if (approved) {
    return {
      id: String(approved.id),
      lifecycleStatus: "approved",
      created: false,
      usableForProposal: true,
    };
  }

  const existing = await findRoleAnyStatus(query, title);

  if (existing) {
    return asRepositoryObject(existing, false);
  }

  const result = await query`
    INSERT INTO roles (
      name,
      job_title,
      description,
      lifecycle_status,
      source_type,
      source_assessment_id,
      source_role_assessment_id,
      source_user_id,
      updated_at
    )
    VALUES (
      ${title},
      ${title},
      ${description || null},
      'proposed',
      'candidate_assessment',
      ${source.assessmentId},
      ${source.roleAssessmentId},
      ${source.userId},
      NOW()
    )
    ON CONFLICT (name)
    DO NOTHING
    RETURNING id, lifecycle_status
  `;

  if (result.rows.length) {
    return asRepositoryObject(result.rows[0], true);
  }

  // Covers a concurrent insert or an exact-name conflict without rewriting
  // the provenance of the existing repository record.
  const concurrent = await findRoleAnyStatus(query, title);

  if (!concurrent) {
    throw new Error("Unable to establish repository role proposal.");
  }

  return asRepositoryObject(concurrent, false);
}

async function ensureRepositoryCompetency({
  query,
  name,
  source,
}: {
  query: CareerQueryClient["sql"];
  name: string;
  source: RepositoryProposalSource;
}): Promise<RepositoryObject> {
  /*
   * CI-DRWP-007:
   *
   * As with roles, the approved competency lookup must use the connected
   * transaction client rather than findCompetency()/global sql.
   */
  const approved = await findApprovedCompetency(query, name);

  if (approved) {
    return {
      id: String(approved.id),
      lifecycleStatus: "approved",
      created: false,
      usableForProposal: true,
    };
  }

  const existing = await findCompetencyAnyStatus(query, name);

  if (existing) {
    return asRepositoryObject(existing, false);
  }

  const result = await query`
    INSERT INTO competencies (
      name,
      lifecycle_status,
      source_type,
      source_assessment_id,
      source_role_assessment_id,
      source_user_id
    )
    VALUES (
      ${name},
      'proposed',
      'candidate_assessment',
      ${source.assessmentId},
      ${source.roleAssessmentId},
      ${source.userId}
    )
    ON CONFLICT (name)
    DO NOTHING
    RETURNING id, lifecycle_status
  `;

  if (result.rows.length) {
    return asRepositoryObject(result.rows[0], true);
  }

  const concurrent = await findCompetencyAnyStatus(query, name);

  if (!concurrent) {
    throw new Error("Unable to establish repository capability proposal.");
  }

  return asRepositoryObject(concurrent, false);
}

async function ensureRoleCompetencyRelationship({
  query,
  roleId,
  competencyId,
  source,
}: {
  query: CareerQueryClient["sql"];
  roleId: string;
  competencyId: string;
  source: RepositoryProposalSource;
}): Promise<RepositoryObject> {
  const existing = await query`
    SELECT id, lifecycle_status
    FROM role_competencies
    WHERE role_id=${roleId}
      AND competency_id=${competencyId}
    LIMIT 1
  `;

  if (existing.rows.length) {
    return asRepositoryObject(existing.rows[0], false);
  }

  const result = await query`
    INSERT INTO role_competencies (
      role_id,
      competency_id,
      importance,
      lifecycle_status,
      source_type,
      source_role_assessment_id,
      source_user_id
    )
    VALUES (
      ${roleId},
      ${competencyId},
      0.5,
      'proposed',
      'candidate_assessment',
      ${source.roleAssessmentId},
      ${source.userId}
    )
    ON CONFLICT (role_id, competency_id)
    DO NOTHING
    RETURNING id, lifecycle_status
  `;

  if (result.rows.length) {
    return asRepositoryObject(result.rows[0], true);
  }

  const concurrent = await query`
    SELECT id, lifecycle_status
    FROM role_competencies
    WHERE role_id=${roleId}
      AND competency_id=${competencyId}
    LIMIT 1
  `;

  if (!concurrent.rows.length) {
    throw new Error("Unable to establish repository role-capability proposal.");
  }

  return asRepositoryObject(concurrent.rows[0], false);
}

/**
 * Seeds repository intelligence from user-approved profile evidence without
 * treating newly proposed repository objects as approved CKM knowledge.
 * Candidate profile persistence must continue to use only already-approved
 * canonical identifiers; this service's proposed identifiers are governance
 * records, not profile approval shortcuts.
 *
 * Existing rejected CKM objects/relationships are never reactivated here.
 * They are reported as governance conflicts so that candidate profile
 * persistence remains independent from global repository governance.
 *
 * CI-DRWP-007:
 * When a connected client is supplied, every repository read/write performed
 * by this service uses that client and therefore participates in the caller's
 * transaction. Existing callers that do not supply a client retain the
 * previous global-sql behaviour.
 */
export async function proposeRepositoryKnowledge({
  roleTitle,
  roleDescription,
  source,
  capabilities,
  client,
}: {
  roleTitle: string;
  roleDescription?: string | null;
  source: RepositoryProposalSource;
  capabilities: RepositoryCapabilityInput[];
  client?: CareerQueryClient;
}) {
  const query = getCareerSql(client);

  const repositoryRole = await ensureRepositoryRole({
    query,
    title: roleTitle,
    description: roleDescription,
    source,
  });

  let proposedCompetenciesCreated = 0;
  let relationshipsCreated = 0;
  let governanceConflicts = 0;

  // A rejected role identity cannot be reused as the parent of new repository
  // intelligence. Candidate profile promotion may still proceed independently.
  if (!repositoryRole.usableForProposal) {
    return {
      repositoryRoleId: null,
      repositoryRoleCreated: false,
      proposedCompetenciesCreated,
      relationshipsCreated,
      governanceConflicts: 1,
    };
  }

  for (const capability of capabilities) {
    const cleanName = capability.name.trim();

    if (!cleanName) {
      continue;
    }

    const competency = capability.approvedCanonicalCompetencyId
      ? {
          id: capability.approvedCanonicalCompetencyId,
          lifecycleStatus: "approved",
          created: false,
          usableForProposal: true,
        }
      : await ensureRepositoryCompetency({
          query,
          name: cleanName,
          source,
        });

    if (!competency.usableForProposal) {
      governanceConflicts += 1;
      continue;
    }

    if (competency.created) {
      proposedCompetenciesCreated += 1;
    }

    const relationship = await ensureRoleCompetencyRelationship({
      query,
      roleId: repositoryRole.id,
      competencyId: competency.id,
      source,
    });

    if (!relationship.usableForProposal) {
      governanceConflicts += 1;
      continue;
    }

    if (relationship.created) {
      relationshipsCreated += 1;
    }
  }

  return {
    repositoryRoleId: repositoryRole.id,
    repositoryRoleCreated: repositoryRole.created,
    proposedCompetenciesCreated,
    relationshipsCreated,
    governanceConflicts,
  };
}