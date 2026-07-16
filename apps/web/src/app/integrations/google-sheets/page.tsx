'use client';

import {
  Checkmark,
  Cloud,
  DataTable,
  Renew,
  SettingsAdjust,
  WarningAlt,
} from '@carbon/icons-react';
import {
  Button,
  Checkbox,
  InlineNotification,
  ProgressIndicator,
  ProgressStep,
  Toggle,
} from '@carbon/react';
import { useState } from 'react';

import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { demoSheetRows, sheetSyncRuns } from '@/lib/demo-data';

const mappings = [
  { source: 'First name', target: 'Contact.firstName', required: true },
  { source: 'Last name', target: 'Contact.lastName', required: true },
  { source: 'Email', target: 'Contact.email', required: true },
  { source: 'Organization', target: 'Organization.name', required: false },
  { source: 'Type', target: 'Contact.type', required: false },
  { source: 'Timezone', target: 'Contact.timezone', required: false },
  { source: 'Preferred channel', target: 'Contact.preferredChannel', required: true },
  { source: 'External ID', target: 'Contact.externalId', required: false },
];

const apiMappings = [
  { sourceColumn: 'First name', targetField: 'firstName', required: true, transformation: 'TRIM' },
  { sourceColumn: 'Last name', targetField: 'lastName', required: true, transformation: 'TRIM' },
  { sourceColumn: 'Email', targetField: 'email', required: true, transformation: 'LOWERCASE' },
  {
    sourceColumn: 'Organization',
    targetField: 'organizationName',
    required: false,
    transformation: 'TRIM',
  },
  { sourceColumn: 'Type', targetField: 'type', required: false, transformation: 'UPPERCASE' },
  { sourceColumn: 'Timezone', targetField: 'timezone', required: false, transformation: 'TRIM' },
  {
    sourceColumn: 'Preferred channel',
    targetField: 'preferredChannel',
    required: true,
    transformation: 'UPPERCASE',
  },
  {
    sourceColumn: 'External ID',
    targetField: 'externalId',
    required: false,
    transformation: 'TRIM',
  },
] as const;

export default function GoogleSheetsPage() {
  const [previewed, setPreviewed] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  async function previewSheet(showRunSummary = false) {
    setPreviewError(null);
    const response = await fetch('/api/sheets/preview', {
      body: JSON.stringify({
        headers: Object.keys(demoSheetRows[0]!),
        mappings: apiMappings,
        rows: demoSheetRows,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    const result = (await response.json()) as {
      data?: {
        summary: {
          rowsCreate: number;
          rowsError: number;
          rowsRead: number;
          rowsUpdate: number;
        };
      };
    };
    if (!response.ok || !result.data) {
      setPreviewError('Faro could not validate the fixture. No records were changed.');
      return;
    }
    setPreviewed(true);
    if (showRunSummary) {
      const summary = result.data.summary;
      setSyncMessage(
        `Dry run recalculated: ${summary.rowsRead} read, ${summary.rowsCreate} would create, ${summary.rowsUpdate} would update, and ${summary.rowsError} failed. No records or sync-run rows were persisted.`,
      );
    }
  }

  return (
    <div className="page-shell">
      <PageHeader
        actions={
          <Button disabled kind="secondary" renderIcon={Cloud}>
            Connect Google account
          </Button>
        }
        description="Prepare governed outreach context for Faro’s canonical database with explicit mapping, validation, deduplication, and dry-run evidence."
        eyebrow="Integration · Credentials required"
        title="Google Sheets"
      />

      <InlineNotification
        hideCloseButton
        kind="info"
        lowContrast
        title="OAuth is not configured"
        subtitle="The fixture preview below is fully local. Add Google OAuth credentials and encrypted token storage before connecting a real spreadsheet."
      />

      <div className="integration-status-grid">
        <article className="panel">
          <div className="panel__header">
            <div>
              <h2>OAuth connection</h2>
              <p>Least-privilege read-only scope</p>
            </div>
            <StatusBadge label="Not configured" status="attention" />
          </div>
          <p className="integration-card-copy">
            No Google account is connected. Faro does not store fixture credentials or claim a live
            sync.
          </p>
          <code className="config-key">GOOGLE_CLIENT_ID</code>
        </article>
        <article className="panel">
          <div className="panel__header">
            <div>
              <h2>Fixture connection</h2>
              <p>Local development adapter</p>
            </div>
            <StatusBadge label="Available" status="clear" />
          </div>
          <p className="integration-card-copy">
            Four fictional rows exercise mapping, validation, duplicate detection, and a dry-run
            summary.
          </p>
          <code className="config-key">fixture://sponsor-preview</code>
        </article>
        <article className="panel">
          <div className="panel__header">
            <div>
              <h2>Safe write-back</h2>
              <p>Explicit opt-in only</p>
            </div>
            <StatusBadge label="Disabled" status="clear" />
          </div>
          <p className="integration-card-copy">
            Faro will never write to a sheet unless a workspace admin enables a mapped write-back
            policy.
          </p>
          <Toggle id="write-back-toggle" labelA="Disabled" labelB="Enabled" disabled />
        </article>
      </div>

      <section className="panel sheet-wizard" aria-labelledby="import-preview-title">
        <div className="panel__header">
          <div>
            <h2 id="import-preview-title">Import preview</h2>
            <p>Validate a fictional Sponsor pipeline worksheet before any write</p>
          </div>
          <span className="faro-tag">Development fixture</span>
        </div>
        <ProgressIndicator currentIndex={previewed ? 3 : 2} spaceEqually>
          <ProgressStep complete label="Connection" secondaryLabel="Fixture selected" />
          <ProgressStep complete label="Worksheet" secondaryLabel="Active prospects" />
          <ProgressStep
            current={!previewed}
            complete={previewed}
            label="Map fields"
            secondaryLabel="8 columns mapped"
          />
          <ProgressStep
            current={previewed}
            label="Preview"
            secondaryLabel={previewed ? '4 rows checked' : 'Not run'}
          />
        </ProgressIndicator>

        <div className="sheet-selection-grid">
          <label>
            <span>Spreadsheet</span>
            <select className="filter-select" defaultValue="Faro sponsor demo">
              <option>Faro sponsor demo</option>
            </select>
            <small>Fixture source · no Google request</small>
          </label>
          <label>
            <span>Worksheet</span>
            <select className="filter-select" defaultValue="Active prospects">
              <option>Active prospects</option>
            </select>
            <small>Header row 1 · 4 data rows</small>
          </label>
          <label>
            <span>Conflict behavior</span>
            <select className="filter-select" defaultValue="Update non-empty fields">
              <option>Update non-empty fields</option>
              <option>Skip existing contacts</option>
              <option>Flag every conflict</option>
            </select>
            <small>Email, then external ID deduplication</small>
          </label>
        </div>

        <div className="mapping-grid" aria-label="Column mapping">
          <div className="mapping-grid__header">
            <span>Source column</span>
            <span>Faro field</span>
            <span>Required</span>
          </div>
          {mappings.map((mapping) => (
            <div className="mapping-row" key={mapping.source}>
              <code>{mapping.source}</code>
              <span>
                <SettingsAdjust size={14} /> {mapping.target}
              </span>
              <span>
                {mapping.required ? (
                  <>
                    <Checkmark size={14} /> Yes
                  </>
                ) : (
                  'No'
                )}
              </span>
            </div>
          ))}
        </div>

        <div className="sheet-preview-actions">
          <Checkbox checked disabled id="dry-run" labelText="Dry run — do not write records" />
          <Button
            onClick={() => {
              setSyncMessage(null);
              void previewSheet();
            }}
            renderIcon={DataTable}
          >
            Preview and validate
          </Button>
        </div>

        {previewError ? (
          <InlineNotification
            hideCloseButton
            kind="error"
            lowContrast
            title="Preview unavailable"
            subtitle={previewError}
          />
        ) : null}

        {previewed ? (
          <div className="sheet-results">
            <InlineNotification
              hideCloseButton
              kind="warning"
              lowContrast
              title="Preview complete with two decisions"
              subtitle="2 rows are ready to create, 1 matches an existing contact, and 1 has an invalid email. No database records were changed."
            />
            <div className="table-wrap">
              <table className="faro-table">
                <caption className="visually-hidden">
                  Google Sheets fixture preview and validation results
                </caption>
                <thead>
                  <tr>
                    <th>Row</th>
                    {Object.keys(demoSheetRows[0]!).map((header) => (
                      <th key={header}>{header}</th>
                    ))}
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {demoSheetRows.map((row, index) => {
                    const invalid = index === 2;
                    const duplicate = index === 3;
                    return (
                      <tr key={String(row['External ID'])}>
                        <td className="mono">{index + 2}</td>
                        {Object.values(row).map((value, cell) => (
                          <td key={cell}>{value}</td>
                        ))}
                        <td>
                          <span
                            className={`status-badge status-badge--${invalid ? 'due' : duplicate ? 'attention' : 'clear'}`}
                          >
                            {invalid ? (
                              <>
                                <WarningAlt size={14} /> Invalid email
                              </>
                            ) : duplicate ? (
                              'Update existing'
                            ) : (
                              'Create'
                            )}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="sync-run-bar">
              <div>
                <strong>Dry run ready</strong>
                <span>
                  Write mode is disabled in the fixture adapter. Resolve row 4 before configuring a
                  production sync.
                </span>
              </div>
              <Button kind="secondary" onClick={() => void previewSheet(true)} renderIcon={Renew}>
                Run dry sync
              </Button>
            </div>
            {syncMessage ? (
              <InlineNotification
                hideCloseButton
                kind="success"
                lowContrast
                title="Dry-run result"
                subtitle={syncMessage}
              />
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="panel panel--flush table-wrap" aria-labelledby="sync-history-title">
        <div className="panel__header" style={{ padding: '1.25rem' }}>
          <div>
            <h2 id="sync-history-title">Demonstration sync history</h2>
            <p>Fictional seeded summaries showing the intended audit view</p>
          </div>
        </div>
        <table className="faro-table">
          <caption className="visually-hidden">Sheet synchronization history</caption>
          <thead>
            <tr>
              <th>Source</th>
              <th>Worksheet</th>
              <th>Status</th>
              <th>Run time</th>
              <th>Summary</th>
              <th>Issues</th>
            </tr>
          </thead>
          <tbody>
            {sheetSyncRuns.map((run) => (
              <tr key={run.id}>
                <td>
                  <strong>{run.source}</strong>
                  <span className="table-subtext mono">{run.id}</span>
                </td>
                <td>{run.worksheet}</td>
                <td>
                  <span
                    className={`status-badge status-badge--${run.status === 'Complete' ? 'clear' : 'attention'}`}
                  >
                    {run.status}
                  </span>
                </td>
                <td>{run.ranAt}</td>
                <td>{run.summary}</td>
                <td>{run.issues}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
