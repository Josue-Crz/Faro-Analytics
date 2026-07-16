'use client';

import { Add, Save } from '@carbon/icons-react';
import { Button, InlineNotification, Select, SelectItem, TextInput } from '@carbon/react';
import { useState } from 'react';

import { PageHeader } from '@/components/PageHeader';
import { workspace } from '@/lib/demo-data';

const stages = [
  'Prospecting',
  'Qualified',
  'Contacted',
  'Engaged',
  'Proposal',
  'Negotiation',
  'Committed',
  'Declined',
];

export default function WorkspaceSettingsPage() {
  const [saved, setSaved] = useState(false);
  return (
    <div className="page-shell">
      <PageHeader
        actions={
          <Button onClick={() => setSaved(true)} renderIcon={Save}>
            Save workspace
          </Button>
        }
        description="Configure shared timezone, quiet hours, pipeline language, contact types, fields, and role boundaries."
        eyebrow="Settings · Workspace admin"
        title="Workspace"
      />
      {saved ? (
        <InlineNotification
          hideCloseButton
          kind="success"
          lowContrast
          title="Workspace defaults saved"
          subtitle="The demo state was updated locally. Database mode persists changes with an audit event."
        />
      ) : null}
      <div className="dashboard-grid dashboard-grid--equal">
        <section className="panel" aria-labelledby="defaults-title">
          <div className="panel__header">
            <div>
              <h2 id="defaults-title">Workspace defaults</h2>
              <p>Applied when a contact or user has no override</p>
            </div>
          </div>
          <div className="form-stack">
            <TextInput
              id="workspace-name"
              labelText="Workspace name"
              defaultValue={workspace.name}
            />
            <TextInput
              id="workspace-slug"
              labelText="Workspace slug"
              defaultValue="northstar-programs"
            />
            <Select id="timezone" labelText="Default timezone" defaultValue={workspace.timezone}>
              <SelectItem value="America/Los_Angeles" text="America/Los_Angeles (Pacific)" />
              <SelectItem value="America/Chicago" text="America/Chicago (Central)" />
              <SelectItem value="America/New_York" text="America/New_York (Eastern)" />
            </Select>
            <div className="form-row">
              <TextInput
                id="workspace-quiet-start"
                labelText="Quiet start"
                type="time"
                defaultValue="18:00"
              />
              <TextInput
                id="workspace-quiet-end"
                labelText="Quiet end"
                type="time"
                defaultValue="08:00"
              />
            </div>
          </div>
        </section>
        <section className="panel" aria-labelledby="roles-title">
          <div className="panel__header">
            <div>
              <h2 id="roles-title">Role boundaries</h2>
              <p>Server-enforced membership permissions</p>
            </div>
          </div>
          <div className="role-list">
            <div>
              <strong>Admin</strong>
              <span>Workspace, integrations, members, campaigns, approval policy</span>
              <code>3 members</code>
            </div>
            <div>
              <strong>Manager</strong>
              <span>Campaigns, contacts, drafts, approvals, analytics</span>
              <code>6 members</code>
            </div>
            <div>
              <strong>Coordinator</strong>
              <span>Assigned records, follow-ups, draft edits, imports</span>
              <code>14 members</code>
            </div>
            <div>
              <strong>Viewer</strong>
              <span>Read-only governed workspace views</span>
              <code>4 members</code>
            </div>
          </div>
        </section>
      </div>
      <section className="panel" aria-labelledby="pipeline-settings-title">
        <div className="panel__header">
          <div>
            <h2 id="pipeline-settings-title">Sponsorship pipeline</h2>
            <p>Workspace-controlled stage labels and order</p>
          </div>
          <Button
            disabled
            kind="ghost"
            renderIcon={Add}
            size="sm"
            title="Pipeline writes require database mode"
          >
            Add stage
          </Button>
        </div>
        <ol className="stage-list">
          {stages.map((stage, index) => (
            <li key={stage}>
              <span className="mono">{String(index + 1).padStart(2, '0')}</span>
              <strong>{stage}</strong>
              <button
                disabled
                type="button"
                aria-label={`Edit ${stage} stage`}
                title="Pipeline writes require database mode"
              >
                Edit
              </button>
            </li>
          ))}
        </ol>
      </section>
      <section className="panel" aria-labelledby="governance-title">
        <div className="panel__header">
          <div>
            <h2 id="governance-title">Data governance</h2>
            <p>Tenant boundary and lifecycle hooks</p>
          </div>
        </div>
        <dl className="governance-grid">
          <div>
            <dt>Workspace isolation</dt>
            <dd>Required on every tenant-owned repository and MCP operation</dd>
          </div>
          <div>
            <dt>Retention review</dt>
            <dd>Quarterly · next review September 30</dd>
          </div>
          <div>
            <dt>Suppression</dt>
            <dd>Blocks recommendations, drafting, and delivery before scoring</dd>
          </div>
          <div>
            <dt>Export / deletion</dt>
            <dd>Documented service hooks; production self-service workflow planned</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
