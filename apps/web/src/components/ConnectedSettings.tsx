'use client';

import { Phone, Save } from '@carbon/icons-react';
import { Button, InlineNotification, Select, SelectItem, TextInput, Toggle } from '@carbon/react';
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
  notificationPreferences: {
    dailyDigest: boolean;
    email: boolean;
    followUpLeadMinutes: number;
    highPriorityOnly: boolean;
    inApp: boolean;
    quietHoursEnd: string;
    quietHoursStart: string;
    sms: boolean;
  };
  notifications: Array<{
    channel: string;
    createdAt: string;
    deduplicationKey: string;
    errorCode: string | null;
    id: string;
    message: string;
    provider: string | null;
    readAt: string | null;
    scheduledFor: string;
    status: string;
    title: string;
  }>;
  sms: {
    consentAt: string | null;
    optedOutAt: string | null;
    phoneMasked: string | null;
    providerConfigured: boolean;
    verificationConfigured: boolean;
    verifiedAt: string | null;
  };
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
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [preferences, setPreferences] = useState(data.notificationPreferences);
  const [saving, setSaving] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [verifiedAt, setVerifiedAt] = useState(data.sms.verifiedAt);
  const [verifiedPhone, setVerifiedPhone] = useState(data.sms.phoneMasked);

  function setPreference<Key extends keyof typeof preferences>(
    key: Key,
    value: (typeof preferences)[Key],
  ) {
    setPreferences((current) => ({ ...current, [key]: value }));
  }

  async function savePreferences() {
    setSaving(true);
    setMessage(null);
    const response = await fetch('/api/settings/notifications', {
      body: JSON.stringify(preferences),
      headers: { 'content-type': 'application/json' },
      method: 'PATCH',
    });
    setSaving(false);
    if (!response.ok) {
      const result = (await response.json().catch(() => null)) as { message?: string } | null;
      setMessage(result?.message ?? 'Faro could not save the notification preferences.');
      return;
    }
    setMessage('Notification preferences saved.');
  }

  async function sendVerification() {
    setMessage(null);
    const response = await fetch('/api/settings/notifications/sms/start', {
      body: JSON.stringify({ phone }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    if (!response.ok) {
      setMessage(
        response.status === 503
          ? 'Twilio Verify is not configured for this workspace.'
          : 'Faro could not send a verification code. Use an E.164 number such as +14155550123.',
      );
      return;
    }
    setVerificationSent(true);
    setMessage('Verification code sent. It expires according to the provider policy.');
  }

  async function verifyPhone() {
    setMessage(null);
    const response = await fetch('/api/settings/notifications/sms/check', {
      body: JSON.stringify({ code, phone }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    const result = (await response.json().catch(() => null)) as {
      data?: {
        phoneMasked: string;
        preferences: typeof preferences;
        verifiedAt: string;
      };
      message?: string;
    } | null;
    if (!response.ok || !result?.data) {
      setMessage(result?.message ?? 'That verification code was not accepted.');
      return;
    }
    setVerifiedAt(result.data.verifiedAt);
    setVerifiedPhone(result.data.phoneMasked);
    setPreferences(result.data.preferences);
    setVerificationSent(false);
    setCode('');
    setPhone('');
    setMessage('Mobile number verified and SMS follow-up reminders enabled.');
  }

  const smsReady = data.sms.providerConfigured && Boolean(verifiedAt);
  return (
    <div className="page-shell">
      <PageHeader
        actions={
          <Button disabled={saving} onClick={() => void savePreferences()} renderIcon={Save}>
            {saving ? 'Saving…' : 'Save preferences'}
          </Button>
        }
        description="Real notification adapter state and delivery audit for the signed-in user."
        eyebrow="Settings · Personal preferences"
        title="Notifications"
      />
      {message ? (
        <InlineNotification
          hideCloseButton
          kind={
            message.includes('saved') || message.includes('sent') || message.includes('enabled')
              ? 'success'
              : 'warning'
          }
          lowContrast
          title={message}
        />
      ) : null}
      <div className="integration-status-grid">
        <StatusPanel label="In-app reminders" ready value={data.user.email} />
        <StatusPanel
          label="SMS provider"
          ready={data.sms.providerConfigured}
          value={data.sms.providerConfigured ? 'Twilio configured' : 'Preview only'}
        />
        <StatusPanel
          label="SMS recipient"
          ready={Boolean(verifiedAt)}
          value={verifiedPhone ?? 'No verified mobile number'}
        />
        <StatusPanel label="Timezone" ready value={data.workspace.defaultTimezone} />
      </div>
      <InlineNotification
        hideCloseButton
        kind={data.sms.providerConfigured ? 'info' : 'warning'}
        lowContrast
        title={
          data.sms.providerConfigured
            ? 'SMS follow-up alerts are available'
            : 'External SMS delivery is not configured'
        }
        subtitle="SMS is sent only to the signed-in Faro user after phone verification and explicit opt-in. It never sends to the external contact."
      />
      <div className="dashboard-grid dashboard-grid--equal">
        <section className="panel" aria-labelledby="connected-channels-title">
          <div className="panel__header">
            <div>
              <h2 id="connected-channels-title">Reminder channels</h2>
              <p>Internal alerts for assigned follow-up tasks</p>
            </div>
          </div>
          <div className="settings-list">
            <div>
              <span>
                <strong id="connected-notify-in-app-label">In-app notifications</strong>
                <small>Shown in the Faro notification center</small>
              </span>
              <Toggle
                aria-labelledby="connected-notify-in-app-label"
                id="connected-notify-in-app"
                labelA="Off"
                labelB="On"
                onToggle={(value) => setPreference('inApp', value)}
                toggled={preferences.inApp}
              />
            </div>
            <div>
              <span>
                <strong id="connected-notify-email-label">Email preview</strong>
                <small>Recorded as a preview until an email provider is configured</small>
              </span>
              <Toggle
                aria-labelledby="connected-notify-email-label"
                id="connected-notify-email"
                labelA="Off"
                labelB="On"
                onToggle={(value) => setPreference('email', value)}
                toggled={preferences.email}
              />
            </div>
            <div>
              <span>
                <strong id="connected-notify-sms-label">SMS follow-up alerts</strong>
                <small>
                  {smsReady
                    ? `Verified recipient ${verifiedPhone}`
                    : 'Requires Twilio and a verified mobile number'}
                </small>
              </span>
              <Toggle
                aria-labelledby="connected-notify-sms-label"
                disabled={!smsReady}
                id="connected-notify-sms"
                labelA="Off"
                labelB="On"
                onToggle={(value) => setPreference('sms', value)}
                toggled={smsReady && preferences.sms}
              />
            </div>
            <div>
              <span>
                <strong id="connected-notify-priority-label">High-priority tasks only</strong>
                <small>Limit alerts to high and urgent follow-ups</small>
              </span>
              <Toggle
                aria-labelledby="connected-notify-priority-label"
                id="connected-notify-priority"
                labelA="All"
                labelB="High"
                onToggle={(value) => setPreference('highPriorityOnly', value)}
                toggled={preferences.highPriorityOnly}
              />
            </div>
          </div>
        </section>
        <section className="panel" aria-labelledby="connected-schedule-title">
          <div className="panel__header">
            <div>
              <h2 id="connected-schedule-title">Timing and quiet hours</h2>
              <p>{data.workspace.defaultTimezone}</p>
            </div>
          </div>
          <div className="form-stack">
            <Select
              id="connected-follow-up-lead"
              labelText="Alert before a follow-up"
              onChange={(event) => setPreference('followUpLeadMinutes', Number(event.target.value))}
              value={String(preferences.followUpLeadMinutes)}
            >
              <SelectItem value="0" text="When it is due" />
              <SelectItem value="15" text="15 minutes before" />
              <SelectItem value="30" text="30 minutes before" />
              <SelectItem value="60" text="1 hour before" />
              <SelectItem value="1440" text="1 day before" />
            </Select>
            <div className="form-row">
              <TextInput
                id="connected-quiet-start"
                labelText="Quiet hours start"
                onChange={(event) => setPreference('quietHoursStart', event.target.value)}
                type="time"
                value={preferences.quietHoursStart}
              />
              <TextInput
                id="connected-quiet-end"
                labelText="Quiet hours end"
                onChange={(event) => setPreference('quietHoursEnd', event.target.value)}
                type="time"
                value={preferences.quietHoursEnd}
              />
            </div>
          </div>
        </section>
      </div>
      <section className="panel sms-verification" aria-labelledby="sms-verification-title">
        <div className="panel__header">
          <div>
            <p className="eyebrow">SMS recipient</p>
            <h2 id="sms-verification-title">
              {verifiedAt ? 'Verified mobile number' : 'Verify your mobile number'}
            </h2>
            <p>
              {verifiedAt
                ? `${verifiedPhone} verified ${new Date(verifiedAt).toLocaleDateString()}`
                : 'Faro uses Twilio Verify to confirm that the number belongs to you.'}
            </p>
          </div>
          <Phone size={24} />
        </div>
        <div className="sms-verification__form">
          <TextInput
            disabled={!data.sms.verificationConfigured}
            id="sms-recipient-phone"
            labelText={verifiedAt ? 'Replace with a new mobile number' : 'Mobile number'}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="+14155550123"
            value={phone}
          />
          <Button
            disabled={!data.sms.verificationConfigured || !phone}
            kind="secondary"
            onClick={() => void sendVerification()}
          >
            Send verification code
          </Button>
          {verificationSent ? (
            <>
              <TextInput
                id="sms-verification-code"
                labelText="Verification code"
                onChange={(event) => setCode(event.target.value)}
                value={code}
              />
              <Button disabled={!code} onClick={() => void verifyPhone()}>
                Verify and enable SMS
              </Button>
            </>
          ) : null}
        </div>
        <p className="chart-summary">
          By verifying and enabling SMS, you consent to transactional Faro follow-up reminders.
          Message and data rates may apply. Reply STOP to unsubscribe. Quiet hours are enforced in
          your Faro timezone.
        </p>
      </section>
      <section
        className="panel panel--flush table-wrap"
        aria-labelledby="connected-notification-audit-title"
        tabIndex={0}
      >
        <div className="panel__header" style={{ padding: '1.25rem' }}>
          <div>
            <h2 id="connected-notification-audit-title">Delivery audit</h2>
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
                <th>Provider</th>
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
                  <td>{notification.provider ?? 'Faro'}</td>
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
