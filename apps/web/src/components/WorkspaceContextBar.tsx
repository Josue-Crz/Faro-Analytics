'use client';

import { DataBase, Renew } from '@carbon/icons-react';
import Link from 'next/link';

export interface WorkspaceContext {
  campaign: { id: string; name: string } | null;
  canonicalDatabase: { label: string; technology: string };
  polling: { automatic: boolean; intervalMs: number | null };
  scope: { campaignId: string | null; kind: 'CAMPAIGN' | 'WORKSPACE' };
  source: {
    displayName: string;
    id: string;
    lastErrorAt: string | null;
    lastErrorCode: string | null;
    lastSyncedAt: string | null;
    readRange: string;
    schedule: string | null;
    status: string;
    worksheetId: string;
  } | null;
  sourceCount: number;
  workspace: { id: string; name: string; slug: string };
}

function campaignIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/campaigns\/([^/?#]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function pollingLabel(context: WorkspaceContext): string {
  if (!context.source) return 'No external source is being polled';
  if (!context.polling.automatic || !context.polling.intervalMs) return 'Automatic polling off';
  const seconds = context.polling.intervalMs / 1_000;
  return seconds < 60
    ? `Polling every ${seconds} seconds`
    : `Polling every ${Math.round(seconds / 60)} minutes`;
}

export function WorkspaceContextBar({
  context,
  failed,
  mode,
  onUseMainWorkspace,
  pathname,
  updating,
}: {
  context: WorkspaceContext | null;
  failed: boolean;
  mode: 'connected' | 'empty' | 'preview';
  onUseMainWorkspace: () => void;
  pathname: string;
  updating: boolean;
}) {
  if (mode === 'empty') return null;

  const previewCampaignId = campaignIdFromPath(pathname);
  const workspaceName =
    mode === 'preview' ? 'Beacon Community Lab · fictional preview' : context?.workspace.name;
  const campaignName =
    mode === 'preview' && previewCampaignId ? 'Demo campaign workspace' : context?.campaign?.name;
  const sourceName =
    mode === 'preview'
      ? 'Demo · Partner pipeline / Sponsors'
      : context?.source
        ? `${context.source.displayName} / ${context.source.worksheetId}`
        : 'No source associated';
  const status =
    mode === 'preview'
      ? 'Preview only · polling off'
      : context
        ? pollingLabel(context)
        : failed
          ? 'Polling context unavailable'
          : 'Loading polling context…';

  return (
    <section
      aria-label="Workspace database and polling context"
      aria-live="polite"
      className="workspace-context-bar"
    >
      <div className="workspace-context-bar__item">
        <DataBase aria-hidden size={18} />
        <span>
          <small>Workspace</small>
          <strong>{workspaceName ?? 'Loading workspace…'}</strong>
        </span>
      </div>
      {campaignName ? (
        <div className="workspace-context-bar__item workspace-context-bar__item--focus">
          <span>
            <small>Current focus</small>
            <strong>{campaignName}</strong>
          </span>
        </div>
      ) : null}
      <div className="workspace-context-bar__item workspace-context-bar__item--source">
        <span>
          <small>Polled data source</small>
          <strong>{sourceName}</strong>
        </span>
      </div>
      <div className="workspace-context-bar__item">
        <Renew aria-hidden size={16} />
        <span>
          <small>Polling</small>
          <strong>{status}</strong>
        </span>
      </div>
      {mode === 'connected' && context?.campaign ? (
        <button
          className="workspace-context-bar__button"
          disabled={updating}
          onClick={onUseMainWorkspace}
          type="button"
        >
          {updating ? 'Switching…' : 'Return to main workspace'}
        </button>
      ) : (
        <Link className="workspace-context-bar__link" href="/integrations/google-sheets">
          Data sources
        </Link>
      )}
    </section>
  );
}
