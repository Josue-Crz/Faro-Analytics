'use client';

import { ArrowRight, Renew } from '@carbon/icons-react';
import { Button, InlineNotification } from '@carbon/react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { categorizeOrganization } from '@faro/core';

import { MetricCard } from './MetricCard';
import { PageHeader } from './PageHeader';
import { StatusBadge } from './StatusBadge';

function categoryDisplayLabel(organization?: { industry: string; name: string } | null): string {
  if (!organization) return 'No company category';
  return organization.industry === 'Other'
    ? categorizeOrganization({ name: organization.name }).category
    : organization.industry;
}

interface ConnectedData {
  awaitingBob: number;
  campaigns: number;
  connection: {
    displayName: string;
    lastErrorAt: string | null;
    lastErrorCode: string | null;
    lastSyncedAt: string | null;
    status: 'CONNECTED' | 'ATTEMPTING' | 'NEEDS_AUTH' | 'SYNC_ISSUE' | 'DISABLED';
    syncRuns: Array<{
      errorSummary: string | null;
      rowsFailed: number;
      status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'PARTIAL' | 'FAILED' | 'DRY_RUN';
    }>;
    worksheetId: string;
  } | null;
  contacts: number;
  draftsReady: number;
  dueNext24Hours: number;
  followUps: number;
  importedFollowUps: number;
  organizations: number;
  overdue: number;
  priorityFollowUps: Array<{
    campaign: { id: string; name: string };
    contact: {
      firstName: string;
      id: string;
      lastName: string;
      organization: { industry: string; name: string } | null;
    };
    dueAt: string;
    id: string;
    priority: string;
    reason: string;
    recommendedNextAction: string | null;
    status: string;
  }>;
  scope: {
    campaign: { id: string; name: string } | null;
    kind: 'CAMPAIGN' | 'WORKSPACE';
  };
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
  const priorityFollowUp = data.priorityFollowUps[0];
  const firstName = data.userName.trim().split(/\s+/)[0] || data.userName;
  return (
    <div className="page-shell">
      <PageHeader
        actions={
          <>
            <Button
              disabled={refreshing}
              kind="secondary"
              onClick={() => void refreshSheets()}
              renderIcon={Renew}
            >
              {refreshing ? 'Refreshing…' : 'Refresh sources'}
            </Button>
            <Button href="/follow-ups" renderIcon={ArrowRight}>
              Review follow-ups
            </Button>
          </>
        }
        description={
          data.scope.campaign
            ? `Faro is reading only ${data.scope.campaign.name}: its relationships, timing evidence, and open work.`
            : 'Faro turns your relationship context into a next action, with the timing and evidence kept close at hand.'
        }
        eyebrow={
          data.scope.campaign
            ? `${data.scope.campaign.name} · Campaign focus`
            : 'Faro signal · Connected workspace'
        }
        title={`Know who needs you next, ${firstName}`}
      />
      {data.connection && !syncHealthy ? (
        <InlineNotification
          hideCloseButton
          kind="warning"
          lowContrast
          title={
            data.connection.status === 'ATTEMPTING'
              ? 'Checking source connection'
              : 'Using the last successful snapshot'
          }
          subtitle={
            data.connection.status === 'ATTEMPTING'
              ? `${data.connection.displayName} · validating the connection and reading ${data.connection.worksheetId}.`
              : latestRun?.status === 'PARTIAL'
                ? `${latestRun.rowsFailed} rows need review. Valid rows were imported and prior records were preserved.`
                : `Refresh issue: ${data.connection.lastErrorCode ?? 'authentication required'}. Existing database records were preserved.`
          }
        />
      ) : !data.connection ? (
        <InlineNotification
          hideCloseButton
          kind="info"
          lowContrast
          title="No Sheet imported yet"
          subtitle="Connect and import a Google Sheet to populate this workspace."
        />
      ) : null}
      {actionMessage ? (
        <InlineNotification hideCloseButton kind="info" lowContrast title={actionMessage} />
      ) : null}
      {priorityFollowUp ? (
        <section className="action-brief" aria-labelledby="connected-priority-action-title">
          <div className="action-brief__main">
            <p className="eyebrow">
              Priority signal · {new Date(priorityFollowUp.dueAt).toLocaleString()}
            </p>
            <h2 id="connected-priority-action-title">
              {priorityFollowUp.recommendedNextAction ??
                `Follow up with ${priorityFollowUp.contact.firstName} ${priorityFollowUp.contact.lastName}`}
            </h2>
            <p>
              {priorityFollowUp.contact.firstName} {priorityFollowUp.contact.lastName} ·{' '}
              {priorityFollowUp.contact.organization?.name ?? 'No company'} ·{' '}
              {priorityFollowUp.reason}
            </p>
          </div>
          <div className="action-brief__context">
            <dl className="action-brief__facts">
              <div>
                <dt>Contact</dt>
                <dd>
                  {priorityFollowUp.contact.firstName} {priorityFollowUp.contact.lastName}
                </dd>
              </div>
              <div>
                <dt>Campaign</dt>
                <dd>{priorityFollowUp.campaign.name}</dd>
              </div>
              <div>
                <dt>Company · category</dt>
                <dd>
                  {priorityFollowUp.contact.organization?.name ?? 'No company'} ·{' '}
                  {categoryDisplayLabel(priorityFollowUp.contact.organization)}
                </dd>
              </div>
              <div>
                <dt>Priority</dt>
                <dd>{priorityFollowUp.priority}</dd>
              </div>
            </dl>
            <div className="action-brief__rationale">
              <strong>Why Faro surfaced this</strong>
              <p>
                {priorityFollowUp.reason}. This is the earliest open{' '}
                {priorityFollowUp.priority.toLowerCase()}-priority follow-up in the current scope.
              </p>
            </div>
          </div>
          <Button href="/follow-ups" renderIcon={ArrowRight}>
            Review this follow-up
          </Button>
        </section>
      ) : (
        <InlineNotification
          hideCloseButton
          kind="success"
          lowContrast
          title="No active follow-ups need attention"
          subtitle={
            data.importedFollowUps
              ? `${data.importedFollowUps} imported dates are ready to assign in Follow-ups.`
              : 'Your active follow-up queue is clear.'
          }
        />
      )}
      <div className="dashboard-section-heading">
        <div>
          <p className="eyebrow">Decision horizon</p>
          <h2>What needs movement today</h2>
          <p>Open work and draft state come before aggregate performance.</p>
        </div>
      </div>
      <section
        aria-label="Connected workspace metrics"
        className="metric-grid metric-grid--compact"
      >
        <MetricCard
          change={data.overdue ? 'Act now' : 'Queue clear'}
          detail="past their due time"
          direction={data.overdue ? 'warn' : 'up'}
          label="Overdue"
          value={String(data.overdue)}
        />
        <MetricCard
          change={`${data.followUps} open total`}
          detail="due in the next 24 hours"
          direction={data.dueNext24Hours ? 'warn' : 'up'}
          label="Due next"
          value={String(data.dueNext24Hours)}
        />
        <MetricCard
          change="human review required"
          detail="proposed outreach drafts"
          direction="up"
          label="Drafts ready"
          value={String(data.draftsReady)}
        />
        <MetricCard
          change={
            data.scope.campaign ? 'current campaign only' : `${data.campaigns} active campaigns`
          }
          detail="generation requests queued"
          direction={data.awaitingBob ? 'warn' : 'up'}
          label="Awaiting IBM Bob"
          value={String(data.awaitingBob)}
        />
      </section>
      <div className="dashboard-section-heading">
        <div>
          <p className="eyebrow">Relationship queue</p>
          <h2>Keep the person, campaign, and reason together</h2>
          <p>Review context before drafting or taking any external action.</p>
        </div>
      </div>
      <section className="panel panel--flush" aria-labelledby="connected-actions-title">
        <div className="panel__header" style={{ padding: '1.25rem' }}>
          <div>
            <h2 id="connected-actions-title">Open relationship work</h2>
            <p>Ranked by due time within the current workspace or campaign scope.</p>
          </div>
          <Link className="section-link" href="/follow-ups">
            View all <ArrowRight size={16} />
          </Link>
        </div>
        {data.priorityFollowUps.length ? (
          data.priorityFollowUps.map((followUp) => (
            <Link
              className="list-card dashboard-action"
              href="/follow-ups"
              key={followUp.id}
              style={{ color: 'inherit', textDecoration: 'none' }}
            >
              <div>
                <h3>
                  {followUp.contact.firstName} {followUp.contact.lastName}
                </h3>
                <p>
                  {followUp.campaign.name} · {followUp.contact.organization?.name ?? 'No company'} ·{' '}
                  {categoryDisplayLabel(followUp.contact.organization)}
                </p>
                <p>{followUp.reason}</p>
              </div>
              <div className="list-card__meta">
                <StatusBadge
                  label={followUp.priority}
                  status={new Date(followUp.dueAt) < new Date() ? 'due' : 'attention'}
                />
                <span className="mono" style={{ fontSize: '.6875rem' }}>
                  {new Date(followUp.dueAt).toLocaleString()}
                </span>
              </div>
            </Link>
          ))
        ) : (
          <p style={{ padding: '1.25rem' }}>No active follow-ups.</p>
        )}
      </section>
      <div className="dashboard-section-heading">
        <div>
          <p className="eyebrow">Trust and traceability</p>
          <h2>Know whether the context and drafting boundary are ready</h2>
          <p>
            Source freshness and human-review state stay visible without blocking the main action.
          </p>
        </div>
      </div>
      <div className="dashboard-system-grid">
        <section className="panel" aria-labelledby="connected-source-title">
          <div className="panel__header">
            <div>
              <h2 id="connected-source-title">Source freshness</h2>
              <p>Latest governed Google Sheets snapshot</p>
            </div>
            <StatusBadge
              label={syncHealthy ? 'Healthy' : data.connection ? 'Needs review' : 'Not connected'}
              status={syncHealthy ? 'clear' : data.connection ? 'issue' : 'insufficient'}
            />
          </div>
          <strong className="dashboard-system-grid__value">
            {data.connection?.displayName ?? 'No Google Sheet connected'}
          </strong>
          <p className="dashboard-system-grid__copy">
            {data.connection
              ? `${data.connection.worksheetId} · last synced ${
                  data.connection.lastSyncedAt
                    ? new Date(data.connection.lastSyncedAt).toLocaleString()
                    : 'not yet'
                }`
              : 'Connect a bounded source before importing relationship data.'}
          </p>
          <Link className="section-link" href="/integrations/google-sheets">
            Review source health <ArrowRight size={16} />
          </Link>
        </section>
        <section className="panel panel--dark" aria-labelledby="connected-drafting-title">
          <div className="panel__header">
            <div>
              <h2 id="connected-drafting-title">Drafting boundary</h2>
              <p style={{ color: '#a8a8a8' }}>IBM Bob only · Human review required</p>
            </div>
            <Renew aria-hidden style={{ color: 'var(--faro-beam)' }} />
          </div>
          <p className="dashboard-system-grid__copy dashboard-system-grid__copy--inverse">
            {data.awaitingBob} request{data.awaitingBob === 1 ? '' : 's'} awaiting IBM Bob. Faro
            never substitutes another AI provider or sends a returned draft automatically.
          </p>
          <Link className="section-link" href="/settings/ai" style={{ color: '#78a9ff' }}>
            Review drafting status <ArrowRight size={16} />
          </Link>
        </section>
      </div>
    </div>
  );
}
