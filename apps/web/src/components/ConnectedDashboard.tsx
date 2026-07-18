'use client';

import { Renew } from '@carbon/icons-react';
import { Button, InlineNotification } from '@carbon/react';
import { useEffect, useState } from 'react';

import { MetricCard } from './MetricCard';
import { PageHeader } from './PageHeader';
import { StatusBadge } from './StatusBadge';

interface ConnectedData {
  awaitingBob: number;
  campaign: { id: string; name: string } | null;
  campaigns: number;
  connection: {
    displayName: string;
    lastErrorAt: string | null;
    lastErrorCode: string | null;
    lastSyncedAt: string | null;
    status: 'CONNECTED' | 'NEEDS_AUTH' | 'SYNC_ISSUE' | 'DISABLED';
    syncRuns: Array<{
      errorSummary: string | null;
      rowsFailed: number;
      status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'PARTIAL' | 'FAILED' | 'DRY_RUN';
    }>;
    worksheetId: string;
  } | null;
  contacts: number;
  followUps: number;
  organizations: number;
  recentContacts: Array<{
    consentStatus: string;
    email: string | null;
    firstName: string;
    id: string;
    lastName: string;
    organization: { name: string } | null;
  }>;
  userName: string;
  workspaceId: string;
}

export function ConnectedDashboard() {
  const [data, setData] = useState<ConnectedData | null>(null);
  const [error, setError] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    void fetch('/api/dashboard/connected', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('dashboard');
        return (await response.json()) as { data: ConnectedData };
      })
      .then((result) => setData(result.data))
      .catch(() => setError(true));
  }, []);
  if (error) {
    return (
      <InlineNotification hideCloseButton kind="error" title="Connected dashboard unavailable" />
    );
  }
  if (!data)
    return (
      <div
        className="skeleton"
        style={{ height: '20rem' }}
        aria-label="Loading connected dashboard"
      />
    );
  const latestRun = data.connection?.syncRuns[0];
  const syncHealthy = data.connection?.status === 'CONNECTED' && latestRun?.status !== 'PARTIAL';
  async function refreshSheets() {
    setRefreshing(true);
    const response = await fetch('/api/sheets/refresh', { method: 'POST' });
    const result = (await response.json().catch(() => null)) as {
      data?: { attempted: number; results: Array<{ status: string }> };
    } | null;
    setRefreshing(false);
    if (!response.ok || !result?.data) {
      setActionMessage('Refresh failed. Faro kept the last successful database snapshot.');
      return;
    }
    const failures = result.data.results.filter((item) => item.status === 'FAILED').length;
    setActionMessage(
      failures
        ? `${failures} Sheet refreshes failed; existing records were preserved.`
        : `Refreshed ${result.data.attempted} connected Sheet${result.data.attempted === 1 ? '' : 's'}.`,
    );
    const dashboard = await fetch('/api/dashboard/connected', { cache: 'no-store' });
    if (dashboard.ok) {
      const updated = (await dashboard.json()) as { data: ConnectedData };
      setData(updated.data);
    }
  }
  async function confirmOutreachBasis(contactId: string) {
    if (!window.confirm('Confirm that you have a lawful outreach basis for this contact?')) return;
    const response = await fetch(`/api/contacts/${contactId}/consent`, {
      body: JSON.stringify({ status: 'IMPLIED' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    if (!response.ok) {
      setActionMessage('Faro could not update the outreach basis.');
      return;
    }
    setData((current) =>
      current
        ? {
            ...current,
            recentContacts: current.recentContacts.map((contact) =>
              contact.id === contactId ? { ...contact, consentStatus: 'IMPLIED' } : contact,
            ),
          }
        : current,
    );
    setActionMessage('Outreach basis confirmed. This contact is now eligible for a Bob draft.');
  }
  async function queueBobDraft(contactId: string) {
    const campaign = data?.campaign;
    if (!campaign) return;
    const response = await fetch('/api/bob/generation-requests', {
      body: JSON.stringify({
        campaignId: campaign.id,
        contactId,
        objective: 'PRESENT_SPONSORSHIP_OPPORTUNITY',
        tone: 'SPONSORSHIP_FOCUSED',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    const result = (await response.json().catch(() => null)) as {
      data?: { id: string };
      message?: string;
    } | null;
    if (!response.ok) {
      setActionMessage(result?.message ?? 'Faro could not queue this IBM Bob request.');
      return;
    }
    setData((current) =>
      current ? { ...current, awaitingBob: current.awaitingBob + 1 } : current,
    );
    setActionMessage(`Bob request ${result?.data?.id ?? ''} is awaiting processing in Faro MCP.`);
  }
  return (
    <div className="page-shell">
      <PageHeader
        actions={
          <Button disabled={refreshing} onClick={() => void refreshSheets()} renderIcon={Renew}>
            {refreshing ? 'Refreshing…' : 'Refresh Google Sheets'}
          </Button>
        }
        description="Workspace-scoped records imported from your connected Google Sheet. IBM Bob can access only governed database context through Faro MCP."
        eyebrow="Connected workspace · Real data"
        title={`Welcome, ${data.userName}`}
      />
      {data.connection ? (
        <InlineNotification
          hideCloseButton
          kind={syncHealthy ? 'success' : 'warning'}
          lowContrast
          title={
            syncHealthy
              ? 'Google Sheet snapshot is available'
              : 'Using the last successful snapshot'
          }
          subtitle={
            syncHealthy
              ? `${data.connection.displayName} · ${data.connection.worksheetId} · last synced ${data.connection.lastSyncedAt ? new Date(data.connection.lastSyncedAt).toLocaleString() : 'not yet'}`
              : latestRun?.status === 'PARTIAL'
                ? `${latestRun.rowsFailed} rows need review. Valid rows were imported and prior records were preserved.`
                : `Refresh issue: ${data.connection.lastErrorCode ?? 'authentication required'}. Existing database records were preserved.`
          }
        />
      ) : (
        <InlineNotification
          hideCloseButton
          kind="info"
          lowContrast
          title="No Sheet imported yet"
          subtitle="Connect and import a Google Sheet to populate this workspace."
        />
      )}
      {data.connection ? (
        <InlineNotification
          hideCloseButton
          kind="info"
          lowContrast
          title="IBM Bob workspace setting"
          subtitle={`Set FARO_WORKSPACE_ID=${data.workspaceId} in .bob/mcp.json, restart faro-mcp, then start a new Bob task.`}
        />
      ) : null}
      {actionMessage ? (
        <InlineNotification hideCloseButton kind="info" lowContrast title={actionMessage} />
      ) : null}
      <section aria-label="Connected workspace metrics" className="metric-grid">
        <MetricCard
          change="workspace scoped"
          detail="valid imported people"
          direction="up"
          label="Contacts"
          value={String(data.contacts)}
        />
        <MetricCard
          change="deduplicated"
          detail="sponsor records"
          direction="up"
          label="Organizations"
          value={String(data.organizations)}
        />
        <MetricCard
          change="active"
          detail="user-created outreach programs"
          direction="up"
          label="Campaigns"
          value={String(data.campaigns)}
        />
        <MetricCard
          change={`${data.awaitingBob} awaiting Bob`}
          detail="human review required"
          direction={data.followUps ? 'warn' : 'up'}
          label="Open follow-ups"
          value={String(data.followUps)}
        />
      </section>
      <section className="panel panel--flush" aria-labelledby="connected-contacts-title">
        <div className="panel__header" style={{ padding: '1.25rem' }}>
          <div>
            <h2 id="connected-contacts-title">Recently imported contacts</h2>
            <p>Consent remains unverified until a human confirms the outreach basis.</p>
          </div>
        </div>
        {data.recentContacts.length ? (
          data.recentContacts.map((contact) => (
            <div className="list-card dashboard-action" key={contact.id}>
              <div>
                <h3>
                  {contact.firstName} {contact.lastName}
                </h3>
                <p>
                  {contact.organization?.name ?? 'No organization'} · {contact.email}
                </p>
              </div>
              <div style={{ alignItems: 'center', display: 'flex', gap: '0.75rem' }}>
                <StatusBadge
                  label={
                    contact.consentStatus === 'UNKNOWN' ? 'Consent review' : contact.consentStatus
                  }
                  status={contact.consentStatus === 'UNKNOWN' ? 'attention' : 'ready'}
                />
                {contact.consentStatus === 'UNKNOWN' ? (
                  <Button
                    kind="tertiary"
                    onClick={() => void confirmOutreachBasis(contact.id)}
                    size="sm"
                  >
                    Review outreach basis
                  </Button>
                ) : (
                  <Button
                    disabled={!data.campaign}
                    kind="tertiary"
                    onClick={() => void queueBobDraft(contact.id)}
                    size="sm"
                  >
                    Queue Bob draft
                  </Button>
                )}
              </div>
            </div>
          ))
        ) : (
          <p style={{ padding: '1.25rem' }}>No contacts have been imported.</p>
        )}
      </section>
    </div>
  );
}
