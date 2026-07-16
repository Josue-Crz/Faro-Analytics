# Google Sheets synchronization

PostgreSQL is Faro's canonical operational database. Sheets are governed import/sync sources—not a
model-training mechanism. The shared `packages/google-sheets` client is used by the fixture preview
and Sheets MCP server and is designed for a future application synchronization adapter.

## Available now

- Typed `GoogleSheetsClient` contract and deterministic fixture client.
- Header discovery and suggested arbitrary column mapping.
- Required-field, email, and identity validation.
- Email/external-ID deduplication and explicit `SKIP`, `UPDATE`, or `ERROR` conflict behavior.
- Row-level errors and dry-run summary.
- Idempotent run keys/checkpoints in the sync service contract.
- Exponential retry primitive and audit metadata.
- Spreadsheet formula-injection neutralization for explicit write-back.
- First-party scoped MCP tools and UI preview at `/integrations/google-sheets`.

This release does not connect to Google, persist canonical contact upserts, schedule syncs, or write
sync-run/checkpoint records. The UI and MCP server therefore keep synchronization in dry-run mode.

## Credentials required

Real Google access needs OAuth client credentials, a matching redirect URI, and a 32-byte token
encryption key. Request the narrowest spreadsheet scope appropriate to the configured direction.
Validate OAuth state, bind the callback to the initiating workspace/user, encrypt tokens at rest,
and never expose refresh tokens to IBM Bob or MCP tool results.

The repository intentionally does not include working credentials. The connection button remains
disabled and labeled **OAuth is not configured** until the production adapter and encrypted token
repository are supplied and verified.

## Required production synchronization sequence

The production adapter must implement this sequence before live synchronization is enabled:

1. Select spreadsheet, worksheet, and header row.
2. Review or edit column mappings, including custom fields.
3. Preview all proposed creates, updates, skips, and errors.
4. Choose conflict behavior and keep dry-run enabled until errors are resolved.
5. Run an idempotent sync. PostgreSQL changes and the sync-run audit are transactional.
6. Store the checkpoint/revision only after the transaction succeeds.
7. Retry transient reads with backoff; require user action for mapping or credential errors.

Write-back is disabled by default. When explicitly enabled, only mapped columns may be written and
text beginning with `=`, `+`, `-`, or `@` is escaped to prevent spreadsheet formula execution.
