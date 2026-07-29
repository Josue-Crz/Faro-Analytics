import { describe, expect, it } from 'vitest';

import {
  canonicalGoogleSheetUrl,
  connectionStatusPresentation,
  pollStatusPresentation,
} from './sheet-connection-status';

describe('Google Sheet connection presentation', () => {
  it('creates a canonical, non-user-controlled Google Docs URL', () => {
    expect(canonicalGoogleSheetUrl('sheet-id_123')).toBe(
      'https://docs.google.com/spreadsheets/d/sheet-id_123/edit',
    );
  });

  it('maps connection states to the required green, yellow, and red signals', () => {
    expect(connectionStatusPresentation('CONNECTED')).toEqual({
      label: 'Connected',
      signal: 'ready',
    });
    expect(connectionStatusPresentation('ATTEMPTING')).toEqual({
      label: 'Attempting',
      signal: 'attention',
    });
    expect(connectionStatusPresentation('SYNC_ISSUE')).toEqual({
      label: 'Unsuccessful',
      signal: 'issue',
    });
    expect(connectionStatusPresentation('NEEDS_AUTH')).toEqual({
      label: 'Unsuccessful',
      signal: 'issue',
    });
  });

  it('uses the same accessible signals for automatic polls', () => {
    expect(pollStatusPresentation('SUCCEEDED').signal).toBe('ready');
    expect(pollStatusPresentation('RUNNING').signal).toBe('attention');
    expect(pollStatusPresentation('FAILED').signal).toBe('issue');
  });
});
