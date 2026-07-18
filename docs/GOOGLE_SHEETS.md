# Google Sheets synchronization

PostgreSQL is Faro's canonical operational database. Sheets are governed import/sync sources—not a
model-training mechanism. IBM Bob reads only approved canonical context through Faro MCP; Google
OAuth tokens and raw worksheets are never placed in Bob prompts.

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
- Tester OAuth with encrypted refresh tokens and read-only Sheets access.
- A transactional importer with database-backed connections, organizations, contacts, audit
  events, and sync-run summaries. It never invents a campaign.
- Manual refresh plus a secret-protected refresh endpoint at `/api/cron/google-sheets`.
- Last-good-snapshot fallback: a failed refresh marks the connection `SYNC_ISSUE` but preserves
  previously imported PostgreSQL records.
- Soft-delete reconciliation: contacts absent from a successful poll are archived. A Sheet-owned
  organization absent from the poll moves from **Active organizations** to **Trash** after it has no
  remaining active contacts. Returning rows restore the records automatically.
- Successful authentication starts clean. Fictional records appear only after an explicit OAuth
  failure.
- Near-real-time polling through `pnpm worker`, with a configurable interval and overlap guard.
- A workspace-scoped read/sync audit containing timestamp, actor identity, trigger, source, and row
  count.

The live importer discovers worksheet tabs, recognizes common sponsor/contact headers (including
combined full names), assigns confidence to inferred mappings, and preserves unfamiliar columns as
contact custom fields. Users can correct a mapping before import, and the confirmed mapping is
persisted for automatic refresh. Imported contacts begin with `UNKNOWN` consent. A human must
confirm the outreach basis before Faro will create a Bob generation request. Drafts remain
`AWAITING_BOB` until Bob processes them through Faro MCP, and all output still requires human
review.

When one source row contains comma-, semicolon-, or newline-separated contact names and emails,
Faro expands them positionally into separate contacts that share the row's organization. For
example, `Avery Jordan, Morgan Lee` paired with `avery@example.test, morgan@example.test` creates
two contacts. Positional roles, phone numbers, and external IDs are also applied when present.
Unmatched names or identifiers remain visible as row errors rather than being guessed.

The signed-in Google identity becomes the internal owner of imported records. Recognized follow-up
dates are preserved as pending work. The user creates a campaign and explicitly assigns those
pending dates before Faro creates campaign membership or active follow-up tasks.

Any accessible spreadsheet and tab can be inspected, but canonical contact workflows still need a
usable name plus an email or external ID. Rows without that minimum identity are visibly marked as
needing review and skipped; they are not silently coerced into contacts. For Excel, first
upload/convert the workbook to Google Sheets; direct `.xlsx` ingestion is not implemented.

## Credentials required

Real Google access needs OAuth client credentials, a matching redirect URI, and a 32-byte token
encryption key. Request the narrowest spreadsheet scope appropriate to the configured direction.
Validate OAuth state, bind the callback to the initiating workspace/user, encrypt tokens at rest,
and never expose refresh tokens to IBM Bob or MCP tool results.

The repository intentionally does not include working credentials. The connection action fails
closed until the four Google/encryption variables are supplied. See
[tester deployment setup](DEPLOYMENT_INTEGRATIONS.md).

## Live synchronization sequence

The production adapter must implement this sequence before live synchronization is enabled:

1. Enter the spreadsheet URL/ID, exact worksheet tab, and bounded A1 range.
2. Let Faro discover the tabs, then select one and inspect the inferred mapping confidence.
3. Correct ambiguous mappings and review the create/update/error preview.
4. Select **Import into Faro database**. PostgreSQL changes and the sync-run audit are
   transactional.
5. Create a campaign yourself; import does not invent one.
6. Assign preserved follow-up dates to that campaign from the Follow-ups page.
7. Open the connected dashboard and review each imported contact's outreach basis.
8. Queue an eligible contact for Bob. Bob retrieves the governed request from Faro MCP.
9. Refresh from the dashboard, reconnect OAuth, or call the cron endpoint with
   `FARO_SYNC_CRON_SECRET`.
10. If refresh fails, inspect the connection error; Faro continues showing the last successful
    database snapshot.

Only a successful Sheet read triggers removal reconciliation. Faro never permanently deletes a
record because of a poll. Trashed organizations retain their removal timestamp and archived-contact
count, and reappear under **Active organizations** when their source row returns. Manually created
organizations and organizations with another active contact are not trashed merely because one
Sheet row disappears.

Workspace users can also move an organization and its affiliated contacts to Trash manually from
the Organizations page, including test or manually created records. The Restore action reverses
that operation. Both actions are workspace-scoped and audited. Manually trashed records remain in
Trash during later Sheet refreshes until a user explicitly restores them.

## Near-real-time refresh

Google Sheets does not provide a direct row-change webhook. Faro therefore polls its protected sync
endpoint when the worker is configured:

```dotenv
FARO_WEB_URL="http://localhost:3000"
FARO_SYNC_CRON_SECRET="replace-with-a-random-secret"
FARO_SHEET_POLL_INTERVAL_MS="30000"
```

Run the web app and `pnpm worker` in separate processes. The worker immediately refreshes and then
polls every 30 seconds. Faro enforces a 15-second minimum and prevents overlapping polls. Each read
or sync is recorded under **Google Sheet read history** with its actor and trigger. This is
near-real-time, not instantaneous. A later public deployment may replace polling with Google Drive
change notifications after adding the required Drive metadata scope, HTTPS webhook verification,
channel renewal, and change-token persistence.

Write-back is disabled by default. When explicitly enabled, only mapped columns may be written and
text beginning with `=`, `+`, `-`, or `@` is escaped to prevent spreadsheet formula execution.
