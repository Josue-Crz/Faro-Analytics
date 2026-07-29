'use client';

import {
  ArrowLeft,
  Calendar,
  Checkmark,
  DataBase,
  Edit,
  Search,
  TrashCan,
  UserFollow,
} from '@carbon/icons-react';
import { Button, InlineNotification, TextArea, TextInput } from '@carbon/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { categorizeOrganization, COMPANY_CATEGORIES } from '@faro/core';

import { PageHeader } from './PageHeader';
import { StatusBadge } from './StatusBadge';

function categoryDisplayLabel(organization?: { industry: string; name: string } | null): string {
  if (!organization) return 'No company category';
  return organization.industry === 'Other'
    ? categorizeOrganization({ name: organization.name }).category
    : organization.industry;
}

interface DataSource {
  displayName: string;
  id: string;
  lastErrorAt: string | null;
  lastErrorCode: string | null;
  lastSyncedAt: string | null;
  readRange: string;
  schedule: string | null;
  status: string;
  worksheetId: string;
}

interface ContactSummary {
  consentStatus: string;
  email: string | null;
  firstName: string;
  id: string;
  lastName: string;
  organization: { industry: string; name: string } | null;
  source: string | null;
  title: string | null;
}

interface CampaignDetailData {
  campaign: {
    _count: { bobRequests: number; interactions: number };
    campaignContacts: Array<{
      contact: ContactSummary & {
        interactions: Array<{
          direction: string;
          occurredAt: string;
          subject: string | null;
        }>;
      };
      nextActionAt: string | null;
      priority: string;
      stage: string;
    }>;
    followUpTasks: Array<{
      contact: { firstName: string; id: string; lastName: string };
      dueAt: string;
      id: string;
      priority: string;
      reason: string;
      status: string;
    }>;
    endAt: string | null;
    id: string;
    name: string;
    objective: string;
    owner: { name: string };
    sheetConnection: DataSource | null;
    sheetConnectionId: string | null;
    startAt: string | null;
    status: string;
    type: string;
    updatedAt: string;
  };
  candidateContacts: ContactSummary[];
  dataSources: DataSource[];
}

interface CampaignEditDraft {
  endDate: string;
  name: string;
  objective: string;
  startDate: string;
  type: string;
}

function campaignEditDraft(campaign: CampaignDetailData['campaign']): CampaignEditDraft {
  return {
    endDate: campaign.endAt?.slice(0, 10) ?? '',
    name: campaign.name,
    objective: campaign.objective,
    startDate: campaign.startAt?.slice(0, 10) ?? '',
    type: campaign.type,
  };
}

function displayCampaignDate(value: string | null): string {
  if (!value) return 'Not assigned';
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
    year: 'numeric',
  }).format(new Date(value));
}

function sourceDescription(source: string | null, campaignSource: DataSource | null): string {
  if (!source) return 'Manual workspace record';
  if (campaignSource && source === `google-sheets:${campaignSource.id}`) {
    return `${campaignSource.displayName} / ${campaignSource.worksheetId}`;
  }
  if (source.startsWith('google-sheets:')) return 'Another connected Google Sheet';
  return source;
}

export function ConnectedCampaignDetail({
  campaignId,
  focusedCampaignId,
  onFocusCampaign,
  updatingFocus,
}: {
  campaignId: string;
  focusedCampaignId: string | null;
  onFocusCampaign: (campaignId: string) => Promise<void>;
  updatingFocus: boolean;
}) {
  const router = useRouter();
  const [data, setData] = useState<CampaignDetailData | null>(null);
  const [editDraft, setEditDraft] = useState<CampaignEditDraft | null>(null);
  const [editingCampaign, setEditingCampaign] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [industry, setIndustry] = useState('All categories');
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [requestingContactId, setRequestingContactId] = useState<string | null>(null);
  const [savingCampaignAction, setSavingCampaignAction] = useState<string | null>(null);
  const [savingSource, setSavingSource] = useState(false);
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState('');

  const load = useCallback(async () => {
    const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}`, {
      cache: 'no-store',
    });
    if (!response.ok) {
      setError(
        response.status === 404 ? 'Campaign not found in this workspace.' : 'Campaign unavailable.',
      );
      return;
    }
    const result = (await response.json()) as { data: CampaignDetailData };
    setData(result.data);
    setEditDraft(campaignEditDraft(result.data.campaign));
    setSelectedSourceId(result.data.campaign.sheetConnectionId ?? '');
    setError(null);
  }, [campaignId]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/campaigns/${encodeURIComponent(campaignId)}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(response.status === 404 ? 'not-found' : 'unavailable');
        }
        return (await response.json()) as { data: CampaignDetailData };
      })
      .then((result) => {
        setData(result.data);
        setEditDraft(campaignEditDraft(result.data.campaign));
        setSelectedSourceId(result.data.campaign.sheetConnectionId ?? '');
        setError(null);
      })
      .catch((loadError: unknown) => {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        setError(
          loadError instanceof Error && loadError.message === 'not-found'
            ? 'Campaign not found in this workspace.'
            : 'Campaign unavailable.',
        );
      });
    return () => controller.abort();
  }, [campaignId]);

  const visibleCandidates = useMemo(() => {
    const normalizedQuery = query.toLocaleLowerCase('en-US');
    return (
      data?.candidateContacts.filter(
        (contact) =>
          `${contact.firstName} ${contact.lastName} ${contact.email ?? ''} ${contact.organization?.name ?? ''}`
            .concat(` ${contact.organization?.industry ?? ''}`)
            .toLocaleLowerCase('en-US')
            .includes(normalizedQuery) &&
          (industry === 'All categories' ||
            categoryDisplayLabel(contact.organization) === industry),
      ) ?? []
    );
  }, [data?.candidateContacts, industry, query]);

  async function assignContacts() {
    if (!selectedContactIds.length) return;
    const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/contacts`, {
      body: JSON.stringify({ contactIds: selectedContactIds }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    if (!response.ok) {
      setNotice(
        'Those contacts could not be added. They may belong to a different polled data source.',
      );
      return;
    }
    setNotice(
      `${selectedContactIds.length} contact${selectedContactIds.length === 1 ? '' : 's'} added to this campaign workspace.`,
    );
    setSelectedContactIds([]);
    await load();
  }

  async function updateSource() {
    setSavingSource(true);
    const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}`, {
      body: JSON.stringify({
        action: 'UPDATE_SOURCE',
        sheetConnectionId: selectedSourceId || null,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'PATCH',
    });
    setSavingSource(false);
    if (!response.ok) {
      setNotice('Faro could not update this campaign data source.');
      return;
    }
    setNotice(
      selectedSourceId
        ? 'Campaign data source updated. Its available contact pool now follows that source.'
        : 'Campaign now uses the workspace database without an external polling source.',
    );
    window.dispatchEvent(new Event('faro:workspace-context-changed'));
    setSelectedContactIds([]);
    await load();
  }

  function updateCampaignDraft(field: keyof CampaignEditDraft, value: string) {
    setEditDraft((current) => (current ? { ...current, [field]: value } : current));
  }

  async function saveCampaignDetails() {
    if (!editDraft) return;
    if (Boolean(editDraft.startDate) !== Boolean(editDraft.endDate)) {
      setNotice('Choose both a start and end date, or clear both dates.');
      return;
    }
    setSavingCampaignAction('update');
    const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}`, {
      body: JSON.stringify({
        action: 'UPDATE_DETAILS',
        endDate: editDraft.endDate || null,
        name: editDraft.name,
        objective: editDraft.objective,
        startDate: editDraft.startDate || null,
        type: editDraft.type,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'PATCH',
    });
    setSavingCampaignAction(null);
    if (!response.ok) {
      setNotice('Faro could not save the campaign. Check its name, objective, and date range.');
      return;
    }
    setEditingCampaign(false);
    setNotice('Campaign details and date range saved.');
    window.dispatchEvent(new Event('faro:workspace-context-changed'));
    await load();
  }

  async function completeCampaign() {
    if (
      !window.confirm(
        'Complete this campaign? Open or snoozed follow-ups, scheduled reminders, and waiting draft requests will be cancelled.',
      )
    ) {
      return;
    }
    setSavingCampaignAction('complete');
    const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}`, {
      body: JSON.stringify({ action: 'COMPLETE' }),
      headers: { 'content-type': 'application/json' },
      method: 'PATCH',
    });
    setSavingCampaignAction(null);
    if (!response.ok) {
      setNotice('Faro could not complete this campaign.');
      return;
    }
    setNotice('Campaign completed. New operational actions are now disabled.');
    await load();
  }

  async function deleteCampaign() {
    if (
      !window.confirm(
        'Delete this campaign workspace? It will disappear from active campaigns, its pending work will be cancelled, and any saved campaign focus will return to the main workspace.',
      )
    ) {
      return;
    }
    setSavingCampaignAction('delete');
    const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}`, {
      method: 'DELETE',
    });
    setSavingCampaignAction(null);
    if (!response.ok) {
      setNotice('Faro could not delete this campaign.');
      return;
    }
    window.dispatchEvent(new Event('faro:workspace-context-changed'));
    router.push('/campaigns');
    router.refresh();
  }

  async function requestCampaignDraft(contact: ContactSummary) {
    if (contact.consentStatus !== 'OPTED_IN' && contact.consentStatus !== 'IMPLIED') {
      setNotice(
        'Confirm the contact outreach basis in the Contacts database before requesting a draft.',
      );
      return;
    }
    setRequestingContactId(contact.id);
    const followUp = data?.campaign.followUpTasks.find((item) => item.contact.id === contact.id);
    const response = await fetch('/api/bob/generation-requests', {
      body: JSON.stringify({
        associateWithCampaign: false,
        campaignId,
        contactId: contact.id,
        followUpTaskId: followUp?.id ?? null,
        objective: followUp ? 'FOLLOW_UP' : 'INITIAL_INTRODUCTION',
        tone: 'PROFESSIONAL',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    const result = (await response.json().catch(() => null)) as {
      data?: { id: string };
      message?: string;
    } | null;
    setRequestingContactId(null);
    setNotice(
      response.ok
        ? `IBM Bob request ${result?.data?.id ?? ''} was created for human review. No message was sent.`
        : (result?.message ?? 'Faro could not create this campaign draft request.'),
    );
    await load();
  }

  if (error) {
    return (
      <div className="page-shell">
        <Link className="back-link" href="/campaigns">
          <ArrowLeft size={16} /> All campaign workspaces
        </Link>
        <InlineNotification hideCloseButton kind="error" title={error} />
      </div>
    );
  }
  if (!data) {
    return (
      <div
        aria-label="Loading campaign workspace"
        className="skeleton"
        style={{ height: '24rem' }}
      />
    );
  }

  const { campaign } = data;
  const source = campaign.sheetConnection;
  const sourceChanged = selectedSourceId !== (campaign.sheetConnectionId ?? '');
  const isFocusedCampaign = focusedCampaignId === campaign.id;
  const blockedByOtherFocus = Boolean(focusedCampaignId && !isFocusedCampaign);
  const campaignCompleted = campaign.status === 'COMPLETED';
  const campaignOperationsBlocked = blockedByOtherFocus || campaignCompleted;
  return (
    <div className="page-shell">
      <Link className="back-link" href="/campaigns">
        <ArrowLeft size={16} /> All campaign workspaces
      </Link>
      <PageHeader
        actions={
          <Button
            disabled={isFocusedCampaign || updatingFocus}
            kind={isFocusedCampaign ? 'tertiary' : 'primary'}
            onClick={() => void onFocusCampaign(campaign.id)}
          >
            {isFocusedCampaign
              ? 'Current app focus'
              : updatingFocus
                ? 'Switching focus…'
                : focusedCampaignId
                  ? 'Switch app focus here'
                  : 'Focus entire app here'}
          </Button>
        }
        description={campaign.objective}
        eyebrow={`${campaign.type.replaceAll('_', ' ')} · ${campaign.status} · Owned by ${campaign.owner.name}`}
        title={campaign.name}
      />
      <p className="campaign-focus-help">
        {campaignCompleted
          ? 'This campaign is complete. Its history and details remain available, while contacts, data-source changes, follow-ups, and new draft requests are read-only.'
          : isFocusedCampaign
            ? 'Dashboard, contacts, outreach, follow-ups, analytics, and data sources now stay scoped to this campaign until you explicitly return to the main workspace.'
            : blockedByOtherFocus
              ? 'This campaign is view-only while another campaign is focused. Use the switch button before changing its contacts, source, or outreach.'
              : 'Opening a campaign does not change your workspace. Use the focus button to keep the entire app assigned here.'}
      </p>
      {notice ? (
        <InlineNotification hideCloseButton kind="info" lowContrast title={notice} />
      ) : null}

      <section className="panel campaign-management" aria-labelledby="campaign-management-title">
        <div className="panel__header">
          <div>
            <p className="eyebrow">Campaign controls</p>
            <h2 id="campaign-management-title">Details, schedule, and lifecycle</h2>
            <p>Edit this campaign, assign its date range, mark it complete, or remove it.</p>
          </div>
          <Calendar aria-hidden size={24} />
        </div>
        {editingCampaign && editDraft ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void saveCampaignDetails();
            }}
          >
            <fieldset disabled={Boolean(savingCampaignAction) || blockedByOtherFocus}>
              <legend className="visually-hidden">Edit campaign details</legend>
              <div className="campaign-management__form">
                <TextInput
                  id={`campaign-${campaign.id}-name`}
                  labelText="Campaign name"
                  onChange={(event) => updateCampaignDraft('name', event.target.value)}
                  required
                  value={editDraft.name}
                />
                <label>
                  <span>Campaign type</span>
                  <select
                    className="filter-select"
                    onChange={(event) => updateCampaignDraft('type', event.target.value)}
                    value={editDraft.type}
                  >
                    <option value="SPONSORSHIP">Sponsorship</option>
                    <option value="PARTNERSHIP">Partnership</option>
                    <option value="PARTICIPANT_OUTREACH">Participant outreach</option>
                    <option value="FUNDRAISING">Fundraising</option>
                    <option value="EVENT">Event</option>
                    <option value="COMMUNITY">Community</option>
                  </select>
                </label>
                <TextArea
                  className="campaign-management__objective"
                  id={`campaign-${campaign.id}-objective`}
                  labelText="Campaign objective"
                  onChange={(event) => updateCampaignDraft('objective', event.target.value)}
                  required
                  value={editDraft.objective}
                />
                <TextInput
                  id={`campaign-${campaign.id}-start-date`}
                  labelText="Start date"
                  max={editDraft.endDate || undefined}
                  onChange={(event) => updateCampaignDraft('startDate', event.target.value)}
                  type="date"
                  value={editDraft.startDate}
                />
                <TextInput
                  id={`campaign-${campaign.id}-end-date`}
                  labelText="End date"
                  min={editDraft.startDate || undefined}
                  onChange={(event) => updateCampaignDraft('endDate', event.target.value)}
                  type="date"
                  value={editDraft.endDate}
                />
              </div>
              <div className="page-actions">
                <Button
                  kind="secondary"
                  onClick={() => {
                    setEditDraft(campaignEditDraft(campaign));
                    setEditingCampaign(false);
                  }}
                  type="button"
                >
                  Cancel
                </Button>
                <Button
                  disabled={!editDraft.name.trim() || !editDraft.objective.trim()}
                  type="submit"
                >
                  {savingCampaignAction === 'update' ? 'Saving…' : 'Save campaign'}
                </Button>
              </div>
            </fieldset>
          </form>
        ) : (
          <>
            <dl className="campaign-management__summary">
              <div>
                <dt>Status</dt>
                <dd>{campaign.status.replaceAll('_', ' ')}</dd>
              </div>
              <div>
                <dt>Start date</dt>
                <dd>{displayCampaignDate(campaign.startAt)}</dd>
              </div>
              <div>
                <dt>End date</dt>
                <dd>{displayCampaignDate(campaign.endAt)}</dd>
              </div>
            </dl>
            <div className="page-actions">
              <Button
                disabled={blockedByOtherFocus || Boolean(savingCampaignAction)}
                kind="secondary"
                onClick={() => setEditingCampaign(true)}
                renderIcon={Edit}
              >
                Edit campaign
              </Button>
              <Button
                disabled={blockedByOtherFocus || campaignCompleted || Boolean(savingCampaignAction)}
                kind="tertiary"
                onClick={() => void completeCampaign()}
                renderIcon={Checkmark}
              >
                {campaignCompleted ? 'Campaign complete' : 'Complete campaign'}
              </Button>
              <Button
                disabled={blockedByOtherFocus || Boolean(savingCampaignAction)}
                kind="danger--ghost"
                onClick={() => void deleteCampaign()}
                renderIcon={TrashCan}
              >
                {savingCampaignAction === 'delete' ? 'Deleting…' : 'Delete campaign'}
              </Button>
            </div>
          </>
        )}
      </section>

      <section className="campaign-source-panel" aria-labelledby="campaign-source-title">
        <div className="campaign-source-panel__identity">
          <DataBase aria-hidden size={24} />
          <div>
            <p className="eyebrow">Campaign database</p>
            <h2 id="campaign-source-title">
              {source ? source.displayName : 'Faro workspace database'}
            </h2>
            <p>
              {source
                ? `${source.worksheetId} · ${source.readRange} · last synced ${
                    source.lastSyncedAt ? new Date(source.lastSyncedAt).toLocaleString() : 'never'
                  }`
                : 'No external source is being polled for this campaign.'}
            </p>
          </div>
          <StatusBadge
            label={source?.status.replaceAll('_', ' ') ?? 'Database only'}
            status={source?.status === 'CONNECTED' ? 'ready' : 'attention'}
          />
        </div>
        <div className="campaign-source-panel__controls">
          <label>
            <span>Polled data source</span>
            <select
              className="filter-select"
              disabled={campaignOperationsBlocked}
              onChange={(event) => setSelectedSourceId(event.target.value)}
              value={selectedSourceId}
            >
              <option value="">Faro database only · no external poll</option>
              {data.dataSources.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.displayName} / {item.worksheetId} · {item.status.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          <Button
            disabled={campaignOperationsBlocked || !sourceChanged || savingSource}
            kind="secondary"
            onClick={() => void updateSource()}
          >
            {savingSource ? 'Saving…' : 'Save source'}
          </Button>
          <Button
            disabled={campaignOperationsBlocked}
            href="/integrations/google-sheets"
            kind="ghost"
          >
            Manage sources
          </Button>
        </div>
      </section>

      <section
        className="metric-grid metric-grid--compact campaign-workspace-metrics"
        aria-label="Campaign workspace totals"
      >
        <article className="metric-card">
          <p className="metric-card__label">Campaign contacts</p>
          <p className="metric-card__value">{campaign.campaignContacts.length}</p>
          <p className="table-subtext">Accessible only inside this campaign workspace</p>
        </article>
        <article className="metric-card">
          <p className="metric-card__label">Open follow-ups</p>
          <p className="metric-card__value">{campaign.followUpTasks.length}</p>
          <p className="table-subtext">Scoped to this campaign</p>
        </article>
        <article className="metric-card">
          <p className="metric-card__label">Interactions</p>
          <p className="metric-card__value">{campaign._count.interactions}</p>
          <p className="table-subtext">Tracked campaign activity</p>
        </article>
        <article className="metric-card">
          <p className="metric-card__label">IBM Bob requests</p>
          <p className="metric-card__value">{campaign._count.bobRequests}</p>
          <p className="table-subtext">Human-reviewed drafts only</p>
        </article>
      </section>

      <section className="panel" aria-labelledby="add-campaign-contacts-title">
        <div className="panel__header">
          <div>
            <h2 id="add-campaign-contacts-title">Add contacts to this campaign</h2>
            <p>
              {source
                ? `Showing contacts from ${source.displayName} plus manually created workspace records.`
                : 'Showing contacts from the full Faro workspace database.'}
            </p>
          </div>
          <UserFollow aria-hidden size={24} />
        </div>
        <div className="filters-bar" aria-label="Available campaign contact filters">
          <div className="filters-bar__group">
            <label className="search-field">
              <span className="visually-hidden">Search available contacts</span>
              <Search aria-hidden size={16} />
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search available contacts"
                type="search"
                value={query}
              />
            </label>
            <select
              aria-label="Filter available contacts by company category"
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
        <div
          aria-label="Contacts available to add"
          className="campaign-candidate-list"
          tabIndex={0}
        >
          {visibleCandidates.map((contact) => (
            <label className="campaign-candidate" key={contact.id}>
              <input
                checked={selectedContactIds.includes(contact.id)}
                disabled={campaignOperationsBlocked}
                onChange={(event) =>
                  setSelectedContactIds((current) =>
                    event.target.checked
                      ? [...current, contact.id]
                      : current.filter((id) => id !== contact.id),
                  )
                }
                type="checkbox"
              />
              <span>
                <strong>
                  {contact.firstName} {contact.lastName}
                </strong>
                <small>
                  {contact.organization?.name ?? 'No company'} ·{' '}
                  {categoryDisplayLabel(contact.organization)} ·{' '}
                  {sourceDescription(contact.source, source)}
                </small>
              </span>
            </label>
          ))}
          {!visibleCandidates.length ? (
            <p className="empty-inline">
              No available contacts match this campaign source and filter.
            </p>
          ) : null}
        </div>
        <div className="page-actions" style={{ marginTop: '1rem' }}>
          <Button
            disabled={campaignOperationsBlocked || !visibleCandidates.length}
            kind="ghost"
            onClick={() =>
              setSelectedContactIds((current) => [
                ...new Set([...current, ...visibleCandidates.map((contact) => contact.id)]),
              ])
            }
            size="sm"
          >
            Select shown
          </Button>
          <Button
            disabled={campaignOperationsBlocked || !selectedContactIds.length}
            kind="ghost"
            onClick={() => setSelectedContactIds([])}
            size="sm"
          >
            Clear
          </Button>
          <Button
            disabled={campaignOperationsBlocked || !selectedContactIds.length}
            onClick={() => void assignContacts()}
            size="sm"
          >
            Add {selectedContactIds.length || ''} contact
            {selectedContactIds.length === 1 ? '' : 's'}
          </Button>
        </div>
      </section>

      <section className="panel panel--flush" aria-labelledby="campaign-contacts-title">
        <div className="panel__header" style={{ padding: '1.25rem' }}>
          <div>
            <h2 id="campaign-contacts-title">Campaign contacts</h2>
            <p>Open a contact here to see its campaign-specific status and next action.</p>
          </div>
        </div>
        {campaign.campaignContacts.map((membership) => {
          const contact = membership.contact;
          const latest = contact.interactions[0];
          return (
            <details className="campaign-contact-card" key={contact.id}>
              <summary>
                <span className="avatar" aria-hidden>
                  {contact.firstName[0]}
                  {contact.lastName[0]}
                </span>
                <span>
                  <strong>
                    {contact.firstName} {contact.lastName}
                  </strong>
                  <small>
                    {contact.organization?.name ?? 'No company'} ·{' '}
                    {categoryDisplayLabel(contact.organization)}
                  </small>
                </span>
                <span className="campaign-contact-card__state">
                  {membership.stage} · {membership.priority}
                </span>
              </summary>
              <dl className="campaign-contact-details">
                <div>
                  <dt>Email</dt>
                  <dd>{contact.email ?? 'Not available'}</dd>
                </div>
                <div>
                  <dt>Role</dt>
                  <dd>{contact.title ?? 'Not specified'}</dd>
                </div>
                <div>
                  <dt>Consent</dt>
                  <dd>{contact.consentStatus}</dd>
                </div>
                <div>
                  <dt>Database source</dt>
                  <dd>{sourceDescription(contact.source, source)}</dd>
                </div>
                <div>
                  <dt>Latest interaction</dt>
                  <dd>
                    {latest
                      ? `${latest.direction} · ${latest.subject ?? 'No subject'} · ${new Date(
                          latest.occurredAt,
                        ).toLocaleString()}`
                      : 'No tracked interaction'}
                  </dd>
                </div>
                <div>
                  <dt>Next action</dt>
                  <dd>
                    {membership.nextActionAt
                      ? new Date(membership.nextActionAt).toLocaleString()
                      : 'Not scheduled'}
                  </dd>
                </div>
              </dl>
              <div className="campaign-contact-actions">
                <Button
                  disabled={
                    campaignOperationsBlocked ||
                    requestingContactId === contact.id ||
                    (contact.consentStatus !== 'OPTED_IN' && contact.consentStatus !== 'IMPLIED')
                  }
                  kind="tertiary"
                  onClick={() => void requestCampaignDraft(contact)}
                  size="sm"
                >
                  {requestingContactId === contact.id
                    ? 'Creating request…'
                    : 'Request IBM Bob draft'}
                </Button>
                <span>
                  {contact.consentStatus === 'OPTED_IN' || contact.consentStatus === 'IMPLIED'
                    ? 'Creates a governed draft request; it never sends automatically.'
                    : 'Review outreach basis in Contacts first.'}
                </span>
              </div>
            </details>
          );
        })}
        {!campaign.campaignContacts.length ? (
          <p className="empty-inline">
            No contacts in this campaign yet. Add them from the source-scoped list above.
          </p>
        ) : null}
      </section>

      <section className="panel panel--flush" aria-labelledby="campaign-follow-ups-title">
        <div className="panel__header" style={{ padding: '1.25rem' }}>
          <div>
            <h2 id="campaign-follow-ups-title">Campaign follow-ups</h2>
            <p>Only tasks attached to this campaign workspace</p>
          </div>
        </div>
        {campaign.followUpTasks.map((followUp) => (
          <Link
            className="list-card"
            href={`/follow-ups?task=${encodeURIComponent(followUp.id)}`}
            key={followUp.id}
            style={{ color: 'inherit', textDecoration: 'none' }}
          >
            <div>
              <h3>
                {followUp.contact.firstName} {followUp.contact.lastName}
              </h3>
              <p>{followUp.reason}</p>
            </div>
            <div className="list-card__meta">
              <StatusBadge
                label={`${followUp.status} · ${followUp.priority}`}
                status={followUp.priority === 'URGENT' ? 'issue' : 'attention'}
              />
              <time dateTime={followUp.dueAt}>{new Date(followUp.dueAt).toLocaleString()}</time>
            </div>
          </Link>
        ))}
        {!campaign.followUpTasks.length ? (
          <p className="empty-inline">No open follow-ups in this campaign.</p>
        ) : null}
      </section>
    </div>
  );
}
