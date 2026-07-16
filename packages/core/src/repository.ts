import { demoWorkspace } from './demo-data';
import type {
  AnalyticsData,
  BobDraft,
  BobGenerationRequest,
  Campaign,
  Contact,
  DashboardData,
  DemoWorkspaceData,
  FollowUpTask,
  IntegrationStatus,
  Membership,
  NotificationRecord,
  Organization,
  OutreachRecommendation,
  SheetConnection,
  SheetSyncRun,
} from './domain';
import {
  assertWorkspaceRecord,
  filterWorkspaceRecords,
  WorkspaceRecordNotFoundError,
  type MembershipRepository,
  type WorkspaceScope,
} from './workspace';

function copy<T>(value: T): T {
  return structuredClone(value);
}

export class DemoMembershipRepository implements MembershipRepository {
  constructor(private readonly memberships: readonly Membership[] = demoWorkspace.memberships) {}

  async findMembership(workspaceId: string, userId: string): Promise<Membership | null> {
    return (
      this.memberships.find(
        (membership) => membership.workspaceId === workspaceId && membership.userId === userId,
      ) ?? null
    );
  }
}

/**
 * Explicit fixture repository used by the product tour. It mirrors the
 * workspace-scoped shape expected from a database repository, but never claims
 * persistence or a configured external integration.
 */
export class DemoFaroRepository {
  constructor(private readonly datasets: readonly DemoWorkspaceData[] = [demoWorkspace]) {}

  getWorkspace(scope: WorkspaceScope): DemoWorkspaceData['workspace'] {
    const dataset = this.datasets.find((candidate) => candidate.workspace.id === scope.workspaceId);
    if (!dataset) {
      throw new WorkspaceRecordNotFoundError('Workspace', scope.workspaceId);
    }
    return copy(dataset.workspace);
  }

  getWorkspaceSnapshot(scope: WorkspaceScope): DemoWorkspaceData {
    const dataset = this.getDataset(scope);
    return copy(dataset);
  }

  getDashboard(scope: WorkspaceScope): DashboardData {
    return copy(this.getDataset(scope).dashboard);
  }

  getAnalytics(scope: WorkspaceScope): AnalyticsData {
    return copy(this.getDataset(scope).analytics);
  }

  getIntegrationStatus(scope: WorkspaceScope): IntegrationStatus {
    return copy(this.getDataset(scope).integrationStatus);
  }

  listContacts(scope: WorkspaceScope): Contact[] {
    return copy(
      filterWorkspaceRecords(
        scope,
        this.datasets.flatMap(({ contacts }) => contacts),
      ),
    );
  }

  getContact(scope: WorkspaceScope, id: string): Contact {
    return copy(
      assertWorkspaceRecord(
        scope,
        this.datasets.flatMap(({ contacts }) => contacts).find((record) => record.id === id),
        'Contact',
        id,
      ),
    );
  }

  listOrganizations(scope: WorkspaceScope): Organization[] {
    return copy(
      filterWorkspaceRecords(
        scope,
        this.datasets.flatMap(({ organizations }) => organizations),
      ),
    );
  }

  getOrganization(scope: WorkspaceScope, id: string): Organization {
    return copy(
      assertWorkspaceRecord(
        scope,
        this.datasets
          .flatMap(({ organizations }) => organizations)
          .find((record) => record.id === id),
        'Organization',
        id,
      ),
    );
  }

  listCampaigns(scope: WorkspaceScope): Campaign[] {
    return copy(
      filterWorkspaceRecords(
        scope,
        this.datasets.flatMap(({ campaigns }) => campaigns),
      ),
    );
  }

  getCampaign(scope: WorkspaceScope, id: string): Campaign {
    return copy(
      assertWorkspaceRecord(
        scope,
        this.datasets.flatMap(({ campaigns }) => campaigns).find((record) => record.id === id),
        'Campaign',
        id,
      ),
    );
  }

  listFollowUps(scope: WorkspaceScope): FollowUpTask[] {
    return copy(
      filterWorkspaceRecords(
        scope,
        this.datasets.flatMap(({ followUps }) => followUps),
      ),
    );
  }

  getFollowUp(scope: WorkspaceScope, id: string): FollowUpTask {
    return copy(
      assertWorkspaceRecord(
        scope,
        this.datasets.flatMap(({ followUps }) => followUps).find((record) => record.id === id),
        'FollowUpTask',
        id,
      ),
    );
  }

  listRecommendations(scope: WorkspaceScope): OutreachRecommendation[] {
    return copy(
      filterWorkspaceRecords(
        scope,
        this.datasets.flatMap(({ recommendations }) => recommendations),
      ),
    );
  }

  listBobRequests(scope: WorkspaceScope): BobGenerationRequest[] {
    return copy(
      filterWorkspaceRecords(
        scope,
        this.datasets.flatMap(({ bobRequests }) => bobRequests),
      ),
    );
  }

  getBobRequest(scope: WorkspaceScope, id: string): BobGenerationRequest {
    return copy(
      assertWorkspaceRecord(
        scope,
        this.datasets.flatMap(({ bobRequests }) => bobRequests).find((record) => record.id === id),
        'BobGenerationRequest',
        id,
      ),
    );
  }

  listBobDrafts(scope: WorkspaceScope): BobDraft[] {
    return copy(
      filterWorkspaceRecords(
        scope,
        this.datasets.flatMap(({ bobDrafts }) => bobDrafts),
      ),
    );
  }

  getBobDraft(scope: WorkspaceScope, id: string): BobDraft {
    return copy(
      assertWorkspaceRecord(
        scope,
        this.datasets.flatMap(({ bobDrafts }) => bobDrafts).find((record) => record.id === id),
        'BobDraft',
        id,
      ),
    );
  }

  listSheetConnections(scope: WorkspaceScope): SheetConnection[] {
    return copy(
      filterWorkspaceRecords(
        scope,
        this.datasets.flatMap(({ sheetConnections }) => sheetConnections),
      ),
    );
  }

  listSheetSyncs(scope: WorkspaceScope): SheetSyncRun[] {
    return copy(
      filterWorkspaceRecords(
        scope,
        this.datasets.flatMap(({ sheetSyncs }) => sheetSyncs),
      ),
    );
  }

  listNotifications(scope: WorkspaceScope): NotificationRecord[] {
    return copy(
      filterWorkspaceRecords(
        scope,
        this.datasets.flatMap(({ notifications }) => notifications),
      ),
    );
  }

  private getDataset(scope: WorkspaceScope): DemoWorkspaceData {
    const dataset = this.datasets.find((candidate) => candidate.workspace.id === scope.workspaceId);
    if (!dataset) {
      throw new WorkspaceRecordNotFoundError('Workspace', scope.workspaceId);
    }
    return dataset;
  }
}

export const demoMembershipRepository = new DemoMembershipRepository();
export const demoRepository = new DemoFaroRepository();
