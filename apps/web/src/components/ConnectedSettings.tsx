'use client';

import { InlineNotification } from '@carbon/react';
import { useEffect, useState } from 'react';

import { PageHeader } from './PageHeader';
import { StatusBadge } from './StatusBadge';

interface SettingsData {
  bob: {
    mcpConfigured: boolean;
    requests: Array<{
      campaign: { name: string };
      contact: { firstName: string; lastName: string };
      draft: { approvalStatus: string; provenance: string } | null;
      id: string;
      promptVersion: string;
      requestedAt: string;
      status: string;
    }>;
    runtimeAdapter: string;
  };
  google: {
    connected: boolean;
    grantedScopes: string[];
    sheet: {
      displayName: string;
      lastSyncedAt: string | null;
      status: string;
      worksheetId: string;
    } | null;
    updatedAt: string | null;
  };
  membership: { counts: Array<{ _count: { _all: number }; role: string }>; role: string };
  notificationAdapter: string;
  notifications: Array<{
    channel: string;
    createdAt: string;
    deduplicationKey: string;
    errorCode: string | null;
    id: string;
    scheduledFor: string;
    status: string;
    title: string;
  }>;
  user: { email: string; name: string };
  workspace: {
    defaultTimezone: string;
    id: string;
    name: string;
    quietHoursEnd: string;
    quietHoursStart: string;
    slug: string;
  };
}

export function ConnectedSettings({ pathname }: { pathname: string }) {
  const [data, setData] = useState<SettingsData | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    void fetch('/api/settings/connected', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('settings');
        return (await response.json()) as { data: SettingsData };
      })
      .then((result) => setData(result.data))
      .catch(() => setError(true));
  }, []);
  if (error)
    return (
      <InlineNotification hideCloseButton kind="error" title="Connected settings unavailable" />
    );
  if (!data)
    return (
      <div
        className="skeleton"
        style={{ height: '18rem' }}
        aria-label="Loading connected settings"
      />
    );
  if (pathname === '/settings/workspace') return <WorkspaceSettings data={data} />;
  if (pathname === '/settings/notifications') return <NotificationSettings data={data} />;
  return <BobSettings data={data} />;
}

function WorkspaceSettings({ data }: { data: SettingsData }) {
  return (
    <div className="page-shell">
      <PageHeader
        description="Authenticated workspace identity and server-enforced membership settings."
        eyebrow="Settings · Connected workspace"
        title="Workspace"
      />
      <section className="panel">
        <h2>{data.workspace.name}</h2>
        <dl className="governance-grid">
          <div>
            <dt>Signed-in user</dt>
            <dd>
              {data.user.name} · {data.user.email}
            </dd>
          </div>
          <div>
            <dt>Role</dt>
            <dd>{data.membership.role}</dd>
          </div>
          <div>
            <dt>Workspace ID</dt>
            <dd>
              <code>{data.workspace.id}</code>
            </dd>
          </div>
          <div>
            <dt>Slug</dt>
            <dd>{data.workspace.slug}</dd>
          </div>
          <div>
            <dt>Default timezone</dt>
            <dd>{data.workspace.defaultTimezone}</dd>
          </div>
          <div>
            <dt>Quiet hours</dt>
            <dd>
              {data.workspace.quietHoursStart}–{data.workspace.quietHoursEnd}
            </dd>
          </div>
        </dl>
      </section>
      <section className="panel">
        <h2>Membership</h2>
        {data.membership.counts.map((item) => (
          <p key={item.role}>
            <strong>{item.role}</strong> · {item._count._all} member
            {item._count._all === 1 ? '' : 's'}
          </p>
        ))}
      </section>
      <InlineNotification
        hideCloseButton
        kind="info"
        lowContrast
        title="Governance controls"
        subtitle="Workspace isolation, suppression checks, human draft approval, and audited mutations are enforced server-side. No fictional member or retention counts are shown."
      />
    </div>
  );
}

function BobSettings({ data }: { data: SettingsData }) {
  return (
    <div className="page-shell">
      <PageHeader
        description="Real IBM Bob/Faro MCP state for this authenticated workspace."
        eyebrow="Settings · AI boundary"
        title="IBM Bob"
      />
      <div className="integration-status-grid">
        <StatusPanel
          label="Faro MCP configuration"
          ready={data.bob.mcpConfigured}
          value={data.bob.mcpConfigured ? 'Configured' : 'Missing token'}
        />
        <StatusPanel
          label="Bob runtime adapter"
          ready={data.bob.runtimeAdapter !== 'unavailable'}
          value={data.bob.runtimeAdapter}
        />
        <StatusPanel label="Workspace scope" ready value={data.workspace.id} />
      </div>
      <InlineNotification
        hideCloseButton
        kind="info"
        lowContrast
        title="IBM Bob is Faro’s only AI integration"
        subtitle="Requests remain awaiting Bob until the scoped MCP workflow processes them. External sending always requires human approval."
      />
      <section className="panel panel--flush table-wrap">
        <div className="panel__header" style={{ padding: '1.25rem' }}>
          <div>
            <h2>Generation requests</h2>
            <p>Real requests from this workspace</p>
          </div>
        </div>
        {data.bob.requests.length ? (
          <table className="faro-table">
            <thead>
              <tr>
                <th>Created</th>
                <th>Contact</th>
                <th>Campaign</th>
                <th>Prompt</th>
                <th>Status</th>
                <th>Provenance</th>
              </tr>
            </thead>
            <tbody>
              {data.bob.requests.map((request) => (
                <tr key={request.id}>
                  <td>{new Date(request.requestedAt).toLocaleString()}</td>
                  <td>
                    {request.contact.firstName} {request.contact.lastName}
                  </td>
                  <td>{request.campaign.name}</td>
                  <td>
                    <code>{request.promptVersion}</code>
                  </td>
                  <td>{request.status}</td>
                  <td>{request.draft?.provenance ?? 'No draft'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ padding: '1.25rem' }}>No IBM Bob generation requests yet.</p>
        )}
      </section>
    </div>
  );
}

function NotificationSettings({ data }: { data: SettingsData }) {
  return (
    <div className="page-shell">
      <PageHeader
        description="Real notification adapter state and delivery audit for the signed-in user."
        eyebrow="Settings · Personal preferences"
        title="Notifications"
      />
      <div className="integration-status-grid">
        <StatusPanel label="Signed-in recipient" ready value={data.user.email} />
        <StatusPanel
          label="Notification adapter"
          ready={data.notificationAdapter !== 'preview'}
          value={data.notificationAdapter}
        />
        <StatusPanel label="Timezone" ready value={data.workspace.defaultTimezone} />
      </div>
      <InlineNotification
        hideCloseButton
        kind={data.notificationAdapter === 'preview' ? 'warning' : 'info'}
        lowContrast
        title={
          data.notificationAdapter === 'preview'
            ? 'Preview delivery only'
            : 'Notification provider configured'
        }
        subtitle="No delivery is labeled successful unless the configured adapter records it. External outreach remains separate from internal reminders."
      />
      <section className="panel panel--flush table-wrap">
        <div className="panel__header" style={{ padding: '1.25rem' }}>
          <div>
            <h2>Delivery audit</h2>
            <p>Real attempts for {data.user.name}</p>
          </div>
        </div>
        {data.notifications.length ? (
          <table className="faro-table">
            <thead>
              <tr>
                <th>Created</th>
                <th>Reminder</th>
                <th>Channel</th>
                <th>Scheduled</th>
                <th>Status</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {data.notifications.map((notification) => (
                <tr key={notification.id}>
                  <td>{new Date(notification.createdAt).toLocaleString()}</td>
                  <td>{notification.title}</td>
                  <td>{notification.channel}</td>
                  <td>{new Date(notification.scheduledFor).toLocaleString()}</td>
                  <td>{notification.status}</td>
                  <td>{notification.errorCode ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ padding: '1.25rem' }}>No notification attempts have been recorded.</p>
        )}
      </section>
    </div>
  );
}

function StatusPanel({ label, ready, value }: { label: string; ready: boolean; value: string }) {
  return (
    <article className="panel">
      <div className="panel__header">
        <div>
          <h2>{label}</h2>
          <p>{value}</p>
        </div>
        <StatusBadge
          label={ready ? 'Available' : 'Needs setup'}
          status={ready ? 'ready' : 'attention'}
        />
      </div>
    </article>
  );
}
