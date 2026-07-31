'use client';

import {
  Add,
  ArrowRight,
  DataBase,
  Edit,
  Renew,
  Search,
  TrashCan,
  Upload,
} from '@carbon/icons-react';
import { Button, InlineNotification, TextArea, TextInput } from '@carbon/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import { categorizeOrganization, COMPANY_CATEGORIES } from '@faro/core';
import type { SponsorshipPortfolioItem } from '@/lib/sponsorship-portfolio';

import {
  COMPANY_CATEGORY_REFERENCE_SOURCES,
  groupCompaniesByIndustry,
  summarizeCompanyCategorySources,
} from '@/lib/company-categories';
import { findAssociatedOutreachRequest, outreachRequestHref } from '@/lib/follow-up-outreach';

import { CampaignPulseChart } from './CampaignPulseChart';
import { CompanyCategoryGraph } from './CompanyCategoryGraph';
import { ContactScheduleEditor } from './ContactScheduleEditor';
import { MetricCard } from './MetricCard';
import { OutreachPlanningCalendar } from './OutreachPlanningCalendar';
import { PageHeader } from './PageHeader';
import { SponsorshipPortfolioSnapshot } from './SponsorshipPortfolioSnapshot';
import { StatusBadge } from './StatusBadge';

interface Records {
  bobRequests: Array<{
    campaignId: string;
    contactId: string;
    draft: {
      approvalStatus: string;
      bodyText: string;
      id: string;
      provenance: 'DEMO_DRAFT' | 'IBM_BOB';
      subject: string;
    } | null;
    followUpTaskId: string | null;
    id: string;
    requestedAt: string;
    status: string;
  }>;
  campaigns: Array<{
    _count: { campaignContacts: number; followUpTasks: number };
    endAt: string | null;
    id: string;
    name: string;
    objective: string;
    sheetConnection: {
      displayName: string;
      id: string;
      lastSyncedAt: string | null;
      readRange: string;
      schedule: string | null;
      status: string;
      worksheetId: string;
    } | null;
    sheetConnectionId: string | null;
    startAt: string | null;
    status: string;
    type: string;
  }>;
  contacts: Array<{
    consentStatus: string;
    email: string | null;
    firstName: string;
    id: string;
    lastName: string;
    nextActionAt: string;
    nextActionType: string;
    organization: {
      industry: string;
      name: string;
      type: string;
      website: string | null;
    } | null;
    phone: string | null;
    preferredChannel: string;
    source: string | null;
    timezone: string;
    title: string | null;
    type: string;
    updatedAt: string;
  }>;
  dataSources: Array<{
    displayName: string;
    id: string;
    lastSyncedAt: string | null;
    readRange: string;
    schedule: string | null;
    status: string;
    worksheetId: string;
  }>;
  followUps: Array<{
    campaign: { id: string; name: string };
    contact: {
      firstName: string;
      id: string;
      lastName: string;
      organization: {
        industry: string;
        name: string;
        type: string;
        website: string | null;
      } | null;
    };
    dueAt: string;
    id: string;
    initialAt: string;
    priority: string;
    reason: string;
    status: string;
  }>;
  importedFollowUps: Array<{
    contactId: string;
    contactName: string;
    dueAt: string;
    initialAt: string;
  }>;
  interactions: Array<{
    bodyText: string;
    campaign: { name: string } | null;
    contact: { firstName: string; id: string; lastName: string };
    direction: string;
    id: string;
    occurredAt: string;
    subject: string | null;
  }>;
  planningReferenceTime: string;
  sponsorshipPortfolio: SponsorshipPortfolioItem[];
  organizations: Array<{
    _count: { contacts: number };
    categoryConfidence: 'HIGH' | 'MEDIUM' | 'LOW' | null;
    categorySource:
      | 'SOURCE_FIELD'
      | 'THIRD_PARTY_CONTEXT'
      | 'WIKIDATA'
      | 'NAME_OR_DOMAIN'
      | 'BEST_EFFORT'
      | 'FALLBACK'
      | null;
    contacts: Array<{
      consentStatus: string;
      email: string | null;
      firstName: string;
      id: string;
      lastName: string;
      title: string | null;
      type: string;
    }>;
    id: string;
    industry: string;
    name: string;
    type: string;
    website: string | null;
  }>;
  scope: {
    campaign: { id: string; name: string } | null;
    kind: 'CAMPAIGN' | 'WORKSPACE';
  };
  trashedOrganizations: Array<{
    _count: { contacts: number };
    categoryConfidence: 'HIGH' | 'MEDIUM' | 'LOW' | null;
    categorySource:
      | 'SOURCE_FIELD'
      | 'THIRD_PARTY_CONTEXT'
      | 'WIKIDATA'
      | 'NAME_OR_DOMAIN'
      | 'BEST_EFFORT'
      | 'FALLBACK'
      | null;
    deletedAt: string;
    id: string;
    industry: string;
    name: string;
    type: string;
    website: string | null;
  }>;
  workspace: {
    defaultTimezone: string;
    id: string;
    name: string;
    quietHoursEnd: string;
    quietHoursStart: string;
    slug: string;
  };
}

interface CampaignAnalytics {
  averageResponseMinutes: number | null;
  awaitingBob: number;
  contacts: number;
  delivered: number;
  draftsReady: number;
  followUpsOpen: number;
  id: string;
  interactions: number;
  name: string;
  objective: string;
  positiveResponses: number;
  positiveResponseRate: number;
  responses: number;
  responseRate: number;
  status: string;
  type: string;
}

const routeTitles: Record<string, [string, string]> = {
  '/analytics': [
    'Analytics',
    'Choose a question, compare campaigns, and turn workspace activity into one clear next step.',
  ],
  '/campaigns': [
    'Campaign workspaces',
    'Create separate campaign work areas, each with its own contacts and associated database source.',
  ],
  '/contacts': [
    'Contacts database',
    'Review imported records here, then open a campaign workspace for campaign-specific access.',
  ],
  '/follow-ups': [
    'Follow-ups',
    'Imported dates remain pending until you assign the contact to a campaign.',
  ],
  '/organizations': [
    'Organizations',
    'Organizations derived from explicitly imported contact rows.',
  ],
  '/outreach': [
    'Outreach center',
    'Contacts, follow-ups, tracked email context, and IBM Bob draft requests in one place.',
  ],
};

function categorySourceLabel(source: Records['organizations'][number]['categorySource']): string {
  switch (source) {
    case 'SOURCE_FIELD':
      return 'source category';
    case 'THIRD_PARTY_CONTEXT':
      return 'third-party taxonomy';
    case 'WIKIDATA':
      return 'verified with Wikidata';
    case 'NAME_OR_DOMAIN':
      return 'inferred from company name/domain';
    case 'BEST_EFFORT':
      return 'best-effort classification';
    case 'FALLBACK':
      return 'legacy fallback';
    default:
      return 'existing category';
  }
}

function categoryDisplayLabel(
  organization?: {
    industry?: string | null;
    name: string;
    type?: string | null;
    website?: string | null;
  } | null,
): string {
  if (!organization) return 'No company category';
  if (organization.industry && organization.industry !== 'Other') return organization.industry;
  return categorizeOrganization({
    explicitCategory: organization.industry,
    name: organization.name,
    organizationType: organization.type,
    website: organization.website,
  }).category;
}

function campaignDateLabel(startAt: string | null, endAt: string | null): string {
  if (!startAt || !endAt) return 'Dates not assigned';
  const format = (value: string) =>
    new Intl.DateTimeFormat(undefined, {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
      year: 'numeric',
    }).format(new Date(value));
  return `${format(startAt)} – ${format(endAt)}`;
}

function subscribeToLocation() {
  return () => undefined;
}

function browserLocationSearch() {
  return window.location.search;
}

function serverLocationSearch() {
  return '';
}

export function ConnectedWorkspaceRecords({ pathname }: { pathname: string }) {
  const router = useRouter();
  const route =
    Object.keys(routeTitles).find((candidate) => pathname.startsWith(candidate)) ?? pathname;
  const [data, setData] = useState<Records | null>(null);
  const [error, setError] = useState(false);
  const [campaignName, setCampaignName] = useState('');
  const [campaignObjective, setCampaignObjective] = useState('');
  const [campaignSourceId, setCampaignSourceId] = useState('');
  const [campaignType, setCampaignType] = useState('SPONSORSHIP');
  const [deletingCampaignId, setDeletingCampaignId] = useState<string | null>(null);
  const [followUpCampaignId, setFollowUpCampaignId] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<CampaignAnalytics[]>([]);
  const [analyticsCampaignId, setAnalyticsCampaignId] = useState('');

  const load = useCallback(async () => {
    const response = await fetch('/api/workspace/records', { cache: 'no-store' });
    if (!response.ok) throw new Error('records');
    const result = (await response.json()) as { data: Records };
    setData(result.data);
    setFollowUpCampaignId(
      (current) =>
        result.data.scope.campaign?.id ?? (current || result.data.campaigns[0]?.id || ''),
    );
    setCampaignSourceId((current) => current || result.data.dataSources[0]?.id || '');
  }, []);
  useEffect(() => {
    const initial = window.setTimeout(() => void load().catch(() => setError(true)), 0);
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load().catch(() => setError(true));
    }, 30_000);
    const refreshVisible = () => {
      if (document.visibilityState === 'visible') void load().catch(() => setError(true));
    };
    document.addEventListener('visibilitychange', refreshVisible);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshVisible);
    };
  }, [load]);

  useEffect(() => {
    if (route !== '/analytics') return;
    void fetch('/api/campaigns/analytics', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('analytics');
        return (await response.json()) as { data: CampaignAnalytics[] };
      })
      .then((result) => {
        setAnalytics(result.data);
        setAnalyticsCampaignId(result.data[0]?.id ?? '');
      })
      .catch(() => setError(true));
  }, [route]);

  async function createCampaign() {
    const response = await fetch('/api/workspace/records', {
      body: JSON.stringify({
        name: campaignName,
        objective: campaignObjective,
        sheetConnectionId: campaignSourceId || null,
        type: campaignType,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    if (!response.ok) {
      setNotice('Faro could not create that campaign. Check the required fields.');
      return;
    }
    const result = (await response.json()) as { data: { id: string } };
    setCampaignName('');
    setCampaignObjective('');
    setNotice('Campaign workspace created as a draft.');
    await load();
    router.push(`/campaigns/${encodeURIComponent(result.data.id)}`);
  }

  async function deleteCampaign(campaign: Records['campaigns'][number]) {
    if (
      !window.confirm(
        `Delete “${campaign.name}”? It will disappear throughout Faro, its pending work will be cancelled, and saved historical records will remain available for audit purposes.`,
      )
    ) {
      return;
    }
    setDeletingCampaignId(campaign.id);
    const response = await fetch(`/api/campaigns/${encodeURIComponent(campaign.id)}`, {
      method: 'DELETE',
    });
    setDeletingCampaignId(null);
    if (!response.ok) {
      setNotice(`Faro could not delete ${campaign.name}.`);
      return;
    }
    setNotice(`${campaign.name} was deleted from active campaign views.`);
    window.dispatchEvent(new Event('faro:workspace-context-changed'));
    await load();
    router.refresh();
  }

  async function activateImportedFollowUps() {
    const response = await fetch('/api/workspace/follow-ups/activate', {
      body: JSON.stringify({ campaignId: followUpCampaignId }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    const result = (await response.json().catch(() => null)) as {
      data?: { activated: number };
    } | null;
    if (!response.ok || !result?.data) {
      setNotice('Faro could not activate the imported follow-ups.');
      return;
    }
    setNotice(`${result.data.activated} imported follow-ups assigned to the selected campaign.`);
    await load();
  }

  async function updateOrganizationTrash(id: string, action: 'trash' | 'restore') {
    const response = await fetch(`/api/organizations/${id}/trash`, {
      body: JSON.stringify({ action }),
      headers: { 'content-type': 'application/json' },
      method: 'PATCH',
    });
    if (!response.ok) {
      setNotice(`Faro could not ${action === 'trash' ? 'move' : 'restore'} that organization.`);
      return;
    }
    setNotice(
      action === 'trash'
        ? 'Organization and its contacts moved to Trash.'
        : 'Organization and its contacts restored.',
    );
    await load();
  }

  const [title, description] = routeTitles[route] ?? ['Connected workspace', 'Real workspace data'];
  if (error)
    return <InlineNotification hideCloseButton kind="error" title="Workspace data unavailable" />;
  if (!data)
    return (
      <div
        className="skeleton"
        style={{ height: '18rem' }}
        aria-label="Loading workspace records"
      />
    );
  return (
    <div className="page-shell">
      <PageHeader
        actions={
          route === '/contacts' || route === '/organizations' ? (
            <Button href="/integrations/google-sheets" renderIcon={Upload}>
              Import Google Sheet
            </Button>
          ) : undefined
        }
        description={
          data.scope.campaign && route !== '/campaigns'
            ? `${description} Showing only records assigned to ${data.scope.campaign.name}.`
            : description
        }
        eyebrow={
          data.scope.campaign
            ? `${data.scope.campaign.name} · Campaign focus`
            : `${data.workspace.name} · Connected workspace`
        }
        title={title}
      />
      {notice ? (
        <InlineNotification hideCloseButton kind="info" lowContrast title={notice} />
      ) : null}

      {route === '/campaigns' ? (
        <>
          <section className="panel">
            <div className="panel__header">
              <div>
                <h2>Create campaign workspace</h2>
                <p>
                  Choose the database source this campaign will use, then open it to manage its
                  contacts.
                </p>
              </div>
              <Add aria-hidden size={24} />
            </div>
            <div className="campaign-create-form">
              <TextInput
                id="campaign-name"
                labelText="Campaign name"
                value={campaignName}
                onChange={(event) => setCampaignName(event.target.value)}
              />
              <TextArea
                id="campaign-objective"
                labelText="Objective"
                value={campaignObjective}
                onChange={(event) => setCampaignObjective(event.target.value)}
              />
              <label>
                <span>Campaign type</span>
                <select
                  className="filter-select"
                  value={campaignType}
                  onChange={(event) => setCampaignType(event.target.value)}
                >
                  <option value="SPONSORSHIP">Sponsorship</option>
                  <option value="PARTNERSHIP">Partnership</option>
                  <option value="PARTICIPANT_OUTREACH">Participant outreach</option>
                  <option value="FUNDRAISING">Fundraising</option>
                  <option value="EVENT">Event</option>
                  <option value="COMMUNITY">Community</option>
                </select>
              </label>
              <label>
                <span>Campaign data source</span>
                <select
                  className="filter-select"
                  onChange={(event) => setCampaignSourceId(event.target.value)}
                  value={campaignSourceId}
                >
                  <option value="">Faro database only · no external poll</option>
                  {data.dataSources.map((source) => (
                    <option key={source.id} value={source.id}>
                      {source.displayName} / {source.worksheetId} ·{' '}
                      {source.status.replaceAll('_', ' ')}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                disabled={!campaignName.trim() || !campaignObjective.trim()}
                onClick={() => void createCampaign()}
                renderIcon={Add}
              >
                Create and open campaign
              </Button>
            </div>
          </section>
          <section aria-labelledby="campaign-workspaces-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Separated work areas</p>
                <h2 id="campaign-workspaces-title">Campaign workspaces</h2>
              </div>
              <p>Open a campaign to access its contacts, follow-ups, and associated database.</p>
            </div>
            <div className="campaign-workspace-grid">
              {data.campaigns.map((campaign) => (
                <article className="campaign-workspace-card" key={campaign.id}>
                  <div className="campaign-workspace-card__topline">
                    <span className="faro-tag">{campaign.type.replaceAll('_', ' ')}</span>
                    <StatusBadge
                      label={
                        data.scope.campaign?.id === campaign.id ? 'CURRENT FOCUS' : campaign.status
                      }
                      status={
                        data.scope.campaign?.id === campaign.id
                          ? 'clear'
                          : campaign.status === 'ACTIVE'
                            ? 'ready'
                            : 'attention'
                      }
                    />
                  </div>
                  <div>
                    <h3>
                      <Link href={`/campaigns/${encodeURIComponent(campaign.id)}`}>
                        {campaign.name}
                      </Link>
                    </h3>
                    <p>{campaign.objective}</p>
                    <p>{campaignDateLabel(campaign.startAt, campaign.endAt)}</p>
                  </div>
                  <dl className="campaign-workspace-card__metrics">
                    <div>
                      <dt>Contacts</dt>
                      <dd>{campaign._count.campaignContacts}</dd>
                    </div>
                    <div>
                      <dt>Follow-ups</dt>
                      <dd>{campaign._count.followUpTasks}</dd>
                    </div>
                  </dl>
                  <div className="campaign-workspace-card__source">
                    <DataBase aria-hidden size={18} />
                    <span>
                      <small>Associated database</small>
                      <strong>
                        {campaign.sheetConnection
                          ? `${campaign.sheetConnection.displayName} / ${campaign.sheetConnection.worksheetId}`
                          : 'Faro workspace database only'}
                      </strong>
                      <small>
                        {campaign.sheetConnection
                          ? `${campaign.sheetConnection.status.replaceAll('_', ' ')} · last sync ${
                              campaign.sheetConnection.lastSyncedAt
                                ? new Date(campaign.sheetConnection.lastSyncedAt).toLocaleString()
                                : 'never'
                            }`
                          : 'No external polling source'}
                      </small>
                    </span>
                  </div>
                  <div className="campaign-workspace-card__actions">
                    <Button
                      href={`/campaigns/${encodeURIComponent(campaign.id)}`}
                      kind="primary"
                      renderIcon={ArrowRight}
                      size="sm"
                    >
                      Open
                    </Button>
                    <Button
                      href={`/campaigns/${encodeURIComponent(campaign.id)}?edit=1#campaign-management-title`}
                      kind="secondary"
                      renderIcon={Edit}
                      size="sm"
                    >
                      Edit
                    </Button>
                    <Button
                      disabled={Boolean(deletingCampaignId)}
                      kind="danger--ghost"
                      onClick={() => void deleteCampaign(campaign)}
                      renderIcon={TrashCan}
                      size="sm"
                    >
                      {deletingCampaignId === campaign.id ? 'Deleting…' : 'Delete'}
                    </Button>
                  </div>
                </article>
              ))}
              {!data.campaigns.length ? (
                <div className="panel empty-state">
                  <DataBase size={40} />
                  <h2>No campaign workspaces yet</h2>
                  <p>Create the first campaign and choose its database source above.</p>
                </div>
              ) : null}
            </div>
          </section>
        </>
      ) : null}
      {route === '/contacts' ? (
        <ContactDirectory
          campaigns={data.campaigns}
          contacts={data.contacts}
          followUps={data.followUps}
          reload={load}
          scope={data.scope}
        />
      ) : null}
      {route === '/organizations' ? (
        <>
          <SponsorshipPortfolioSnapshot
            items={data.sponsorshipPortfolio}
            title="Faro Analytics sponsor update"
          />
          <OrganizationRoster
            campaignFocused={data.scope.kind === 'CAMPAIGN'}
            organizations={data.organizations}
            trashedOrganizations={data.trashedOrganizations}
            updateTrash={updateOrganizationTrash}
          />
        </>
      ) : null}
      {route === '/follow-ups' ? (
        <>
          {data.importedFollowUps.length ? (
            <section className="panel">
              <h2>Assign imported follow-ups</h2>
              <ul className="plain-list">
                {data.importedFollowUps.slice(0, 10).map((followUp) => (
                  <li key={followUp.contactId}>
                    <strong>{followUp.contactName}</strong> · Initial date{' '}
                    <strong>
                      <time dateTime={followUp.initialAt}>
                        {new Date(followUp.initialAt).toLocaleString()}
                      </time>
                    </strong>{' '}
                    · Follow-up date{' '}
                    <strong>
                      <time dateTime={followUp.dueAt}>
                        {new Date(followUp.dueAt).toLocaleString()}
                      </time>
                    </strong>
                  </li>
                ))}
              </ul>
              {data.campaigns.length ? (
                <div className="sheet-preview-actions">
                  <label>
                    <span>Campaign</span>
                    <select
                      className="filter-select"
                      onChange={(event) => setFollowUpCampaignId(event.target.value)}
                      value={followUpCampaignId}
                    >
                      {data.campaigns
                        .filter(
                          (campaign) =>
                            !data.scope.campaign || campaign.id === data.scope.campaign.id,
                        )
                        .map((campaign) => (
                          <option key={campaign.id} value={campaign.id}>
                            {campaign.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <Button
                    disabled={!followUpCampaignId}
                    onClick={() => void activateImportedFollowUps()}
                  >
                    Activate pending follow-ups
                  </Button>
                </div>
              ) : (
                <p>Create a campaign first. Faro will not invent one during import.</p>
              )}
            </section>
          ) : null}
          <FollowUpDirectory bobRequests={data.bobRequests} followUps={data.followUps} />
          {data.importedFollowUps.length ? (
            <InlineNotification
              hideCloseButton
              kind="warning"
              lowContrast
              title={`${data.importedFollowUps.length} imported follow-up dates are pending campaign assignment`}
              subtitle="Faro preserved these dates but did not invent a campaign or activate outreach automatically."
            />
          ) : null}
        </>
      ) : null}
      {route === '/outreach' ? <OutreachCenter records={data} reload={load} /> : null}
      {route === '/analytics' ? (
        <CampaignAnalyticsView
          campaigns={analytics}
          organizations={data.organizations}
          selectedId={analyticsCampaignId}
          setSelectedId={setAnalyticsCampaignId}
        />
      ) : null}
    </div>
  );
}

interface ContactEditDraft {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  preferredChannel: string;
  timezone: string;
  title: string;
  type: string;
}

interface ContactSavePayload {
  email: string | null;
  firstName: string;
  lastName: string;
  phone: string | null;
  preferredChannel: string;
  timezone: string;
  title: string | null;
  type: string;
}

interface PendingContactSave {
  attempts: number;
  contactId: string;
  createdAt: number;
  payload: ContactSavePayload;
  returnTo: '/contacts' | '/outreach';
}

const PENDING_CONTACT_SAVE_KEY = 'faro:pending-contact-sheet-save';

function preservePendingContactSave(value: PendingContactSave) {
  window.sessionStorage.setItem(PENDING_CONTACT_SAVE_KEY, JSON.stringify(value));
}

function takePendingContactSave(returnTo: PendingContactSave['returnTo']) {
  const raw = window.sessionStorage.getItem(PENDING_CONTACT_SAVE_KEY);
  if (!raw) return null;
  window.sessionStorage.removeItem(PENDING_CONTACT_SAVE_KEY);
  try {
    const parsed = JSON.parse(raw) as Partial<PendingContactSave>;
    return parsed.returnTo === returnTo &&
      typeof parsed.contactId === 'string' &&
      typeof parsed.createdAt === 'number' &&
      Date.now() - parsed.createdAt < 15 * 60_000 &&
      parsed.payload &&
      typeof parsed.payload === 'object'
      ? (parsed as PendingContactSave)
      : null;
  } catch {
    return null;
  }
}

const contactTypes = [
  'PARTICIPANT',
  'SPONSOR',
  'PARTNER',
  'DONOR',
  'SPEAKER',
  'VENDOR',
  'OTHER',
] as const;
const contactChannels = ['EMAIL', 'PHONE', 'SMS', 'MEETING', 'SOCIAL', 'OTHER'] as const;

function ContactDirectory({
  campaigns,
  contacts,
  followUps,
  reload,
  scope,
}: {
  campaigns: Records['campaigns'];
  contacts: Records['contacts'];
  followUps: Records['followUps'];
  reload: () => Promise<void>;
  scope: Records['scope'];
}) {
  const [industry, setIndustry] = useState('All categories');
  const [editDraft, setEditDraft] = useState<ContactEditDraft | null>(null);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [workingContactId, setWorkingContactId] = useState<string | null>(null);
  const [view, setView] = useState<'all' | 'imported'>('all');
  const importedContacts = contacts.filter((contact) =>
    contact.source?.startsWith('google-sheets:'),
  );
  const visibleContacts = (view === 'imported' ? importedContacts : contacts).filter(
    (contact) =>
      `${contact.firstName} ${contact.lastName} ${contact.email ?? ''} ${contact.organization?.name ?? ''}`
        .concat(` ${contact.organization?.industry ?? ''}`)
        .toLocaleLowerCase('en-US')
        .includes(query.toLocaleLowerCase('en-US')) &&
      (industry === 'All categories' || categoryDisplayLabel(contact.organization) === industry),
  );

  async function confirmOutreachBasis(contactId: string) {
    if (!window.confirm('Confirm that you have a lawful outreach basis for this contact?')) return;
    setWorkingContactId(contactId);
    const response = await fetch(`/api/contacts/${contactId}/consent`, {
      body: JSON.stringify({ status: 'IMPLIED' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    if (!response.ok) {
      setMessage('Faro could not update the outreach basis.');
      setWorkingContactId(null);
      return;
    }
    setMessage('Outreach basis confirmed. This contact is now eligible for a governed draft.');
    await reload();
    setWorkingContactId(null);
  }

  function beginContactEdit(contact: Records['contacts'][number]) {
    setEditingContactId(contact.id);
    setEditDraft({
      email: contact.email ?? '',
      firstName: contact.firstName,
      lastName: contact.lastName,
      phone: contact.phone ?? '',
      preferredChannel: contact.preferredChannel,
      timezone: contact.timezone,
      title: contact.title ?? '',
      type: contact.type,
    });
    setMessage(null);
  }

  function updateEditDraft(field: keyof ContactEditDraft, value: string) {
    setEditDraft((current) => (current ? { ...current, [field]: value } : current));
  }

  const persistContactEdit = useCallback(
    async (contactId: string, payload: ContactSavePayload, attempts = 0) => {
      setWorkingContactId(contactId);
      const response = await fetch(`/api/contacts/${contactId}?returnTo=/contacts`, {
        body: JSON.stringify(payload),
        headers: { 'content-type': 'application/json' },
        method: 'PATCH',
      });
      const result = (await response.json().catch(() => null)) as {
        error?: string;
        message?: string;
        reconnect?: string;
        sheetWriteBack?: { status: 'NO_CHANGES' | 'NOT_APPLICABLE' | 'WRITTEN' };
      } | null;
      if (response.status === 409 && result?.reconnect) {
        if (attempts >= 1) {
          setMessage(
            'Google still has not granted Sheet edit access. Reconnect from Integrations, then save again.',
          );
          setWorkingContactId(null);
          return;
        }
        preservePendingContactSave({
          attempts: attempts + 1,
          contactId,
          createdAt: Date.now(),
          payload,
          returnTo: '/contacts',
        });
        window.location.assign(result.reconnect);
        return;
      }
      if (!response.ok) {
        setMessage(
          result?.error === 'CONTACT_EMAIL_CONFLICT'
            ? 'That email is already assigned to another contact in this workspace.'
            : (result?.message ??
                'Faro could not save the contact. Check every field and try again.'),
        );
        setWorkingContactId(null);
        return;
      }
      await reload();
      setEditingContactId(null);
      setEditDraft(null);
      setWorkingContactId(null);
      setMessage(
        result?.sheetWriteBack?.status === 'WRITTEN'
          ? 'Contact saved in Faro and written back to its Google Sheet source row.'
          : result?.sheetWriteBack?.status === 'NOT_APPLICABLE'
            ? 'Contact saved in Faro. This database-only contact has no Google Sheet source row.'
            : 'Contact saved. No field values changed.',
      );
    },
    [reload],
  );

  useEffect(() => {
    const pending = takePendingContactSave('/contacts');
    if (!pending) return;
    const resumeTimer = window.setTimeout(() => {
      void persistContactEdit(pending.contactId, pending.payload, pending.attempts);
    }, 0);
    return () => window.clearTimeout(resumeTimer);
  }, [persistContactEdit]);

  async function saveContactEdit(contactId: string) {
    if (!editDraft) return;
    await persistContactEdit(contactId, {
      ...editDraft,
      email: editDraft.email.trim() || null,
      phone: editDraft.phone.trim() || null,
      title: editDraft.title.trim() || null,
    });
  }

  return (
    <>
      <section className="panel" aria-labelledby="contact-campaign-access-title">
        <div className="panel__header">
          <div>
            <h2 id="contact-campaign-access-title">
              {scope.campaign ? `${scope.campaign.name} contacts` : 'Campaign contact access'}
            </h2>
            <p>
              {scope.campaign
                ? 'Only contacts assigned to the focused campaign are visible. Open another campaign and use its focus button to switch.'
                : 'The workspace database remains visible here for import review. Open a campaign to work with its assigned contacts and campaign-specific history.'}
            </p>
          </div>
        </div>
        <div className="campaign-access-list">
          {campaigns
            .filter((campaign) => !scope.campaign || campaign.id === scope.campaign.id)
            .map((campaign) => (
              <Link
                className="campaign-access-link"
                href={`/campaigns/${encodeURIComponent(campaign.id)}`}
                key={campaign.id}
              >
                <span>
                  <strong>{campaign.name}</strong>
                  <small>
                    {campaign._count.campaignContacts} contacts ·{' '}
                    {campaign.sheetConnection?.displayName ?? 'Faro database only'}
                  </small>
                </span>
                <ArrowRight aria-hidden size={16} />
              </Link>
            ))}
          {!campaigns.length ? (
            <p className="empty-inline">Create a campaign workspace to organize contact access.</p>
          ) : null}
        </div>
      </section>
      <nav className="queue-tabs" aria-label="Contact views">
        <button
          aria-current={view === 'all' ? 'page' : undefined}
          onClick={() => setView('all')}
          type="button"
        >
          All contacts <span>{contacts.length}</span>
        </button>
        <button
          aria-current={view === 'imported' ? 'page' : undefined}
          onClick={() => setView('imported')}
          type="button"
        >
          Recently imported <span>{importedContacts.length}</span>
        </button>
      </nav>
      {message ? (
        <InlineNotification hideCloseButton kind="info" lowContrast title={message} />
      ) : null}
      <div className="filters-bar" aria-label="Contact search filters">
        <div className="filters-bar__group">
          <label className="search-field">
            <span className="visually-hidden">Search contacts</span>
            <Search aria-hidden size={16} />
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, company, or email"
              type="search"
              value={query}
            />
          </label>
          <label>
            <span className="visually-hidden">Filter contacts by company category</span>
            <select
              className="filter-select"
              onChange={(event) => setIndustry(event.target.value)}
              value={industry}
            >
              <option>All categories</option>
              {COMPANY_CATEGORIES.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <section
        className="panel panel--flush record-scroll-region"
        aria-label={`${view} contacts. Scroll within this list to browse results.`}
        tabIndex={0}
      >
        {visibleContacts.map((contact) => {
          const editing = editingContactId === contact.id && editDraft;
          return (
            <div className="contact-record" key={contact.id}>
              <div className="list-card">
                <div>
                  <h3>
                    {contact.firstName} {contact.lastName}
                  </h3>
                  <p>
                    {contact.email ?? 'No email'} · {contact.organization?.name ?? 'No company'} ·{' '}
                    {categoryDisplayLabel(contact.organization)}
                  </p>
                  <p>
                    {contact.title ? `Role: ${contact.title} · ` : 'Role not specified · '}
                    {contact.type} · {contact.consentStatus} · updated{' '}
                    {new Date(contact.updatedAt).toLocaleString()}
                  </p>
                  <p>
                    {contact.nextActionType.replaceAll('_', ' ').toLocaleLowerCase()}:{' '}
                    <strong>{new Date(contact.nextActionAt).toLocaleString()}</strong>
                  </p>
                </div>
                <div className="page-actions">
                  <Button
                    disabled={workingContactId === contact.id}
                    kind="ghost"
                    onClick={() => beginContactEdit(contact)}
                    renderIcon={Edit}
                    size="sm"
                  >
                    Edit contact
                  </Button>
                  {view === 'imported' ? (
                    <>
                      <span
                        className={`status-badge status-badge--${
                          contact.consentStatus === 'UNKNOWN' ? 'attention' : 'ready'
                        }`}
                      >
                        {contact.consentStatus === 'UNKNOWN'
                          ? 'Outreach basis review'
                          : contact.consentStatus}
                      </span>
                      {contact.consentStatus === 'UNKNOWN' ? (
                        <Button
                          disabled={workingContactId === contact.id}
                          kind="tertiary"
                          onClick={() => void confirmOutreachBasis(contact.id)}
                          size="sm"
                        >
                          Review outreach basis
                        </Button>
                      ) : contact.consentStatus === 'OPTED_OUT' ? null : (
                        <Button href="/campaigns" kind="tertiary" size="sm">
                          Open a campaign to continue
                        </Button>
                      )}
                    </>
                  ) : null}
                </div>
              </div>
              <ContactScheduleEditor
                campaigns={campaigns}
                consentStatus={contact.consentStatus}
                contactId={contact.id}
                contactName={`${contact.firstName} ${contact.lastName}`}
                followUps={followUps.filter((followUp) => followUp.contact.id === contact.id)}
                reload={reload}
                returnTo="/contacts"
                scopeCampaignId={scope.campaign?.id}
                source={contact.source}
                timeZone={contact.timezone}
              />
              {editing ? (
                <form
                  className="contact-edit-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveContactEdit(contact.id);
                  }}
                >
                  <fieldset disabled={workingContactId === contact.id}>
                    <legend>Edit {`${contact.firstName} ${contact.lastName}`}</legend>
                    <p>
                      Imported-contact edits update the exact Google Sheet source row. Database-only
                      contacts remain in Faro because they have no source row.
                    </p>
                    <div className="contact-edit-form__grid">
                      <TextInput
                        id={`contact-${contact.id}-first-name`}
                        labelText="First name"
                        onChange={(event) => updateEditDraft('firstName', event.target.value)}
                        required
                        value={editDraft.firstName}
                      />
                      <TextInput
                        id={`contact-${contact.id}-last-name`}
                        labelText="Last name"
                        onChange={(event) => updateEditDraft('lastName', event.target.value)}
                        required
                        value={editDraft.lastName}
                      />
                      <TextInput
                        id={`contact-${contact.id}-email`}
                        labelText="Email"
                        onChange={(event) => updateEditDraft('email', event.target.value)}
                        type="email"
                        value={editDraft.email}
                      />
                      <TextInput
                        id={`contact-${contact.id}-phone`}
                        labelText="Phone"
                        onChange={(event) => updateEditDraft('phone', event.target.value)}
                        type="tel"
                        value={editDraft.phone}
                      />
                      <TextInput
                        id={`contact-${contact.id}-title`}
                        labelText="Person’s role / title"
                        onChange={(event) => updateEditDraft('title', event.target.value)}
                        value={editDraft.title}
                      />
                      <TextInput
                        helperText="Use an IANA timezone such as America/Los_Angeles."
                        id={`contact-${contact.id}-timezone`}
                        labelText="Timezone"
                        onChange={(event) => updateEditDraft('timezone', event.target.value)}
                        required
                        value={editDraft.timezone}
                      />
                      <label>
                        Contact type
                        <select
                          className="filter-select"
                          onChange={(event) => updateEditDraft('type', event.target.value)}
                          value={editDraft.type}
                        >
                          {contactTypes.map((type) => (
                            <option key={type}>{type}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Preferred channel
                        <select
                          className="filter-select"
                          onChange={(event) =>
                            updateEditDraft('preferredChannel', event.target.value)
                          }
                          value={editDraft.preferredChannel}
                        >
                          {contactChannels.map((channel) => (
                            <option key={channel}>{channel}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="page-actions">
                      <Button
                        kind="secondary"
                        onClick={() => {
                          setEditingContactId(null);
                          setEditDraft(null);
                        }}
                        type="button"
                      >
                        Cancel
                      </Button>
                      <Button type="submit">
                        {workingContactId === contact.id ? 'Saving…' : 'Save contact'}
                      </Button>
                    </div>
                  </fieldset>
                </form>
              ) : null}
            </div>
          );
        })}
        {!visibleContacts.length ? (
          <p style={{ padding: '1.25rem' }}>
            {contacts.length
              ? 'No contacts match this search and category filter.'
              : 'No contacts yet. Import a Google Sheet to add them.'}
          </p>
        ) : null}
      </section>
    </>
  );
}

function FollowUpDirectory({
  bobRequests,
  followUps,
}: {
  bobRequests: Records['bobRequests'];
  followUps: Records['followUps'];
}) {
  const [industry, setIndustry] = useState('All categories');
  const [query, setQuery] = useState('');
  const visible = followUps.filter(
    (followUp) =>
      `${followUp.contact.firstName} ${followUp.contact.lastName} ${followUp.contact.organization?.name ?? ''} ${followUp.contact.organization?.industry ?? ''} ${followUp.campaign.name} ${followUp.reason}`
        .toLocaleLowerCase('en-US')
        .includes(query.toLocaleLowerCase('en-US')) &&
      (industry === 'All categories' ||
        categoryDisplayLabel(followUp.contact.organization) === industry),
  );
  return (
    <>
      <div className="filters-bar" aria-label="Follow-up search filters">
        <div className="filters-bar__group">
          <label className="search-field">
            <span className="visually-hidden">Search follow-ups</span>
            <Search aria-hidden size={16} />
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search contact, company, or campaign"
              type="search"
              value={query}
            />
          </label>
          <select
            aria-label="Filter follow-ups by company category"
            className="filter-select"
            onChange={(event) => setIndustry(event.target.value)}
            value={industry}
          >
            <option>All categories</option>
            {COMPANY_CATEGORIES.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </div>
      </div>
      <section className="panel panel--flush follow-up-records" aria-label="Assigned follow-ups">
        {visible.length ? (
          visible.map((item) => {
            const request = findAssociatedOutreachRequest(bobRequests, {
              campaignId: item.campaign.id,
              contactId: item.contact.id,
              id: item.id,
            });
            const draft = request?.draft;
            return (
              <article className="follow-up-record" key={item.id}>
                <header className="follow-up-record__header">
                  <div>
                    <p className="eyebrow">{item.campaign.name}</p>
                    <h3>
                      {item.contact.firstName} {item.contact.lastName}
                    </h3>
                    <p>
                      {item.contact.organization?.name ?? 'No company'} ·{' '}
                      {categoryDisplayLabel(item.contact.organization)}
                    </p>
                  </div>
                  <span className="faro-tag">{item.status.replaceAll('_', ' ')}</span>
                </header>
                <dl className="follow-up-record__dates" aria-label="Assigned follow-up dates">
                  <div>
                    <dt>Initial outreach</dt>
                    <dd>
                      <time dateTime={item.initialAt}>
                        {new Date(item.initialAt).toLocaleString()}
                      </time>
                    </dd>
                  </div>
                  <div className="follow-up-record__date--due">
                    <dt>Follow-up due</dt>
                    <dd>
                      <time dateTime={item.dueAt}>{new Date(item.dueAt).toLocaleString()}</time>
                    </dd>
                  </div>
                </dl>
                <p className="follow-up-record__reason">
                  <strong>{item.priority} priority:</strong> {item.reason}
                </p>
                {draft ? (
                  <section
                    aria-label={`Outreach message for ${item.contact.firstName} ${item.contact.lastName}`}
                    className="follow-up-record__message"
                  >
                    <div className="follow-up-record__message-heading">
                      <div>
                        <p className="eyebrow">Associated outreach message</p>
                        <h4>{draft.subject}</h4>
                      </div>
                      <span className="status-badge status-badge--attention">
                        {draft.provenance === 'IBM_BOB' ? 'Generated by IBM Bob' : 'Demo draft'}
                      </span>
                    </div>
                    <p>{draft.bodyText}</p>
                    <div className="page-actions">
                      <Button
                        href={outreachRequestHref(request)}
                        kind="secondary"
                        renderIcon={ArrowRight}
                        size="sm"
                      >
                        Open this message in Outreach
                      </Button>
                    </div>
                  </section>
                ) : request ? (
                  <div className="follow-up-record__message follow-up-record__message--empty">
                    <p>
                      Outreach request {request.id} is{' '}
                      {request.status.replaceAll('_', ' ').toLocaleLowerCase()}; it has no saved
                      message yet.
                    </p>
                    <Button
                      href={outreachRequestHref(request)}
                      kind="ghost"
                      renderIcon={ArrowRight}
                      size="sm"
                    >
                      Open request in Outreach
                    </Button>
                  </div>
                ) : (
                  <p className="follow-up-record__no-message">
                    No outreach message is associated with this contact yet.
                  </p>
                )}
              </article>
            );
          })
        ) : (
          <p style={{ padding: '1.25rem' }}>
            {followUps.length
              ? 'No follow-ups match this search and category filter.'
              : 'No active follow-up tasks. Create a campaign and assign contacts before activating pending dates.'}
          </p>
        )}
      </section>
    </>
  );
}

function OutreachCenter({ records, reload }: { records: Records; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [bobContext, setBobContext] = useState('');
  const [emailSignature, setEmailSignature] = useState('');
  const [campaignId, setCampaignId] = useState(records.scope.campaign?.id ?? '');
  const [associateWithCampaign, setAssociateWithCampaign] = useState(false);
  const [contactFeedback, setContactFeedback] = useState<Record<string, string>>({});
  const [requestingContactId, setRequestingContactId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [latestRequestId, setLatestRequestId] = useState<string | null>(null);
  const [copiedDraftId, setCopiedDraftId] = useState<string | null>(null);
  const [editingRoleContactId, setEditingRoleContactId] = useState<string | null>(null);
  const [industry, setIndustry] = useState('All categories');
  const [query, setQuery] = useState('');
  const [roleDraft, setRoleDraft] = useState('');
  const locationSearch = useSyncExternalStore(
    subscribeToLocation,
    browserLocationSearch,
    serverLocationSearch,
  );
  const deepLink = new URLSearchParams(locationSearch);
  const targetContactId = deepLink.get('contact') ?? '';
  const targetDraftId = deepLink.get('draft') ?? '';
  const targetRequestId = deepLink.get('request') ?? '';
  const visibleContacts = records.contacts.filter(
    (contact) =>
      `${contact.firstName} ${contact.lastName} ${contact.email ?? ''} ${contact.organization?.name ?? ''}`
        .concat(` ${contact.organization?.industry ?? ''}`)
        .toLocaleLowerCase('en-US')
        .includes(query.toLocaleLowerCase('en-US')) &&
      (industry === 'All categories' || categoryDisplayLabel(contact.organization) === industry),
  );

  useEffect(() => {
    if (!targetContactId) return;
    const details = document.getElementById(
      `outreach-contact-${targetContactId}`,
    ) as HTMLDetailsElement | null;
    if (details) details.open = true;
    const targetId = targetDraftId
      ? `outreach-draft-${targetDraftId}`
      : targetRequestId
        ? `outreach-request-${targetRequestId}`
        : `outreach-contact-${targetContactId}`;
    window.requestAnimationFrame(() => {
      const target = document.getElementById(targetId);
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: 'center' });
    });
  }, [targetContactId, targetDraftId, targetRequestId]);

  async function copyDraftText(draftId: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopiedDraftId(draftId);
  }

  async function syncGmail() {
    setBusy(true);
    const response = await fetch('/api/integrations/gmail/sync', { method: 'POST' });
    const result = (await response.json().catch(() => null)) as {
      data?: { imported: number; listed: number; skipped: number };
      error?: string;
      reconnect?: string;
    } | null;
    if (response.status === 409 && result?.reconnect) {
      window.location.assign(result.reconnect);
      return;
    }
    if (!response.ok || !result?.data) {
      setMessage('Gmail could not be read. Existing outreach history was preserved.');
      setBusy(false);
      return;
    }
    setMessage(
      `Email history refreshed: ${result.data.imported} matched existing contacts; ${result.data.skipped} unmatched messages stayed out of Faro.`,
    );
    await reload();
    setBusy(false);
  }

  async function requestDraft(contactId: string, consentStatus: string) {
    const campaign = records.campaigns.find((item) => item.id === campaignId);
    const followUp = campaign
      ? records.followUps.find((item) => item.contact.id === contactId)
      : undefined;
    setRequestingContactId(contactId);
    setContactFeedback((current) => ({
      ...current,
      [contactId]: 'Creating governed IBM Bob request…',
    }));
    setBusy(true);
    const additionalContext = [
      bobContext.trim(),
      emailSignature.trim()
        ? `Include this signature verbatim at the end of the proposed email:\n${emailSignature.trim()}`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n');
    if (consentStatus === 'UNKNOWN') {
      const consentResponse = await fetch(`/api/contacts/${contactId}/consent`, {
        body: JSON.stringify({ status: 'IMPLIED' }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      if (!consentResponse.ok) {
        setContactFeedback((current) => ({
          ...current,
          [contactId]: 'Faro could not record the outreach basis. No IBM Bob request was created.',
        }));
        setBusy(false);
        setRequestingContactId(null);
        return;
      }
    }
    const response = await fetch('/api/bob/generation-requests', {
      body: JSON.stringify({
        campaignId: campaign?.id ?? null,
        associateWithCampaign: Boolean(campaign && associateWithCampaign),
        contactId,
        additionalContext,
        followUpTaskId: followUp?.id ?? null,
        objective: followUp ? 'FOLLOW_UP' : 'INITIAL_INTRODUCTION',
        tone: 'PROFESSIONAL',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    const result = (await response.json().catch(() => null)) as {
      data?: { id: string; status: string };
      error?: string;
      message?: string;
      runtimeError?: string | null;
    } | null;
    if (response.ok && result?.data) {
      const data = result.data;
      const requestId = data.id;
      setLatestRequestId(requestId);
      setContactFeedback((current) => ({
        ...current,
        [contactId]:
          data.status === 'COMPLETED'
            ? `IBM Bob returned a draft successfully. Subject and body are shown below.`
            : data.status === 'FAILED'
              ? `IBM Bob could not complete this draft${result.runtimeError ? `: ${result.runtimeError}` : '.'}`
              : `Request created successfully. IBM Bob request ${requestId} is queued for processing.`,
      }));
    } else {
      setContactFeedback((current) => ({
        ...current,
        [contactId]:
          result?.message ??
          (result?.error === 'CONSENT_UNVERIFIED'
            ? 'Faro needs a confirmed outreach basis (OPTED_IN or IMPLIED) before IBM Bob can draft.'
            : `Faro could not create the IBM Bob request${result?.error ? `: ${result.error}` : '.'}`),
      }));
    }
    await reload();
    setBusy(false);
    setRequestingContactId(null);
  }

  const persistOutreachRole = useCallback(
    async (contactId: string, payload: ContactSavePayload, attempts = 0) => {
      setBusy(true);
      const response = await fetch(`/api/contacts/${contactId}?returnTo=/outreach`, {
        body: JSON.stringify(payload),
        headers: { 'content-type': 'application/json' },
        method: 'PATCH',
      });
      const result = (await response.json().catch(() => null)) as {
        message?: string;
        reconnect?: string;
        sheetWriteBack?: { status: 'NO_CHANGES' | 'NOT_APPLICABLE' | 'WRITTEN' };
      } | null;
      if (response.status === 409 && result?.reconnect) {
        if (attempts >= 1) {
          setContactFeedback((current) => ({
            ...current,
            [contactId]:
              'Google still has not granted Sheet edit access. Reconnect from Integrations, then save the role again.',
          }));
          setBusy(false);
          return;
        }
        preservePendingContactSave({
          attempts: attempts + 1,
          contactId,
          createdAt: Date.now(),
          payload,
          returnTo: '/outreach',
        });
        window.location.assign(result.reconnect);
        return;
      }
      if (!response.ok) {
        setContactFeedback((current) => ({
          ...current,
          [contactId]: result?.message ?? 'Faro could not save this person’s role.',
        }));
        setBusy(false);
        return;
      }
      setContactFeedback((current) => ({
        ...current,
        [contactId]:
          result?.sheetWriteBack?.status === 'WRITTEN'
            ? 'Role saved in Faro and written back to this contact’s Google Sheet source row.'
            : result?.sheetWriteBack?.status === 'NOT_APPLICABLE'
              ? 'Role saved in Faro. This database-only contact has no Google Sheet source row.'
              : 'Role already matched the saved value.',
      }));
      setEditingRoleContactId(null);
      setRoleDraft('');
      await reload();
      setBusy(false);
    },
    [reload],
  );

  useEffect(() => {
    const pending = takePendingContactSave('/outreach');
    if (!pending) return;
    const resumeTimer = window.setTimeout(() => {
      void persistOutreachRole(pending.contactId, pending.payload, pending.attempts);
    }, 0);
    return () => window.clearTimeout(resumeTimer);
  }, [persistOutreachRole]);

  async function saveContactRole(contact: Records['contacts'][number]) {
    await persistOutreachRole(contact.id, {
      email: contact.email,
      firstName: contact.firstName,
      lastName: contact.lastName,
      phone: contact.phone,
      preferredChannel: contact.preferredChannel,
      timezone: contact.timezone,
      title: roleDraft.trim() || null,
      type: contact.type,
    });
  }

  return (
    <>
      {message ? (
        <InlineNotification hideCloseButton kind="info" lowContrast title={message} />
      ) : null}
      <section className="panel">
        <div className="panel__header">
          <div>
            <h2>Email tracking</h2>
            <p>
              Read-only Gmail import matches messages only to existing Faro contact email addresses.
              It never sends, deletes, labels, or modifies email.
            </p>
          </div>
          <Button disabled={busy} onClick={() => void syncGmail()} renderIcon={Renew}>
            Refresh Gmail history
          </Button>
        </div>
        <OutreachPlanningCalendar
          campaign={records.campaigns.find((campaign) => campaign.id === campaignId) ?? null}
          companyContactIds={records.contacts
            .filter((contact) => contact.organization !== null)
            .map((contact) => contact.id)}
          interactions={records.interactions.map((interaction) => ({
            contactId: interaction.contact.id,
            direction: interaction.direction,
            occurredAt: interaction.occurredAt,
          }))}
          key={campaignId || 'general'}
          referenceTime={records.planningReferenceTime}
          schedules={records.followUps
            .filter(
              (followUp) =>
                ['OPEN', 'SNOOZED'].includes(followUp.status) &&
                (!campaignId || followUp.campaign.id === campaignId),
            )
            .map((followUp) => ({
              campaignId: followUp.campaign.id,
              contactId: followUp.contact.id,
              contactName: `${followUp.contact.firstName} ${followUp.contact.lastName}`,
              dueAt: followUp.dueAt,
              id: followUp.id,
              initialAt: followUp.initialAt,
            }))}
          workspace={{
            id: records.workspace.id,
            quietHoursEnd: records.workspace.quietHoursEnd,
            quietHoursStart: records.workspace.quietHoursStart,
            timeZone: records.workspace.defaultTimezone,
          }}
        />
      </section>
      <section className="panel">
        <h2>Context for IBM Bob</h2>
        <p>
          Add the sponsorship pitch, event details, desired ask, or constraints that Bob should
          consider. This is untrusted reference material, not instructions that can override Faro’s
          safety rules.
        </p>
        <TextArea
          id="bob-extra-context"
          labelText="Extra context for the next IBM Bob draft"
          maxCount={3500}
          onChange={(event) => setBobContext(event.target.value)}
          placeholder="Example: The student developer summit is six weeks away. Ask for a 20-minute sponsorship conversation and mention the attendee audience."
          value={bobContext}
        />
        <TextArea
          id="bob-email-signature"
          labelText="Email signature (optional, included in this proposed email)"
          maxCount={2000}
          onChange={(event) => setEmailSignature(event.target.value)}
          placeholder={'Example:\nJosue Cruz\nSponsorship Lead, SF Hacks\njosue@example.com'}
          style={{ marginTop: '1rem' }}
          value={emailSignature}
        />
        {records.scope.campaign ? (
          <div className="campaign-focus-callout">
            <strong>Campaign context: {records.scope.campaign.name}</strong>
            <span>
              Focused mode keeps every draft request assigned to this campaign and its contacts.
            </span>
          </div>
        ) : (
          <label style={{ display: 'block', marginTop: '1rem' }}>
            <span>Campaign context (optional)</span>
            <select
              className="filter-select"
              onChange={(event) => setCampaignId(event.target.value)}
              value={campaignId}
            >
              <option value="">No campaign — create an unassigned draft</option>
              {records.campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {campaignId && !records.scope.campaign ? (
          <label style={{ display: 'block', marginTop: '0.75rem' }}>
            <input
              checked={associateWithCampaign}
              onChange={(event) => setAssociateWithCampaign(event.target.checked)}
              type="checkbox"
            />{' '}
            Add this contact to the selected campaign when requesting the draft
          </label>
        ) : null}
        {latestRequestId ? (
          <div className="page-actions" style={{ marginTop: '1rem' }}>
            <code>{latestRequestId}</code>
            <Button
              kind="secondary"
              onClick={() =>
                void navigator.clipboard.writeText(
                  `Use only Faro MCP. Process generation request ${latestRequestId}: get it, claim it, retrieve only approved context, then save a validated email draft with a subject and body. Do not send email.`,
                )
              }
              size="sm"
            >
              Copy instructions for Bob
            </Button>
          </div>
        ) : null}
      </section>
      <div className="filters-bar" aria-label="Outreach search filters">
        <div className="filters-bar__group">
          <label className="search-field">
            <span className="visually-hidden">Search outreach contacts</span>
            <Search aria-hidden size={16} />
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search contact, company, or email"
              type="search"
              value={query}
            />
          </label>
          <select
            aria-label="Filter outreach contacts by company category"
            className="filter-select"
            onChange={(event) => setIndustry(event.target.value)}
            value={industry}
          >
            <option>All categories</option>
            {COMPANY_CATEGORIES.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </div>
      </div>
      <section
        aria-label={`${
          records.scope.campaign?.name ?? 'Workspace'
        } outreach contacts. Scroll within this contact window to browse results.`}
        className="panel panel--flush record-scroll-region record-scroll-region--compact"
        tabIndex={0}
      >
        {visibleContacts.map((contact) => {
          const emails = records.interactions.filter((item) => item.contact.id === contact.id);
          const followUps = records.followUps.filter((item) => item.contact.id === contact.id);
          const bobRequest =
            records.bobRequests.find(
              (item) =>
                item.contactId === contact.id &&
                ((targetDraftId && item.draft?.id === targetDraftId) ||
                  (targetRequestId && item.id === targetRequestId)),
            ) ?? records.bobRequests.find((item) => item.contactId === contact.id);
          return (
            <details
              className="list-card"
              id={`outreach-contact-${contact.id}`}
              key={contact.id}
              style={{ display: 'block' }}
            >
              <summary style={{ cursor: 'pointer' }}>
                <strong>
                  {contact.firstName} {contact.lastName}
                </strong>{' '}
                · {contact.organization?.name ?? 'No organization'} ·{' '}
                {categoryDisplayLabel(contact.organization)} · {emails.length} tracked email
                {emails.length === 1 ? '' : 's'} · {followUps.length} follow-up
                {followUps.length === 1 ? '' : 's'}
              </summary>
              <div style={{ paddingTop: '1rem' }}>
                <p>
                  {contact.email ?? 'No email'} · Consent: {contact.consentStatus}
                </p>
                <div className="outreach-role">
                  <p>
                    <strong>Person’s role:</strong> {contact.title ?? 'Not specified'}
                  </p>
                  <Button
                    disabled={busy}
                    kind="ghost"
                    onClick={() => {
                      setEditingRoleContactId(contact.id);
                      setRoleDraft(contact.title ?? '');
                    }}
                    renderIcon={Edit}
                    size="sm"
                  >
                    Edit role
                  </Button>
                </div>
                {editingRoleContactId === contact.id ? (
                  <form
                    className="outreach-role__editor"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void saveContactRole(contact);
                    }}
                  >
                    <TextInput
                      id={`outreach-contact-${contact.id}-role`}
                      labelText="Person’s role / title"
                      maxLength={160}
                      onChange={(event) => setRoleDraft(event.target.value)}
                      value={roleDraft}
                    />
                    <div className="page-actions">
                      <Button
                        kind="secondary"
                        onClick={() => {
                          setEditingRoleContactId(null);
                          setRoleDraft('');
                        }}
                        size="sm"
                        type="button"
                      >
                        Cancel
                      </Button>
                      <Button disabled={busy} size="sm" type="submit">
                        {busy ? 'Saving…' : 'Save role'}
                      </Button>
                    </div>
                    <p>
                      Imported roles write back to the exact Google Sheet source row when saved.
                    </p>
                  </form>
                ) : null}
                {followUps.map((followUp) => (
                  <p key={followUp.id}>
                    <strong>Initial date:</strong> {new Date(followUp.initialAt).toLocaleString()} ·{' '}
                    <strong>Follow-up date:</strong> {new Date(followUp.dueAt).toLocaleString()} ·{' '}
                    {followUp.reason}
                  </p>
                ))}
                <ContactScheduleEditor
                  campaigns={records.campaigns}
                  consentStatus={contact.consentStatus}
                  contactId={contact.id}
                  contactName={`${contact.firstName} ${contact.lastName}`}
                  followUps={followUps}
                  reload={reload}
                  returnTo="/outreach"
                  scopeCampaignId={records.scope.campaign?.id}
                  source={contact.source}
                  timeZone={contact.timezone}
                />
                {emails.slice(0, 20).map((email) => (
                  <article
                    key={email.id}
                    style={{
                      borderTop: '1px solid var(--cds-border-subtle)',
                      padding: '0.75rem 0',
                    }}
                  >
                    <p>
                      <strong>{email.direction === 'INBOUND' ? 'Received' : 'Sent'}:</strong>{' '}
                      {email.subject ?? '(no subject)'} ·{' '}
                      {new Date(email.occurredAt).toLocaleString()}
                    </p>
                    <p>{email.bodyText.slice(0, 500)}</p>
                  </article>
                ))}
                <div className="page-actions">
                  <Button
                    disabled={
                      busy ||
                      !contact.email ||
                      contact.consentStatus === 'OPTED_OUT' ||
                      contact.consentStatus === 'SUPPRESSED'
                    }
                    onClick={() => void requestDraft(contact.id, contact.consentStatus)}
                    size="sm"
                  >
                    {requestingContactId === contact.id
                      ? 'Requesting IBM Bob draft…'
                      : contact.consentStatus === 'UNKNOWN'
                        ? 'Confirm outreach basis & request draft'
                        : 'Request IBM Bob draft'}
                  </Button>
                  {contact.consentStatus === 'UNKNOWN' ? (
                    <span>
                      By continuing, you confirm a reasonable business basis to contact this person.
                    </span>
                  ) : null}
                </div>
                {contactFeedback[contact.id] ? (
                  <InlineNotification
                    hideCloseButton
                    kind={
                      contactFeedback[contact.id]?.startsWith('Request created')
                        ? 'success'
                        : 'info'
                    }
                    lowContrast
                    style={{ marginTop: '0.75rem' }}
                    title={contactFeedback[contact.id]!}
                  />
                ) : null}
                {bobRequest ? (
                  <section
                    aria-label="Associated outreach request"
                    id={
                      bobRequest.draft
                        ? `outreach-draft-${bobRequest.draft.id}`
                        : `outreach-request-${bobRequest.id}`
                    }
                    style={{
                      borderTop: '1px solid var(--cds-border-subtle)',
                      marginTop: '0.75rem',
                      paddingTop: '0.75rem',
                    }}
                    tabIndex={-1}
                  >
                    <p>
                      <strong>Associated outreach request:</strong>{' '}
                      {bobRequest.draft
                        ? `Draft ready · ${bobRequest.draft.approvalStatus}`
                        : bobRequest.status}
                      <span>
                        {' '}
                        · initialized {new Date(bobRequest.requestedAt).toLocaleString()}
                      </span>
                    </p>
                    {bobRequest.draft ? (
                      <div aria-label="Proposed email" style={{ marginTop: '0.75rem' }}>
                        <h3>
                          {bobRequest.draft.provenance === 'IBM_BOB'
                            ? 'Generated by IBM Bob'
                            : 'Demo draft'}
                        </h3>
                        <p>
                          <strong>Subject Line</strong>
                          <br />
                          {bobRequest.draft.subject}
                        </p>
                        <p>
                          <strong>Email Description</strong>
                          <br />
                          <span style={{ whiteSpace: 'pre-wrap' }}>
                            {bobRequest.draft.bodyText}
                          </span>
                        </p>
                        <div className="page-actions" aria-label="Copy proposed email">
                          <Button
                            kind="secondary"
                            onClick={() =>
                              void copyDraftText(
                                `${bobRequest.draft!.id}:subject`,
                                bobRequest.draft!.subject,
                              )
                            }
                            size="sm"
                          >
                            {copiedDraftId === `${bobRequest.draft.id}:subject`
                              ? 'Subject copied'
                              : 'Copy subject'}
                          </Button>
                          <Button
                            kind="secondary"
                            onClick={() =>
                              void copyDraftText(
                                `${bobRequest.draft!.id}:body`,
                                bobRequest.draft!.bodyText,
                              )
                            }
                            size="sm"
                          >
                            {copiedDraftId === `${bobRequest.draft.id}:body`
                              ? 'Email copied'
                              : 'Copy email'}
                          </Button>
                          <Button
                            onClick={() =>
                              void copyDraftText(
                                `${bobRequest.draft!.id}:all`,
                                `Subject: ${bobRequest.draft!.subject}\n\n${bobRequest.draft!.bodyText}`,
                              )
                            }
                            size="sm"
                          >
                            {copiedDraftId === `${bobRequest.draft.id}:all`
                              ? 'Subject and email copied'
                              : 'Copy subject and email'}
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </section>
                ) : null}
              </div>
            </details>
          );
        })}
        {!visibleContacts.length ? (
          <p style={{ padding: '1.25rem' }}>
            {records.contacts.length
              ? 'No outreach contacts match this search and category filter.'
              : 'No contacts yet. Import a Google Sheet first.'}
          </p>
        ) : null}
      </section>
    </>
  );
}

function OrganizationRoster({
  campaignFocused,
  organizations,
  trashedOrganizations,
  updateTrash,
}: {
  campaignFocused: boolean;
  organizations: Records['organizations'];
  trashedOrganizations: Records['trashedOrganizations'];
  updateTrash: (id: string, action: 'trash' | 'restore') => Promise<void>;
}) {
  const [expanded, setExpanded] = useState<string[]>([]);
  const [industry, setIndustry] = useState('All categories');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'list' | 'industry'>('list');
  const visible = organizations.filter(
    (organization) =>
      `${organization.name} ${organization.industry} ${organization.contacts.map((contact) => `${contact.firstName} ${contact.lastName} ${contact.email ?? ''}`).join(' ')}`
        .toLocaleLowerCase('en-US')
        .includes(query.toLocaleLowerCase('en-US')) &&
      (industry === 'All categories' || categoryDisplayLabel(organization) === industry),
  );
  const industryGroups = groupCompaniesByIndustry(
    visible,
    (organization) => categoryDisplayLabel(organization),
    (organization) => organization._count.contacts,
  );
  const categorySources = summarizeCompanyCategorySources(
    organizations.map((organization) => organization.categorySource),
  );
  const organizationRow = (organization: Records['organizations'][number]) => {
    const open = expanded.includes(organization.id);
    return (
      <div key={organization.id}>
        <div className="list-card">
          <button
            aria-expanded={open}
            onClick={() =>
              setExpanded((current) =>
                current.includes(organization.id)
                  ? current.filter((id) => id !== organization.id)
                  : [...current, organization.id],
              )
            }
            style={{
              background: 'none',
              border: 0,
              cursor: 'pointer',
              flex: 1,
              padding: 0,
              textAlign: 'left',
            }}
            type="button"
          >
            <h3>{organization.name}</h3>
            <p>
              {organization.type !== 'OTHER' ? `${organization.type} · ` : ''}
              {categoryDisplayLabel(organization)} ·{' '}
              {categorySourceLabel(organization.categorySource)} · {organization._count.contacts}{' '}
              affiliated contact
              {organization._count.contacts === 1 ? '' : 's'}
              {organization.website ? ` · ${organization.website}` : ''} · {open ? 'hide' : 'show'}{' '}
              contacts
            </p>
          </button>
          {!campaignFocused ? (
            <Button
              hasIconOnly
              iconDescription={`Move ${organization.name} to Trash`}
              kind="ghost"
              onClick={() => void updateTrash(organization.id, 'trash')}
              renderIcon={TrashCan}
              size="sm"
              tooltipPosition="left"
            />
          ) : null}
        </div>
        {open ? (
          <div style={{ padding: '0 1.25rem 1.25rem' }}>
            {organization.contacts.length ? (
              <table className="faro-table">
                <thead>
                  <tr>
                    <th>Person</th>
                    <th>Affiliation / role</th>
                    <th>Contact type</th>
                    <th>Email</th>
                    <th>Consent</th>
                  </tr>
                </thead>
                <tbody>
                  {organization.contacts.map((contact) => (
                    <tr key={contact.id}>
                      <td>
                        <strong>
                          {contact.firstName} {contact.lastName}
                        </strong>
                      </td>
                      <td>{contact.title ?? `Affiliated with ${organization.name}`}</td>
                      <td>{contact.type}</td>
                      <td>{contact.email ?? 'No email'}</td>
                      <td>{contact.consentStatus}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>No active contacts are affiliated with this organization.</p>
            )}
          </div>
        ) : null}
      </div>
    );
  };
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>Active organizations</h2>
          <p>
            {organizations.length} currently present in Faro or a connected Sheet, grouped by
            canonical company category
          </p>
        </div>
      </div>
      <div className="filters-bar" aria-label="Organization search filters">
        <div className="filters-bar__group">
          <label className="search-field">
            <span className="visually-hidden">Search organizations or affiliated contacts</span>
            <Search aria-hidden size={16} />
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search organization, person, or email"
              type="search"
              value={query}
            />
          </label>
          <select
            aria-label="Filter organizations by company category"
            className="filter-select"
            onChange={(event) => setIndustry(event.target.value)}
            value={industry}
          >
            <option>All categories</option>
            {COMPANY_CATEGORIES.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </div>
      </div>
      <nav className="queue-tabs" aria-label="Organization views">
        <button
          aria-current={view === 'list' ? 'page' : undefined}
          onClick={() => setView('list')}
          type="button"
        >
          List <span>{visible.length}</span>
        </button>
        <button
          aria-current={view === 'industry' ? 'page' : undefined}
          onClick={() => setView('industry')}
          type="button"
        >
          Group by category <span>{industryGroups.length}</span>
        </button>
      </nav>
      {view === 'list' ? (
        <section
          className="panel panel--flush record-scroll-region"
          aria-label="Organizations and affiliated contacts. Scroll within this list to browse results."
          tabIndex={0}
        >
          {visible.map(organizationRow)}
          {!visible.length ? (
            <p style={{ padding: '1.25rem' }}>
              {organizations.length
                ? 'No organizations or affiliated contacts match that search.'
                : 'No active organizations yet.'}
            </p>
          ) : null}
        </section>
      ) : (
        <div
          aria-label="Organizations grouped by company category. Scroll within this list to browse results."
          className="industry-group-grid record-scroll-region"
          role="region"
          tabIndex={0}
        >
          {industryGroups.map((group) => (
            <section className="panel panel--flush industry-group" key={group.industry}>
              <div className="industry-group__header">
                <div>
                  <p className="eyebrow">Company category</p>
                  <h3>{group.industry}</h3>
                </div>
                <p>
                  <strong>{group.companyCount}</strong> companies
                  <span>{group.contactCount} contacts</span>
                </p>
              </div>
              {group.companies.map(organizationRow)}
            </section>
          ))}
          {!industryGroups.length ? (
            <section className="panel">
              <p>No organizations or affiliated contacts match that search.</p>
            </section>
          ) : null}
        </div>
      )}
      {!campaignFocused ? (
        <section
          className="panel panel--flush"
          style={{ marginTop: '2rem' }}
          aria-labelledby="organization-trash-title"
        >
          <div className="panel__header" style={{ padding: '1.25rem' }}>
            <div>
              <h2 id="organization-trash-title">Trash</h2>
              <p>
                Organizations removed from their connected Sheet. Returning rows are restored
                automatically.
              </p>
            </div>
          </div>
          {trashedOrganizations.length ? (
            <div
              aria-label="Trashed organizations. Scroll within this list to browse results."
              className="record-scroll-region record-scroll-region--compact"
              role="region"
              tabIndex={0}
            >
              {trashedOrganizations.map((organization) => (
                <div className="list-card" key={organization.id}>
                  <div>
                    <h3>{organization.name}</h3>
                    <p>
                      {organization.type !== 'OTHER' ? `${organization.type} · ` : ''}
                      {categoryDisplayLabel(organization)} · removed{' '}
                      {new Date(organization.deletedAt).toLocaleString()} ·{' '}
                      {organization._count.contacts} archived contact
                      {organization._count.contacts === 1 ? '' : 's'}
                    </p>
                  </div>
                  <Button
                    kind="ghost"
                    onClick={() => void updateTrash(organization.id, 'restore')}
                    renderIcon={Renew}
                    size="sm"
                  >
                    Restore
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ padding: '1.25rem' }}>Trash is empty.</p>
          )}
        </section>
      ) : null}
      <aside
        aria-labelledby="organization-category-method-title"
        className="organization-category-note"
      >
        <div>
          <p className="eyebrow">Category methodology</p>
          <h2 id="organization-category-method-title">How these companies were categorized</h2>
        </div>
        <dl aria-label="Category sources across active organizations">
          <div>
            <dt>Sheet category</dt>
            <dd>{categorySources.sourceField}</dd>
          </div>
          <div>
            <dt>Imported taxonomy</dt>
            <dd>{categorySources.importedTaxonomy}</dd>
          </div>
          <div>
            <dt>Wikidata</dt>
            <dd>{categorySources.wikidata}</dd>
          </div>
          <div>
            <dt>Name/domain rules</dt>
            <dd>{categorySources.nameOrDomain}</dd>
          </div>
          <div>
            <dt>Best effort</dt>
            <dd>{categorySources.bestEffort}</dd>
          </div>
          {categorySources.unrecorded ? (
            <div>
              <dt>Legacy / unrecorded</dt>
              <dd>{categorySources.unrecorded}</dd>
            </div>
          ) : null}
        </dl>
        <p>
          Faro first normalizes an explicit industry or sector from the connected Sheet. Imported
          taxonomy columns can include LinkedIn Industry, Crunchbase or Clearbit categories,{' '}
          <a
            aria-label={`${COMPANY_CATEGORY_REFERENCE_SOURCES.gics.label} source (opens in a new tab)`}
            href={COMPANY_CATEGORY_REFERENCE_SOURCES.gics.href}
            rel="noreferrer"
            target="_blank"
          >
            {COMPANY_CATEGORY_REFERENCE_SOURCES.gics.label}
          </a>
          ,{' '}
          <a
            aria-label={`${COMPANY_CATEGORY_REFERENCE_SOURCES.naics.label} source (opens in a new tab)`}
            href={COMPANY_CATEGORY_REFERENCE_SOURCES.naics.href}
            rel="noreferrer"
            target="_blank"
          >
            {COMPANY_CATEGORY_REFERENCE_SOURCES.naics.label}
          </a>
          , and SIC descriptions. Those values come from your Sheet; Faro does not contact those
          providers.
        </p>
        <p>
          <strong>Direct third-party lookup:</strong> when local evidence is unresolved, Faro can
          verify a company match and read{' '}
          <a
            aria-label={`${COMPANY_CATEGORY_REFERENCE_SOURCES.wikidata.label} source (opens in a new tab)`}
            href={COMPANY_CATEGORY_REFERENCE_SOURCES.wikidata.href}
            rel="noreferrer"
            target="_blank"
          >
            {COMPANY_CATEGORY_REFERENCE_SOURCES.wikidata.label}
          </a>
          . A supplied website must match the Wikidata official website; otherwise Faro requires one
          exact-name company match. Remaining companies use bounded name/domain rules or a visibly
          lower-confidence best-effort category.
        </p>
      </aside>
    </>
  );
}

function CampaignAnalyticsView({
  campaigns,
  organizations,
  selectedId,
  setSelectedId,
}: {
  campaigns: CampaignAnalytics[];
  organizations: Records['organizations'];
  selectedId: string;
  setSelectedId: (id: string) => void;
}) {
  const campaign = campaigns.find((item) => item.id === selectedId) ?? campaigns[0];
  if (!campaign)
    return (
      <InlineNotification
        hideCloseButton
        kind="info"
        lowContrast
        title="No campaigns to analyze"
        subtitle="Create a campaign and associate contacts to begin."
      />
    );
  return (
    <>
      <section className="panel">
        <label>
          <span>Campaign</span>
          <select
            className="filter-select"
            value={campaign.id}
            onChange={(event) => setSelectedId(event.target.value)}
          >
            {campaigns.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <p>{campaign.objective}</p>
      </section>
      <section
        className="metric-grid metric-grid--compact"
        aria-label={`${campaign.name} analytics`}
      >
        <MetricCard
          change="associated"
          detail="campaign audience"
          direction="up"
          label="Contacts"
          value={String(campaign.contacts)}
        />
        <MetricCard
          change={`${campaign.responses} responses`}
          detail={`${campaign.delivered} delivered`}
          direction="up"
          label="Response rate"
          value={`${campaign.responseRate}%`}
        />
        <MetricCard
          change={`${campaign.positiveResponses} positive`}
          detail="of classified responses"
          direction="up"
          label="Positive rate"
          value={`${campaign.positiveResponseRate}%`}
        />
        <MetricCard
          change={`${campaign.awaitingBob} awaiting Bob`}
          detail={`${campaign.draftsReady} drafts ready`}
          direction={campaign.awaitingBob ? 'warn' : 'up'}
          label="Open follow-ups"
          value={String(campaign.followUpsOpen)}
        />
      </section>
      <CampaignPulseChart
        campaigns={campaigns.map((item) => ({
          contacts: item.contacts,
          followUpsOpen: item.followUpsOpen,
          id: item.id,
          name: item.name,
          positiveResponseRate: item.positiveResponseRate,
          responseRate: item.responseRate,
        }))}
        onSelectedIdChange={setSelectedId}
        selectedId={campaign.id}
      />
      <CompanyCategoryGraph
        companies={organizations.map((organization) => ({
          contacts: organization._count.contacts,
          id: organization.id,
          industry: categoryDisplayLabel(organization),
          name: organization.name,
        }))}
      />
      <section className="panel">
        <h2>Campaign database activity</h2>
        <p>
          {campaign.interactions} interactions recorded. Average response time:{' '}
          {campaign.averageResponseMinutes === null
            ? 'not enough data'
            : `${campaign.averageResponseMinutes} minutes`}
          .
        </p>
        <p>
          All metrics are calculated from records associated with this campaign; no fictional values
          are included.
        </p>
      </section>
    </>
  );
}
