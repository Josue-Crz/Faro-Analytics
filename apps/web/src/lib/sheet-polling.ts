export const SHEET_POLL_LOG_LIMIT = 10;

export function visibleSheetPollRuns<Run>(runs: readonly Run[]): Run[] {
  return runs.slice(0, SHEET_POLL_LOG_LIMIT);
}
