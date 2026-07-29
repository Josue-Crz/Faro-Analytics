'use client';

import { Email, Notification, Phone, Save, WarningAlt } from '@carbon/icons-react';
import { Button, InlineNotification, Select, SelectItem, TextInput, Toggle } from '@carbon/react';
import { useState } from 'react';

import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';

export default function NotificationSettingsPage() {
  const [saved, setSaved] = useState(false);
  const [smsPreview, setSmsPreview] = useState(true);
  return (
    <div className="page-shell">
      <PageHeader
        actions={
          <Button onClick={() => setSaved(true)} renderIcon={Save}>
            Save preferences
          </Button>
        }
        description="Choose how and when Faro delivers internal reminders. External outreach delivery remains a separate, approval-gated concern."
        eyebrow="Settings · Personal preferences"
        title="Notifications"
      />
      {saved ? (
        <InlineNotification
          hideCloseButton
          kind="success"
          lowContrast
          title="Preferences saved"
          subtitle="Development preview scheduling was updated. No external provider call was made."
        />
      ) : null}
      <div className="integration-status-grid">
        <article className="panel">
          <div className="panel__header">
            <div>
              <h2>In-app</h2>
              <p>Faro notification center</p>
            </div>
            <StatusBadge label="Active" status="clear" />
          </div>
          <Notification size={28} />
          <p className="integration-card-copy">
            Actionable reminders and delivery audit are available in the local product.
          </p>
        </article>
        <article className="panel">
          <div className="panel__header">
            <div>
              <h2>Email</h2>
              <p>Provider contract</p>
            </div>
            <StatusBadge label="Preview only" status="attention" />
          </div>
          <Email size={28} />
          <p className="integration-card-copy">
            Messages are written to the development preview adapter. They are not delivered
            externally.
          </p>
        </article>
        <article className="panel">
          <div className="panel__header">
            <div>
              <h2>SMS</h2>
              <p>Follow-up alert preview</p>
            </div>
            <StatusBadge label="Preview only" status="attention" />
          </div>
          <Phone size={28} />
          <p className="integration-card-copy">
            Follow-up SMS alerts are visible in the demo audit. No external text is sent.
          </p>
        </article>
      </div>
      <div className="dashboard-grid dashboard-grid--equal">
        <section className="panel" aria-labelledby="channels-title">
          <div className="panel__header">
            <div>
              <h2 id="channels-title">Channels</h2>
              <p>Internal reminder delivery</p>
            </div>
          </div>
          <div className="settings-list">
            <div>
              <span>
                <strong id="notify-in-app-label">In-app notifications</strong>
                <small>Due, overdue, draft-ready, and sync issues</small>
              </span>
              <Toggle
                aria-labelledby="notify-in-app-label"
                defaultToggled
                id="notify-in-app"
                labelA="Off"
                labelB="On"
              />
            </div>
            <div>
              <span>
                <strong id="notify-email-label">Email preview</strong>
                <small>Development adapter; no external delivery</small>
              </span>
              <Toggle
                aria-labelledby="notify-email-label"
                defaultToggled
                id="notify-email"
                labelA="Off"
                labelB="On"
              />
            </div>
            <div>
              <span>
                <strong id="notify-push-label">Mobile web push</strong>
                <small>Permission and service worker not configured</small>
              </span>
              <Toggle
                aria-labelledby="notify-push-label"
                disabled
                id="notify-push"
                labelA="Off"
                labelB="On"
              />
            </div>
            <div>
              <span>
                <strong id="notify-sms-label">SMS</strong>
                <small>Preview follow-up alerts; Twilio required for external delivery</small>
              </span>
              <Toggle
                aria-labelledby="notify-sms-label"
                id="notify-sms"
                labelA="Off"
                labelB="On"
                onToggle={setSmsPreview}
                toggled={smsPreview}
              />
            </div>
          </div>
        </section>
        <section className="panel" aria-labelledby="schedule-title">
          <div className="panel__header">
            <div>
              <h2 id="schedule-title">Schedule and priority</h2>
              <p>America/Los_Angeles</p>
            </div>
          </div>
          <div className="form-stack">
            <div className="form-row">
              <TextInput
                id="quiet-start"
                labelText="Quiet hours start"
                type="time"
                defaultValue="18:00"
              />
              <TextInput
                id="quiet-end"
                labelText="Quiet hours end"
                type="time"
                defaultValue="08:00"
              />
            </div>
            <Select id="digest" labelText="Daily digest">
              <SelectItem value="08:30" text="8:30 AM local time" />
              <SelectItem value="09:00" text="9:00 AM local time" />
              <SelectItem value="disabled" text="Disabled" />
            </Select>
            <Select id="high-priority" labelText="High-priority alerts">
              <SelectItem value="immediate" text="Immediately, outside quiet hours" />
              <SelectItem value="digest" text="Digest only" />
            </Select>
          </div>
        </section>
      </div>
      <InlineNotification
        hideCloseButton
        kind="warning"
        lowContrast
        title="Delivery truth"
        subtitle="The preview adapter records a successful development preview—not a delivered email, push notification, or SMS. Configure and verify a production provider before changing those labels."
      />
      <section
        className="panel panel--flush table-wrap"
        aria-labelledby="notification-history-title"
        tabIndex={0}
      >
        <div className="panel__header" style={{ padding: '1.25rem' }}>
          <div>
            <h2 id="notification-history-title">Recent delivery audit</h2>
            <p>Deduplicated internal reminder attempts</p>
          </div>
        </div>
        <table className="faro-table">
          <caption className="visually-hidden">Notification delivery audit</caption>
          <thead>
            <tr>
              <th>Reminder</th>
              <th>Channel</th>
              <th>Scheduled</th>
              <th>Result</th>
              <th>Deduplication key</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Amara Okafor · follow-up due</td>
              <td>In-app</td>
              <td>Today, 8:30 AM</td>
              <td>
                <StatusBadge label="Delivered" status="clear" />
              </td>
              <td>
                <code>fu_amara:in_app:2026-07-10</code>
              </td>
            </tr>
            <tr>
              <td>Amara Okafor · follow-up due</td>
              <td>SMS</td>
              <td>Today, 8:30 AM</td>
              <td>
                <StatusBadge label="Preview recorded" status="attention" />
              </td>
              <td>
                <code>fu_amara:sms-preview:2026-07-10</code>
              </td>
            </tr>
            <tr>
              <td>Daily follow-up digest</td>
              <td>Email</td>
              <td>Today, 8:30 AM</td>
              <td>
                <StatusBadge label="Preview recorded" status="attention" />
              </td>
              <td>
                <code>digest:jordan:2026-07-10</code>
              </td>
            </tr>
            <tr>
              <td>Partner sync issue</td>
              <td>Push</td>
              <td>Yesterday, 8:06 AM</td>
              <td>
                <span className="status-badge status-badge--issue">
                  <WarningAlt size={14} /> Provider unavailable
                </span>
              </td>
              <td>
                <code>sync_102:push:jordan</code>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}
