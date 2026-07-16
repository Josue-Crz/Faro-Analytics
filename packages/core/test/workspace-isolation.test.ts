import { describe, expect, it } from 'vitest';

import {
  assertMinimumWorkspaceRole,
  assertWorkspaceMembership,
  createWorkspaceScope,
  DemoFaroRepository,
  DemoMembershipRepository,
  demoWorkspace,
  WorkspaceAccessDeniedError,
  WorkspaceRecordNotFoundError,
  type DemoWorkspaceData,
} from '../src';

function createSecondWorkspace(): DemoWorkspaceData {
  const second = structuredClone(demoWorkspace) as DemoWorkspaceData;
  second.workspace = {
    ...second.workspace,
    id: 'ws-other',
    slug: 'other-workspace',
    name: 'Other Workspace',
  };
  second.memberships = [{ workspaceId: 'ws-other', userId: 'user-other-owner', role: 'OWNER' }];

  for (const key of [
    'contacts',
    'organizations',
    'campaigns',
    'interactions',
    'responses',
    'followUps',
    'recommendations',
    'bobRequests',
    'bobDrafts',
    'sheetConnections',
    'sheetSyncs',
    'notifications',
    'auditEvents',
  ] as const) {
    for (const record of second[key]) {
      record.workspaceId = 'ws-other';
    }
  }
  second.contacts[0]!.id = 'contact-other-private';
  return second;
}

describe('workspace membership boundary', () => {
  it('creates a scope only from a stored membership', async () => {
    const memberships = new DemoMembershipRepository(demoWorkspace.memberships);

    await expect(
      createWorkspaceScope(memberships, 'ws-beacon-lab', 'user-maya-chen'),
    ).resolves.toEqual({
      workspaceId: 'ws-beacon-lab',
      userId: 'user-maya-chen',
      role: 'OWNER',
    });
    await expect(
      createWorkspaceScope(memberships, 'ws-other', 'user-maya-chen'),
    ).rejects.toBeInstanceOf(WorkspaceAccessDeniedError);
  });

  it('does not trust a matching user with membership in another workspace', () => {
    expect(() =>
      assertWorkspaceMembership(
        [{ workspaceId: 'ws-other', userId: 'user-maya-chen', role: 'OWNER' }],
        'ws-beacon-lab',
        'user-maya-chen',
      ),
    ).toThrow(WorkspaceAccessDeniedError);
  });

  it('enforces minimum role requirements', () => {
    const scope = assertWorkspaceMembership(
      demoWorkspace.memberships,
      'ws-beacon-lab',
      'user-nadia-patel',
    );

    expect(() => assertMinimumWorkspaceRole(scope, 'MANAGER')).toThrow(WorkspaceAccessDeniedError);
  });
});

describe('demo repository isolation', () => {
  const secondWorkspace = createSecondWorkspace();
  const repository = new DemoFaroRepository([demoWorkspace, secondWorkspace]);
  const beaconScope = assertWorkspaceMembership(
    demoWorkspace.memberships,
    'ws-beacon-lab',
    'user-maya-chen',
  );

  it('filters every collection by the authorized workspace', () => {
    const contacts = repository.listContacts(beaconScope);
    const followUps = repository.listFollowUps(beaconScope);
    const drafts = repository.listBobDrafts(beaconScope);

    expect(contacts).toHaveLength(demoWorkspace.contacts.length);
    expect(contacts.every(({ workspaceId }) => workspaceId === 'ws-beacon-lab')).toBe(true);
    expect(followUps.every(({ workspaceId }) => workspaceId === 'ws-beacon-lab')).toBe(true);
    expect(drafts.every(({ workspaceId }) => workspaceId === 'ws-beacon-lab')).toBe(true);
  });

  it('returns the same not-found result for missing and cross-workspace ids', () => {
    expect(() => repository.getContact(beaconScope, 'contact-other-private')).toThrow(
      WorkspaceRecordNotFoundError,
    );
    expect(() => repository.getContact(beaconScope, 'contact-does-not-exist')).toThrow(
      WorkspaceRecordNotFoundError,
    );
  });

  it('returns defensive copies rather than mutable shared fixture state', () => {
    const first = repository.getContact(beaconScope, 'contact-elena-ruiz');
    first.firstName = 'Changed';

    expect(repository.getContact(beaconScope, 'contact-elena-ruiz').firstName).toBe('Elena');
  });
});
