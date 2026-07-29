'use client';

import { Launch } from '@carbon/icons-react';

import {
  connectionStatusPresentation,
  pollStatusPresentation,
  type SheetConnectionStatus,
  type SheetSyncStatus,
} from '@/lib/sheet-connection-status';
import { SHEET_POLL_LOG_LIMIT, visibleSheetPollRuns } from '@/lib/sheet-polling';

import { StatusBadge } from './StatusBadge';

export interface SheetConnectionRecord {
  displayName: string;
  id: string;
  lastErrorAt: string | null;
  lastErrorCode: string | null;
  lastSyncedAt: string | null;
  readRange: string;
  spreadsheetId: string;
  status: SheetConnectionStatus;
  syncDirection: 'BIDIRECTIONAL' | 'IMPORT';
  syncRuns: Array<{
    completedAt: string | null;
    errorSummary: string | null;
    id: string;
    rowsCreated: number;
    rowsFailed: number;
    rowsRead: number;
    rowsUpdated: number;
    startedAt: string;
    status: SheetSyncStatus;
  }>;
  url: string;
  worksheetId: string;
  writeBackEnabled: boolean;
}

export function SheetConnectionsPanel({
  connections,
  onSelect,
  selectedId,
}: {
  connections: SheetConnectionRecord[];
  onSelect: (connection: SheetConnectionRecord) => void;
  selectedId: string;
}) {
  const selected = connections.find((connection) => connection.id === selectedId) ?? connections[0];
  const retainedRuns = visibleSheetPollRuns(selected?.syncRuns ?? []);

  return (
    <section className="panel sheet-connections" aria-labelledby="sheet-connections-title">
      <div className="panel__header">
        <div>
          <h2 id="sheet-connections-title">Connected Google Sheet URLs</h2>
          <p>Each tab shows the exact Google Sheet source and its current connection validity.</p>
        </div>
      </div>
      {connections.length ? (
        <>
          <div
            aria-label="Google Sheet connections"
            className="sheet-connection-tabs"
            role="tablist"
          >
            {connections.map((connection) => {
              const presentation = connectionStatusPresentation(connection.status);
              const selectedTab = connection.id === selected?.id;
              return (
                <button
                  aria-controls={`sheet-panel-${connection.id}`}
                  aria-selected={selectedTab}
                  className="sheet-connection-tab"
                  id={`sheet-tab-${connection.id}`}
                  key={connection.id}
                  onClick={() => onSelect(connection)}
                  role="tab"
                  type="button"
                >
                  <span className="sheet-connection-tab__heading">
                    <strong>{connection.displayName}</strong>
                    <StatusBadge label={presentation.label} status={presentation.signal} />
                  </span>
                  <code>{connection.url}</code>
                  <small>Worksheet: {connection.worksheetId}</small>
                </button>
              );
            })}
          </div>
          {selected ? (
            <div
              aria-labelledby={`sheet-tab-${selected.id}`}
              className="sheet-connection-detail"
              id={`sheet-panel-${selected.id}`}
              role="tabpanel"
            >
              <div className="sheet-connection-detail__summary">
                <div>
                  <p className="eyebrow">Google Sheet URL</p>
                  <a href={selected.url} rel="noreferrer" target="_blank">
                    {selected.url} <Launch aria-hidden size={14} />
                  </a>
                </div>
                <dl>
                  <div>
                    <dt>Worksheet</dt>
                    <dd>{selected.worksheetId}</dd>
                  </div>
                  <div>
                    <dt>Range</dt>
                    <dd>{selected.readRange}</dd>
                  </div>
                  <div>
                    <dt>Last connected poll</dt>
                    <dd>
                      {selected.lastSyncedAt
                        ? new Date(selected.lastSyncedAt).toLocaleString()
                        : 'Not yet'}
                    </dd>
                  </div>
                  <div>
                    <dt>Latest issue</dt>
                    <dd>
                      {selected.lastErrorCode ??
                        (selected.status === 'NEEDS_AUTH'
                          ? 'Google authentication required'
                          : selected.status === 'DISABLED'
                            ? 'Connection disabled'
                            : 'None')}
                    </dd>
                  </div>
                  <div>
                    <dt>Contact edit sync</dt>
                    <dd>
                      {selected.writeBackEnabled && selected.syncDirection === 'BIDIRECTIONAL'
                        ? 'Writes mapped edits to the source row'
                        : 'Reconnect Google to enable'}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="sheet-poll-log">
                <div className="sheet-poll-log__header">
                  <div>
                    <h3>Automatic poll log</h3>
                    <p>
                      Newest {SHEET_POLL_LOG_LIMIT} for this URL. Older automatic poll records are
                      permanently removed as new ones start.
                    </p>
                  </div>
                  <span>
                    {retainedRuns.length} / {SHEET_POLL_LOG_LIMIT} retained
                  </span>
                </div>
                {retainedRuns.length ? (
                  <div className="table-wrap">
                    <table className="faro-table">
                      <thead>
                        <tr>
                          <th>Started</th>
                          <th>Status</th>
                          <th>Rows</th>
                          <th>Changes</th>
                          <th>Result</th>
                        </tr>
                      </thead>
                      <tbody>
                        {retainedRuns.map((run) => {
                          const status = pollStatusPresentation(run.status);
                          return (
                            <tr key={run.id}>
                              <td>{new Date(run.startedAt).toLocaleString()}</td>
                              <td>
                                <StatusBadge label={status.label} status={status.signal} />
                              </td>
                              <td>{run.rowsRead}</td>
                              <td>
                                {run.rowsCreated} created · {run.rowsUpdated} updated
                              </td>
                              <td>{run.errorSummary ?? 'Completed without connection errors'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="empty-inline">
                    No automatic polls yet. Manual reads and imports remain in the audit below.
                  </p>
                )}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <p className="empty-inline">
          No Google Sheet URL has been saved yet. Validate and import one below.
        </p>
      )}
    </section>
  );
}
