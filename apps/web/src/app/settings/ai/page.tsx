'use client';

import { Checkmark, Copy, Renew, WarningAlt } from '@carbon/icons-react';
import { Button, InlineNotification, Toggle } from '@carbon/react';
import { useState } from 'react';

import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { bobDrafts } from '@/lib/demo-data';

export default function AiSettingsPage() {
  const [copied, setCopied] = useState(false);

  async function copyCommand() {
    await navigator.clipboard.writeText('cp .bob/mcp.example.json .bob/mcp.json');
    setCopied(true);
  }

  return (
    <div className="page-shell">
      <PageHeader
        actions={
          <Button kind="secondary" onClick={() => window.location.reload()} renderIcon={Renew}>
            Refresh status
          </Button>
        }
        description="Inspect the governed IBM Bob boundary, MCP health, prompt versions, provenance, and human-approval policy."
        eyebrow="Settings · AI boundary"
        title="IBM Bob"
      />

      <InlineNotification
        hideCloseButton
        kind="info"
        lowContrast
        title="IBM Bob is Faro’s only allowed AI integration"
        subtitle="No network runtime was discovered or configured. Generation requests use the auditable Faro MCP workflow and never fall back to another model provider."
      />

      <section className="status-matrix" aria-label="IBM Bob integration status">
        <article className="status-card status-card--healthy">
          <Checkmark size={24} />
          <div>
            <span>Faro MCP server</span>
            <strong>Available to configure</strong>
            <small>11 scoped tools · stdio transport</small>
          </div>
        </article>
        <article className="status-card status-card--warning">
          <WarningAlt size={24} />
          <div>
            <span>Runtime adapter</span>
            <strong>Unavailable</strong>
            <small>No verified IBM Bob endpoint or SDK</small>
          </div>
        </article>
        <article className="status-card status-card--healthy">
          <Checkmark size={24} />
          <div>
            <span>Prompt template</span>
            <strong>outreach-draft.v1</strong>
            <small>Source controlled · output validated</small>
          </div>
        </article>
        <article className="status-card">
          <Renew size={24} />
          <div>
            <span>Last MCP sync</span>
            <strong>Today, 10:24 AM</strong>
            <small>Development workspace · audit recorded</small>
          </div>
        </article>
      </section>

      <div className="dashboard-grid dashboard-grid--equal">
        <section className="panel" aria-labelledby="policy-title">
          <div className="panel__header">
            <div>
              <h2 id="policy-title">Generation policy</h2>
              <p>Hard controls applied to every request</p>
            </div>
          </div>
          <div className="settings-list">
            <div>
              <span>
                <strong>Human approval</strong>
                <small>Every external draft must be edited or approved before use</small>
              </span>
              <Toggle
                defaultToggled
                id="approval-policy"
                labelA="Required"
                labelB="Required"
                readOnly
              />
            </div>
            <div>
              <span>
                <strong>Automatic external sending</strong>
                <small>Separate policy and delivery provider required</small>
              </span>
              <Toggle id="auto-send-policy" labelA="Disabled" labelB="Enabled" disabled />
            </div>
            <div>
              <span>
                <strong>Context minimization</strong>
                <small>Only records explicitly linked to a request are exposed</small>
              </span>
              <Toggle
                defaultToggled
                id="context-policy"
                labelA="Required"
                labelB="Required"
                readOnly
              />
            </div>
            <div>
              <span>
                <strong>Output validation</strong>
                <small>Rejects malformed content before persistence</small>
              </span>
              <Toggle
                defaultToggled
                id="validation-policy"
                labelA="Required"
                labelB="Required"
                readOnly
              />
            </div>
          </div>
        </section>

        <section className="panel" aria-labelledby="mcp-setup-title">
          <div className="panel__header">
            <div>
              <h2 id="mcp-setup-title">Faro MCP setup</h2>
              <p>Project-level example, no credentials committed</p>
            </div>
          </div>
          <ol className="setup-steps">
            <li>
              <span>1</span>
              <p>
                Copy <code>.bob/mcp.example.json</code> to the ignored local config.
              </p>
            </li>
            <li>
              <span>2</span>
              <p>Set a scoped MCP token and workspace identifier in your secret environment.</p>
            </li>
            <li>
              <span>3</span>
              <p>
                Start PostgreSQL, apply migrations, then launch <code>pnpm mcp:faro</code>.
              </p>
            </li>
            <li>
              <span>4</span>
              <p>Review pending requests in Faro before asking Bob to retrieve context.</p>
            </li>
          </ol>
          <Button kind="tertiary" onClick={copyCommand} renderIcon={Copy}>
            {copied ? 'Command copied' : 'Copy setup command'}
          </Button>
        </section>
      </div>

      <section className="panel panel--flush table-wrap" aria-labelledby="request-queue-title">
        <div className="panel__header" style={{ padding: '1.25rem' }}>
          <div>
            <h2 id="request-queue-title">Recent generation requests</h2>
            <p>Provenance and lifecycle state are always visible</p>
          </div>
        </div>
        <table className="faro-table">
          <caption className="visually-hidden">IBM Bob generation request status</caption>
          <thead>
            <tr>
              <th>Request</th>
              <th>Contact / campaign</th>
              <th>Provenance</th>
              <th>Prompt</th>
              <th>Created</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {bobDrafts.map((item) => (
              <tr key={item.requestId}>
                <td>
                  <code>{item.requestId}</code>
                </td>
                <td>
                  <strong>{item.contact}</strong>
                  <span className="table-subtext">{item.campaign}</span>
                </td>
                <td>
                  <span
                    className={`status-badge status-badge--${item.provenance === 'Demo draft' ? 'attention' : 'awaiting'}`}
                  >
                    {item.provenance}
                  </span>
                </td>
                <td>
                  <code>{item.promptVersion}</code>
                </td>
                <td>{item.createdAt}</td>
                <td>{item.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel audit-note" aria-labelledby="errors-title">
        <div>
          <h2 id="errors-title">Errors requiring action</h2>
          <p>
            <strong>BOB_RUNTIME_UNAVAILABLE</strong> is expected until an official, verified runtime
            is supplied. MCP generation remains available; no request is silently rerouted.
          </p>
        </div>
        <StatusBadge label="1 expected notice" status="attention" />
      </section>
    </div>
  );
}
