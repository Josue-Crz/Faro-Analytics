import type { Membership, WorkspaceRole, WorkspaceScopedRecord } from './domain';

export const workspaceRoleRank: Readonly<Record<WorkspaceRole, number>> = {
  OWNER: 50,
  ADMIN: 40,
  MANAGER: 30,
  MEMBER: 20,
  VIEWER: 10,
};

const workspaceScopeBrand: unique symbol = Symbol('FaroWorkspaceScope');

export interface WorkspaceScope {
  readonly workspaceId: string;
  readonly userId: string;
  readonly role: WorkspaceRole;
  /** Nominal brand: scopes must come from a server-side membership check. */
  readonly [workspaceScopeBrand]: true;
}

export interface MembershipRepository {
  findMembership(workspaceId: string, userId: string): Promise<Membership | null>;
}

export class WorkspaceAccessDeniedError extends Error {
  readonly code = 'WORKSPACE_ACCESS_DENIED';

  constructor(
    readonly workspaceId: string,
    readonly userId: string,
    message = 'You do not have access to this workspace.',
  ) {
    super(message);
    this.name = 'WorkspaceAccessDeniedError';
  }
}

export class WorkspaceRecordNotFoundError extends Error {
  readonly code = 'WORKSPACE_RECORD_NOT_FOUND';

  constructor(
    readonly entity: string,
    readonly id: string,
  ) {
    super(`${entity} ${id} was not found in the authorized workspace.`);
    this.name = 'WorkspaceRecordNotFoundError';
  }
}

export function assertWorkspaceMembership(
  memberships: readonly Membership[],
  workspaceId: string,
  userId: string,
  allowedRoles?: readonly WorkspaceRole[],
): WorkspaceScope {
  const membership = memberships.find(
    (candidate) => candidate.workspaceId === workspaceId && candidate.userId === userId,
  );

  if (!membership || (allowedRoles && !allowedRoles.includes(membership.role))) {
    throw new WorkspaceAccessDeniedError(workspaceId, userId);
  }

  return makeWorkspaceScope(workspaceId, userId, membership.role);
}

export function assertMinimumWorkspaceRole(
  scope: WorkspaceScope,
  minimumRole: WorkspaceRole,
): void {
  if (workspaceRoleRank[scope.role] < workspaceRoleRank[minimumRole]) {
    throw new WorkspaceAccessDeniedError(
      scope.workspaceId,
      scope.userId,
      `The ${minimumRole.toLowerCase()} role or higher is required.`,
    );
  }
}

export function assertWorkspaceRecord<T extends WorkspaceScopedRecord>(
  scope: WorkspaceScope,
  record: T | null | undefined,
  entity = 'Record',
  id = 'unknown',
): T {
  if (!record || record.workspaceId !== scope.workspaceId) {
    // Deliberately return a not-found error for both missing and cross-tenant records.
    // This avoids disclosing whether an identifier exists in another workspace.
    throw new WorkspaceRecordNotFoundError(entity, id);
  }
  return record;
}

export function filterWorkspaceRecords<T extends WorkspaceScopedRecord>(
  scope: WorkspaceScope,
  records: readonly T[],
): T[] {
  return records.filter((record) => record.workspaceId === scope.workspaceId);
}

export class MembershipService {
  constructor(private readonly memberships: MembershipRepository) {}

  async createWorkspaceScope(
    workspaceId: string,
    userId: string,
    allowedRoles?: readonly WorkspaceRole[],
  ): Promise<WorkspaceScope> {
    const membership = await this.memberships.findMembership(workspaceId, userId);
    if (!membership || (allowedRoles && !allowedRoles.includes(membership.role))) {
      throw new WorkspaceAccessDeniedError(workspaceId, userId);
    }
    return makeWorkspaceScope(workspaceId, userId, membership.role);
  }
}

export async function createWorkspaceScope(
  memberships: MembershipRepository,
  workspaceId: string,
  userId: string,
  allowedRoles?: readonly WorkspaceRole[],
): Promise<WorkspaceScope> {
  return new MembershipService(memberships).createWorkspaceScope(workspaceId, userId, allowedRoles);
}

function makeWorkspaceScope(
  workspaceId: string,
  userId: string,
  role: WorkspaceRole,
): WorkspaceScope {
  const scope = { workspaceId, userId, role } as WorkspaceScope;
  Object.defineProperty(scope, workspaceScopeBrand, { value: true });
  return Object.freeze(scope);
}
