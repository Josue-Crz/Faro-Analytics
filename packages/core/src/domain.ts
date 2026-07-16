export type IsoDateTime = string;

export type WorkspaceRole = 'OWNER' | 'ADMIN' | 'MANAGER' | 'MEMBER' | 'VIEWER';
export type ContactType =
  'PARTICIPANT' | 'SPONSOR' | 'PARTNER' | 'DONOR' | 'SPEAKER' | 'VENDOR' | 'OTHER';
export type ContactChannel = 'EMAIL' | 'PHONE' | 'SMS' | 'MEETING' | 'SOCIAL' | 'OTHER';
export type ConsentStatus = 'OPTED_IN' | 'IMPLIED' | 'UNKNOWN' | 'OPTED_OUT';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type SignalStatus = 'CLEAR_SIGNAL' | 'NEEDS_ATTENTION' | 'DATA_INSUFFICIENT' | 'ON_TRACK';
export type CampaignStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED';
export type FollowUpStatus = 'OPEN' | 'SNOOZED' | 'COMPLETED' | 'CANCELLED';
export type BobGenerationStatus =
  'AWAITING_BOB' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type DraftProvenance = 'DEMO_DRAFT' | 'IBM_BOB';
export type DraftApprovalStatus = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'SUPERSEDED';

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  defaultTimezone: string;
  quietHoursStart: string;
  quietHoursEnd: string;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface UserSummary {
  id: string;
  name: string;
  email: string;
  timezone: string;
  initials: string;
}

export interface Membership {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
}

export interface Organization {
  id: string;
  workspaceId: string;
  name: string;
  type:
    | 'SPONSOR'
    | 'PARTNER'
    | 'NONPROFIT'
    | 'CORPORATION'
    | 'EDUCATION'
    | 'GOVERNMENT'
    | 'VENDOR'
    | 'OTHER';
  industry: string;
  website: string;
  sponsorshipStage: string;
  estimatedValue: number;
  weightedValue: number;
  interestAreas: string[];
  tags: string[];
  decisionMakerContactIds: string[];
  contactCount: number;
  lastActivityAt: IsoDateTime;
}

export interface Contact {
  id: string;
  workspaceId: string;
  organizationId: string | null;
  type: ContactType;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  phone: string | null;
  title: string;
  timezone: string;
  preferredChannel: ContactChannel;
  source: string;
  tags: string[];
  customFields: Record<string, string | number | boolean | null>;
  consentStatus: ConsentStatus;
  suppressedAt: IsoDateTime | null;
  externalId: string;
  ownerId: string;
  campaignIds: string[];
  status: 'ENGAGED' | 'AWAITING_RESPONSE' | 'FOLLOW_UP_DUE' | 'SUPPRESSED' | 'NEW';
  lastInteractionAt: IsoDateTime | null;
  nextActionAt: IsoDateTime | null;
}

export interface Campaign {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  type:
    'SPONSORSHIP' | 'PARTICIPANT_OUTREACH' | 'PARTNERSHIP' | 'FUNDRAISING' | 'EVENT' | 'COMMUNITY';
  objective: string;
  status: CampaignStatus;
  ownerId: string;
  ownerName: string;
  startAt: IsoDateTime;
  endAt: IsoDateTime;
  defaultTone:
    | 'PROFESSIONAL'
    | 'WARM'
    | 'CONCISE'
    | 'CONSULTATIVE'
    | 'PARTNERSHIP_FOCUSED'
    | 'SPONSORSHIP_FOCUSED';
  contactIds: string[];
  responseRate: number;
  positiveResponseRate: number;
  outreachSent: number;
  responses: number;
  followUpsDue: number;
  estimatedValue: number;
  weightedValue: number;
}

export interface Interaction {
  id: string;
  workspaceId: string;
  campaignId: string | null;
  contactId: string;
  channel: ContactChannel;
  direction: 'OUTBOUND' | 'INBOUND';
  subject: string;
  bodyText: string;
  occurredAt: IsoDateTime;
  deliveryStatus: 'QUEUED' | 'SENT' | 'DELIVERED' | 'BOUNCED' | 'FAILED' | 'RECEIVED';
}

export interface OutreachResponse {
  id: string;
  workspaceId: string;
  interactionId: string;
  classification:
    | 'INTERESTED'
    | 'NEEDS_MORE_INFORMATION'
    | 'MEETING_REQUESTED'
    | 'REFERRED'
    | 'FOLLOW_UP_LATER'
    | 'DECLINED'
    | 'OUT_OF_OFFICE'
    | 'UNSUBSCRIBE'
    | 'NO_ACTIONABLE_INTENT'
    | 'AMBIGUOUS';
  sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'MIXED';
  urgency: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  responseTimeMinutes: number;
  humanReviewed: boolean;
  keyQuestion: string | null;
  recommendedNextAction: string;
}

export interface OutreachRecommendation {
  id: string;
  workspaceId: string;
  campaignId: string;
  contactId: string;
  contactName: string;
  organizationName: string;
  recommendedAt: IsoDateTime;
  alternativeWindows: IsoDateTime[];
  confidence: number;
  score: number;
  dataSufficiency: 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT';
  reasonCodes: string[];
  explanation: string;
  algorithmVersion: string;
  status: 'PROPOSED' | 'ACCEPTED' | 'EDITED' | 'SNOOZED' | 'DISMISSED';
}

export interface FollowUpTask {
  id: string;
  workspaceId: string;
  campaignId: string;
  campaignName: string;
  contactId: string;
  contactName: string;
  organizationName: string;
  assignedUserId: string;
  assignedUserName: string;
  status: FollowUpStatus;
  priority: Priority;
  dueAt: IsoDateTime;
  reason: string;
  lastResponseSummary: string;
  recommendedNextAction: string;
  recommendationId: string | null;
  bobRequestId: string | null;
  draftId: string | null;
  lastNotificationAt: IsoDateTime | null;
  completedAt: IsoDateTime | null;
}

export interface BobGenerationRequest {
  id: string;
  workspaceId: string;
  contactId: string;
  campaignId: string;
  followUpTaskId: string | null;
  type: 'OUTREACH_DRAFT' | 'RESPONSE_ANALYSIS' | 'RECOMMENDATION_EXPLANATION';
  promptVersion: string;
  status: BobGenerationStatus;
  requestedBy: string;
  requestedAt: IsoDateTime;
  completedAt: IsoDateTime | null;
  errorCode: string | null;
  resultProvenance: DraftProvenance | null;
}

export interface BobDraft {
  id: string;
  workspaceId: string;
  generationRequestId: string;
  subject: string;
  bodyText: string;
  rationale: string;
  recommendedNextAction: string;
  suggestedFollowUpAt: IsoDateTime | null;
  confidence: number;
  riskFlags: string[];
  sourceRecordIds: string[];
  generatedAt: IsoDateTime;
  approvalStatus: DraftApprovalStatus;
  approvedBy: string | null;
  approvedAt: IsoDateTime | null;
  provenance: DraftProvenance;
  provenanceLabel: 'Demo draft' | 'Generated by IBM Bob';
  promptVersion: string;
}

export interface SheetConnection {
  id: string;
  workspaceId: string;
  spreadsheetId: string;
  worksheetId: string;
  displayName: string;
  syncDirection: 'IMPORT' | 'BIDIRECTIONAL';
  schedule: string;
  lastSyncedAt: IsoDateTime | null;
  status: 'CONNECTED' | 'NEEDS_AUTH' | 'SYNC_ISSUE' | 'DISABLED';
  writeBackEnabled: boolean;
}

export interface SheetSyncRun {
  id: string;
  workspaceId: string;
  sheetConnectionId: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'PARTIAL' | 'FAILED' | 'DRY_RUN';
  startedAt: IsoDateTime;
  completedAt: IsoDateTime | null;
  rowsRead: number;
  rowsCreated: number;
  rowsUpdated: number;
  rowsSkipped: number;
  rowsFailed: number;
  errorSummary: string | null;
  dryRun: boolean;
}

export interface NotificationRecord {
  id: string;
  workspaceId: string;
  userId: string;
  followUpTaskId: string | null;
  channel: 'IN_APP' | 'EMAIL' | 'WEB_PUSH' | 'SMS';
  status: 'SCHEDULED' | 'SENT' | 'PREVIEWED' | 'FAILED' | 'CANCELLED';
  scheduledFor: IsoDateTime;
  sentAt: IsoDateTime | null;
  deduplicationKey: string;
  errorCode: string | null;
  title: string;
  message: string;
  isRead: boolean;
  deliveryLabel: string;
}

export interface Metric {
  id: string;
  label: string;
  value: string;
  numericValue: number;
  unit: 'COUNT' | 'PERCENT' | 'MINUTES' | 'CURRENCY';
  change: number;
  changeLabel: string;
  trend: 'UP' | 'DOWN' | 'FLAT';
  status: SignalStatus;
  description: string;
}

export interface TrendPoint {
  period: string;
  outreachSent: number;
  responses: number;
  responseRate: number;
  positiveResponseRate: number;
}

export interface HeatmapCell {
  day: string;
  hour: number;
  responseRate: number;
  sampleSize: number;
  strength: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface PipelineStageSummary {
  stage: string;
  order: number;
  organizationCount: number;
  value: number;
  weightedValue: number;
}

export interface CampaignPerformance {
  campaignId: string;
  campaignName: string;
  outreachSent: number;
  responseRate: number;
  positiveResponseRate: number;
  followUpsDue: number;
}

export interface ActivityItem {
  id: string;
  type: 'RESPONSE' | 'OUTREACH' | 'FOLLOW_UP' | 'SYNC' | 'DRAFT' | 'RECOMMENDATION';
  title: string;
  detail: string;
  occurredAt: IsoDateTime;
  status: string;
  href: string;
}

export interface DashboardData {
  rangeLabel: string;
  asOf: IsoDateTime;
  metrics: Metric[];
  responseRateTrend: TrendPoint[];
  outreachHeatmap: HeatmapCell[];
  pipeline: PipelineStageSummary[];
  campaignPerformance: CampaignPerformance[];
  nextBestActionIds: string[];
  recentActivity: ActivityItem[];
}

export interface FunnelStep {
  label: string;
  value: number;
  rateFromPrevious: number;
}

export interface ChannelPerformance {
  channel: ContactChannel;
  outreachSent: number;
  responseRate: number;
  medianResponseMinutes: number;
}

export interface AnalyticsData {
  responseRateTrend: TrendPoint[];
  outreachHeatmap: HeatmapCell[];
  funnel: FunnelStep[];
  channelPerformance: ChannelPerformance[];
  pipeline: PipelineStageSummary[];
  campaignComparison: CampaignPerformance[];
  medianFirstResponseMinutes: number;
  followUpConversionRate: number;
  dataQuality: {
    validEmailRate: number;
    timezoneCoverage: number;
    deduplicatedRecords: number;
    syncFailureRate: number;
  };
  textualSummary: string;
}

export interface IntegrationStatus {
  bob: {
    mcpConfigured: boolean;
    runtimeAdapterConfigured: boolean;
    status: 'AWAITING_CONFIGURATION' | 'MCP_READY' | 'AVAILABLE' | 'ERROR';
    lastSuccessfulOperationAt: IsoDateTime | null;
    promptTemplateVersion: string;
    lastMcpSyncAt: IsoDateTime | null;
    actionRequired: string;
  };
  googleSheets: {
    oauthConfigured: boolean;
    status: 'DEMO_DATA' | 'CONNECTED' | 'NEEDS_AUTH' | 'SYNC_ISSUE';
    lastSyncedAt: IsoDateTime | null;
    nextScheduledSyncAt: IsoDateTime | null;
    actionRequired: string;
  };
  notifications: {
    inApp: 'AVAILABLE';
    email: 'PREVIEW_ONLY' | 'CONFIGURED';
    webPush: 'UNAVAILABLE' | 'CONFIGURED';
    sms: 'UNAVAILABLE' | 'PREVIEW_ONLY' | 'CONFIGURED';
  };
}

export interface AuditEvent {
  id: string;
  workspaceId: string;
  actorType: 'USER' | 'SYSTEM' | 'IBM_BOB' | 'MCP' | 'WORKER';
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  occurredAt: IsoDateTime;
}

export interface DemoWorkspaceData {
  workspace: Workspace;
  users: UserSummary[];
  memberships: Membership[];
  dashboard: DashboardData;
  contacts: Contact[];
  organizations: Organization[];
  campaigns: Campaign[];
  interactions: Interaction[];
  responses: OutreachResponse[];
  followUps: FollowUpTask[];
  recommendations: OutreachRecommendation[];
  bobRequests: BobGenerationRequest[];
  bobDrafts: BobDraft[];
  sheetConnections: SheetConnection[];
  sheetSyncs: SheetSyncRun[];
  notifications: NotificationRecord[];
  analytics: AnalyticsData;
  integrationStatus: IntegrationStatus;
  auditEvents: AuditEvent[];
}

export interface WorkspaceScopedRecord {
  workspaceId: string;
}
