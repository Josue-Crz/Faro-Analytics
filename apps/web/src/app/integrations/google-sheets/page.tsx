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
  TextInput,
  Toggle,
} from '@carbon/react';
import { useEffect, useState } from 'react';

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

interface LiveMapping {
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  reason: string;
  required: boolean;
  sourceColumn: string;
  targetField: string;
  transformation: 'NONE' | 'TRIM' | 'LOWERCASE' | 'UPPERCASE' | 'SPLIT_COMMA';
}

interface LivePreview {
  mappingIssues: Array<{ message: string }>;
  rows: Array<{
    action: 'CREATE' | 'UPDATE' | 'SKIP' | 'ERROR';
    issues: Array<{ message: string }>;
    rowNumber: number;
  }>;
  summary: {
    rowsCreate: number;
    rowsError: number;
    rowsRead: number;
    rowsSkip: number;
    rowsUpdate: number;
  };
}

interface SheetHistoryEvent {
  action: 'READ' | 'SYNC';
  actor: { email: string | null; name: string };
  id: string;
  metadata: Record<string, unknown>;
  occurredAt: string;
  source: string;
}

const canonicalTargets = [
  ['fullName', 'Full name'],
  ['firstName', 'First name'],
  ['lastName', 'Last name'],
  ['email', 'Email'],
  ['phone', 'Phone'],
  ['title', 'Job title'],
  ['organizationName', 'Organization'],
  ['externalId', 'External ID'],
  ['timezone', 'Timezone'],
  ['preferredChannel', 'Preferred channel'],
  ['type', 'Contact type'],
  ['tags', 'Tags'],
  ['consentStatus', 'Consent status'],
] as const;

export default function GoogleSheetsPage() {
  const [previewed, setPreviewed] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [sheetRange, setSheetRange] = useState('A1:ZZ1001');
  const [worksheetTitle, setWorksheetTitle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [liveRows, setLiveRows] = useState<Record<string, string>[] | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [worksheets, setWorksheets] = useState<Array<{ sheetId: number; title: string }>>([]);
  const [liveMappings, setLiveMappings] = useState<LiveMapping[]>([]);
  const [livePreview, setLivePreview] = useState<LivePreview | null>(null);
  const [sheetHistory, setSheetHistory] = useState<SheetHistoryEvent[]>([]);

  useEffect(() => {
    void fetch('/api/auth/session', { cache: 'no-store' })
      .then((response) => response.json())
      .then((result: { authenticated?: boolean; mode?: string }) => {
        setConnected(Boolean(result.authenticated));
        setFallback(result.mode === 'FALLBACK');
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!connected) return;
    void fetch('/api/sheets/history', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('history');
        return (await response.json()) as { data: SheetHistoryEvent[] };
      })
      .then((result) => setSheetHistory(result.data))
      .catch(() => undefined);
  }, [connected, syncMessage]);

  function normalizedSpreadsheetId() {
    return spreadsheetId.match(/\/spreadsheets\/d\/([\w-]+)/)?.[1] ?? spreadsheetId.trim();
  }

  async function findWorksheets() {
    setPreviewError(null);
    const response = await fetch('/api/sheets/metadata', {
      body: JSON.stringify({ spreadsheetId: normalizedSpreadsheetId() }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    const result = (await response.json()) as {
      data?: { spreadsheetTitle: string; worksheets: Array<{ sheetId: number; title: string }> };
      error?: string;
    };
    if (!response.ok || !result.data) {
      setPreviewError(
        `Faro could not inspect that spreadsheet (${result.error ?? 'unknown error'}).`,
      );
      return;
    }
    setDisplayName((current) => current || result.data!.spreadsheetTitle);
    setWorksheets(result.data.worksheets);
    setWorksheetTitle((current) => current || result.data!.worksheets[0]?.title || '');
  }

  async function validateLiveSheet(rows: Record<string, string>[], mappings: LiveMapping[]) {
    const response = await fetch('/api/sheets/preview', {
      body: JSON.stringify({
        headers: Object.keys(rows[0] ?? {}),
        mappings: mappings.map(
          ({ confidence: _confidence, reason: _reason, ...mapping }) => mapping,
        ),
        rows,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    const result = (await response.json()) as { data?: LivePreview };
    setLivePreview(response.ok && result.data ? result.data : null);
  }

  async function readGoogleSheet() {
    setPreviewError(null);
    const normalizedId = normalizedSpreadsheetId();
    const response = await fetch('/api/sheets/read', {
      body: JSON.stringify({
        range: sheetRange,
        spreadsheetId: normalizedId,
        worksheetTitle,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    const result = (await response.json()) as {
      data?: { inferredMappings: LiveMapping[]; rows: Record<string, string>[] };
      error?: string;
    };
    if (!response.ok || !result.data) {
      setPreviewError(
        `Faro could not read that Google Sheet (${result.error ?? 'unknown error'}).`,
      );
      return;
    }
    setLiveRows(result.data.rows);
    setLiveMappings(result.data.inferredMappings);
    await validateLiveSheet(result.data.rows, result.data.inferredMappings);
    setSyncMessage(
      `Read ${result.data.rows.length} Google Sheet rows. No Faro records were changed.`,
    );
  }

  async function importGoogleSheet() {
    setPreviewError(null);
    setSyncing(true);
    const normalizedId = normalizedSpreadsheetId();
    const response = await fetch('/api/sheets/sync', {
      body: JSON.stringify({
        displayName: displayName || 'Connected Google Sheet',
        mappings: liveMappings.map(
          ({ confidence: _confidence, reason: _reason, ...mapping }) => mapping,
        ),
        readRange: sheetRange,
        spreadsheetId: normalizedId,
        worksheetTitle,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    const result = (await response.json()) as {
      data?: {
        archivedContacts: number;
        archivedOrganizations: number;
        followUpsPending: number;
        rowsCreated: number;
        rowsFailed: number;
        rowsRead: number;
        rowsUpdated: number;
      };
      error?: string;
    };
    setSyncing(false);
    if (!response.ok || !result.data) {
      setPreviewError(
        `Faro could not import the Sheet (${result.error ?? 'unknown error'}). The last successful database snapshot was kept.`,
      );
      return;
    }
    setSyncMessage(
      `Database sync complete: ${result.data.rowsRead} rows read, ${result.data.rowsCreated} created, ${result.data.rowsUpdated} updated, ${result.data.rowsFailed} needing review, ${result.data.followUpsPending} follow-up dates pending campaign assignment, and ${result.data.archivedOrganizations} removed organizations moved to Trash.`,
    );
  }

  async function previewSheet(showRunSummary = false) {
    setPreviewError(null);
    const rows = liveRows ?? demoSheetRows;
    const response = await fetch('/api/sheets/preview', {
      body: JSON.stringify({
        headers: Object.keys(rows[0] ?? {}),
        mappings: apiMappings,
        rows,
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
          <Button
            kind="secondary"
            onClick={() =>
              window.location.assign('/api/auth/google/start?returnTo=/integrations/google-sheets')
            }
            renderIcon={Cloud}
          >
            {connected ? 'Reconnect Google account' : 'Connect Google account'}
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
        title={
          connected
            ? 'Google OAuth connected'
            : fallback
              ? 'OAuth failed · fictional fallback active'
              : 'Connect Google to create an empty workspace'
        }
        subtitle={
          connected
            ? 'Your tokens are encrypted at rest. Live spreadsheet selection remains disabled until a connection is explicitly selected.'
            : fallback
              ? 'The preview below is fictional and local. Retry OAuth to return to a clean connected workspace.'
              : 'No contacts, organizations, campaigns, or follow-ups are loaded before authentication.'
        }
      />

      {connected ? (
        <section className="panel" aria-labelledby="live-sheet-title">
          <div className="panel__header">
            <div>
              <h2 id="live-sheet-title">Read an existing spreadsheet</h2>
              <p>
                Paste a spreadsheet URL or ID. Faro requests read-only access and performs no
                write-back.
              </p>
            </div>
          </div>
          <div className="sheet-preview-actions">
            <TextInput
              id="spreadsheet-name"
              labelText="Connection name"
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Sponsor outreach database"
              value={displayName}
            />
            <TextInput
              id="spreadsheet-id"
              labelText="Spreadsheet URL or ID"
              onChange={(event) => setSpreadsheetId(event.target.value)}
              value={spreadsheetId}
            />
            <Button
              disabled={!spreadsheetId.trim()}
              kind="tertiary"
              onClick={() => void findWorksheets()}
            >
              Find worksheet tabs
            </Button>
            {worksheets.length ? (
              <label>
                <span>Worksheet tab</span>
                <select
                  className="filter-select"
                  onChange={(event) => {
                    setWorksheetTitle(event.target.value);
                    setLiveRows(null);
                    setLivePreview(null);
                  }}
                  value={worksheetTitle}
                >
                  {worksheets.map((worksheet) => (
                    <option key={worksheet.sheetId} value={worksheet.title}>
                      {worksheet.title}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <TextInput
                id="worksheet-title"
                labelText="Worksheet tab name"
                onChange={(event) => setWorksheetTitle(event.target.value)}
                placeholder="Select Find worksheet tabs, or type the exact name"
                value={worksheetTitle}
              />
            )}
            <TextInput
              id="sheet-range"
              labelText="Worksheet range"
              onChange={(event) => setSheetRange(event.target.value)}
              value={sheetRange}
            />
            <Button
              disabled={!spreadsheetId.trim() || !worksheetTitle.trim()}
              onClick={() => void readGoogleSheet()}
              renderIcon={Cloud}
            >
              Read sheet
            </Button>
          </div>
          {previewError ? (
            <InlineNotification
              hideCloseButton
              kind="error"
              lowContrast
              title="Google Sheet needs attention"
              subtitle={previewError}
            />
          ) : null}
          {liveRows ? (
            <div className="integration-card-copy">
              <p>
                Live read ready: {liveRows.length} rows. Faro mapped recognized columns and
                preserved unfamiliar columns as custom fields.
              </p>
              <div className="mapping-grid" aria-label="Detected live column mappings">
                <div className="mapping-grid__header">
                  <span>Sheet column</span>
                  <span>Faro field</span>
                  <span>Confidence</span>
                </div>
                {liveMappings.map((mapping, index) => (
                  <div className="mapping-row" key={`${mapping.sourceColumn}-${index}`}>
                    <code>{mapping.sourceColumn}</code>
                    <select
                      aria-label={`Faro field for ${mapping.sourceColumn}`}
                      className="filter-select"
                      onChange={(event) => {
                        const targetField = event.target.value;
                        const next = liveMappings.map((item, itemIndex) =>
                          itemIndex === index
                            ? {
                                ...item,
                                confidence: 'HIGH' as const,
                                reason: 'Confirmed by user',
                                targetField,
                                transformation:
                                  targetField === 'email'
                                    ? ('LOWERCASE' as const)
                                    : targetField === 'tags'
                                      ? ('SPLIT_COMMA' as const)
                                      : ('TRIM' as const),
                              }
                            : item,
                        );
                        setLiveMappings(next);
                        void validateLiveSheet(liveRows, next);
                      }}
                      value={mapping.targetField}
                    >
                      {canonicalTargets.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                      {mapping.targetField.startsWith('customFields.') ? (
                        <option value={mapping.targetField}>Custom: {mapping.sourceColumn}</option>
                      ) : null}
                    </select>
                    <StatusBadge
                      label={`${mapping.confidence.toLocaleLowerCase()} · ${mapping.reason}`}
                      status={
                        mapping.confidence === 'HIGH'
                          ? 'ready'
                          : mapping.confidence === 'MEDIUM'
                            ? 'attention'
                            : 'clear'
                      }
                    />
                  </div>
                ))}
              </div>
              {livePreview ? (
                <InlineNotification
                  hideCloseButton
                  kind={livePreview.summary.rowsError ? 'warning' : 'success'}
                  lowContrast
                  title={`${livePreview.summary.rowsCreate} new · ${livePreview.summary.rowsUpdate} updates · ${livePreview.summary.rowsError} need review`}
                  subtitle={
                    livePreview.summary.rowsError
                      ? `Faro will skip invalid rows. First issue: ${livePreview.rows.find((row) => row.action === 'ERROR')?.issues[0]?.message ?? livePreview.mappingIssues[0]?.message ?? 'mapping needs review'}`
                      : 'All sampled rows passed canonical validation.'
                  }
                />
              ) : null}
              <Button
                disabled={
                  syncing ||
                  !livePreview ||
                  livePreview.summary.rowsCreate + livePreview.summary.rowsUpdate === 0
                }
                onClick={() => void importGoogleSheet()}
                renderIcon={DataTable}
              >
                {syncing ? 'Importing…' : 'Import into Faro database'}
              </Button>
              {syncMessage ? (
                <InlineNotification
                  hideCloseButton
                  kind="success"
                  lowContrast
                  title="Google Sheet status"
                  subtitle={syncMessage}
                />
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {connected ? (
        <section className="panel panel--flush table-wrap" aria-labelledby="live-history-title">
          <div className="panel__header" style={{ padding: '1.25rem' }}>
            <div>
              <h2 id="live-history-title">Google Sheet read history</h2>
              <p>
                Workspace audit showing when a Sheet was read or synchronized and who triggered it.
              </p>
            </div>
          </div>
          {sheetHistory.length ? (
            <table className="faro-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Action</th>
                  <th>Sheet</th>
                  <th>Actor</th>
                  <th>Trigger</th>
                  <th>Rows</th>
                </tr>
              </thead>
              <tbody>
                {sheetHistory.map((event) => (
                  <tr key={event.id}>
                    <td>{new Date(event.occurredAt).toLocaleString()}</td>
                    <td>{event.action}</td>
                    <td>{event.source}</td>
                    <td>
                      {event.actor.name}
                      <span className="table-subtext">{event.actor.email ?? 'System'}</span>
                    </td>
                    <td>{String(event.metadata.trigger ?? 'UNKNOWN').replaceAll('_', ' ')}</td>
                    <td>{String(event.metadata.rowsRead ?? '—')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ padding: '1.25rem' }}>No Google Sheet reads have been recorded yet.</p>
          )}
        </section>
      ) : null}

      <div className="integration-status-grid">
        <article className="panel">
          <div className="panel__header">
            <div>
              <h2>OAuth connection</h2>
              <p>Least-privilege read-only scope</p>
            </div>
            <StatusBadge
              label={connected ? 'Connected' : 'Not connected'}
              status={connected ? 'ready' : 'attention'}
            />
          </div>
          <p className="integration-card-copy">
            {connected
              ? 'Google granted identity and read-only spreadsheet access for this tester.'
              : 'No Google account is connected. Faro does not store fixture credentials or claim a live sync.'}
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

      {fallback ? (
        <>
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
                      Write mode is disabled in the fixture adapter. Resolve row 4 before
                      configuring a production sync.
                    </span>
                  </div>
                  <Button
                    kind="secondary"
                    onClick={() => void previewSheet(true)}
                    renderIcon={Renew}
                  >
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
        </>
      ) : null}
    </div>
  );
}
