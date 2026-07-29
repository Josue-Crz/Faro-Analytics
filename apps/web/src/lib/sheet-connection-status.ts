export type SheetConnectionStatus =
  'CONNECTED' | 'ATTEMPTING' | 'NEEDS_AUTH' | 'SYNC_ISSUE' | 'DISABLED';

export type SheetSyncStatus =
  'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'PARTIAL' | 'FAILED' | 'DRY_RUN';

type StatusPresentation = {
  label: string;
  signal: 'attention' | 'clear' | 'issue' | 'ready';
};

export function canonicalGoogleSheetUrl(spreadsheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/edit`;
}

export function connectionStatusPresentation(status: SheetConnectionStatus): StatusPresentation {
  if (status === 'CONNECTED') return { label: 'Connected', signal: 'ready' };
  if (status === 'ATTEMPTING') return { label: 'Attempting', signal: 'attention' };
  return { label: 'Unsuccessful', signal: 'issue' };
}

export function pollStatusPresentation(status: SheetSyncStatus): StatusPresentation {
  if (status === 'SUCCEEDED') return { label: 'Connected', signal: 'ready' };
  if (status === 'PENDING' || status === 'RUNNING' || status === 'PARTIAL') {
    return {
      label: status === 'PARTIAL' ? 'Completed with issues' : 'Attempting',
      signal: 'attention',
    };
  }
  if (status === 'DRY_RUN') return { label: 'Preview only', signal: 'clear' };
  return { label: 'Unsuccessful', signal: 'issue' };
}
