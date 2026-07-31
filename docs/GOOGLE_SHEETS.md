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
- Tester OAuth with encrypted refresh tokens and Sheets access for governed reads plus explicit
  contact-edit write-back.
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
- Automatic optimizer schedule assignment through the same worker cadence. Eligible contacts in
  draft or active campaigns receive both an initial contact and a cooldown-safe follow-up date.
- Deterministic company categorization on every successful import or poll, including normalization
  of common third-party taxonomy columns and bounded company-name/domain inference.
- Workspace- and campaign-scoped manual contact editing from both Contacts and Outreach. An
  imported contact edit writes to its exact mapped source row before Faro saves the local manual
  override; database-only contacts remain local because they have no Sheet row.
- Manual or optimizer-assigned contact schedules write `Initial Contact Date` and `Follow-Up Date`
  as date-time cells on the exact source row. The spreadsheet timezone is used for display and
  converted back to the same UTC instants during polling.
- Optional campaign-to-source association. A campaign opened from **Campaigns** exposes contacts
  from its exact Sheet source plus manually managed database records; it rejects another Sheet's
  contacts.
- A persistent product context bar that names the current workspace, associated campaign source,
  and truthful polling state.
- A connected-Sheet tab for every saved source. Each tab displays Faro's canonical Google Docs URL
  and a textual, non-color-only validity state: green **Connected**, yellow **Attempting**, or red
  **Unsuccessful**.
- A per-connection automatic poll log that stores only the newest 10 runs. Successful and failed
  polls both count toward the limit; when a new automatic poll starts, older `SheetSyncRun` records
  for that connection are permanently deleted. The connection API also returns at most 10, and the
  client renders at most 10 as a final display guard.
- A workspace-scoped read/sync audit containing timestamp, actor identity, trigger, source, and row
  count. Durable automatic-poll audit events remain stored for security purposes but are excluded
  from the user-facing manual read/sync table so they cannot duplicate or bypass the capped poll
  log.

The live importer discovers worksheet tabs, recognizes common sponsor/contact headers (including
combined full names), assigns confidence to inferred mappings, and preserves unfamiliar columns as
contact custom fields. Users can correct a mapping before import, and the confirmed mapping is
persisted for automatic refresh. Imported contacts begin with `UNKNOWN` consent. A human must
confirm the outreach basis before Faro will create a Bob generation request. Drafts remain
`AWAITING_BOB` until Bob processes them through Faro MCP, and all output still requires human
review.

URL validation shows **Attempting** while Faro is requesting metadata or reading the worksheet,
**Connected** only after Google confirms the document can be read, and **Unsuccessful** after an
authentication, document, or sync failure. Faro constructs displayed links from the validated
spreadsheet ID on the `docs.google.com` origin rather than rendering an arbitrary user-supplied
link.

Every successful import or poll tries to assign each affiliated company one specific canonical
category. Evidence is evaluated in a stable order: an explicit source category; imported
third-party taxonomy or company description; a verified Wikidata lookup; bounded known-name/domain
rules; then an explainable low-confidence best-effort classification from organization type and
domain. Every affiliated organization receives a queryable category, and the stored confidence and
source distinguish verified evidence from a best-effort result. A lower-confidence row cannot
replace a higher-confidence result for the same organization during one poll.

Faro recognizes `Industry`, `Company Industry`, `Organization Industry`, `Sector`, GICS,
LinkedIn Industry, NAICS/SIC descriptions, company category, vertical, Crunchbase/Clearbit
category, and similar imported headers. These source labels normalize into the app-wide taxonomy:
Food, Technology, Healthcare, Energy, Financial Services, Consumer Goods, Automotive, Education,
Transportation, Manufacturing, Real Estate & Construction, Telecommunications, Hospitality &
Travel, Media, Philanthropy, Community Development, Government, and Professional Services. `Other`
remains only as an internal compatibility value for legacy or non-company organization data; it is
not offered as a company-category filter or shown as a waiting state.

The organization record stores the category plus classification source, confidence, matched rule,
and ruleset version. When local evidence remains unresolved, Faro searches Wikidata and reads its
structured `industry (P452)` values. A supplied company website must match Wikidata's `official
website (P856)`; without a website, Faro requires one exact-name company match. Only the company
name and optional website are sent—never contact fields, messages, OAuth tokens, or IBM Bob
context. Matches are cached for 30 days, no-match results for 7 days, and at most 10 sequential
lookups run per sync. Provider failures do not fail the Sheet poll or overwrite a previous verified
match, and a later no-match response does not erase previously verified category evidence.

Sync results report local, name/domain, Wikidata, and best-effort classifications. Search, category
filters, company grouping, campaign audiences, follow-ups, and outreach all use the same stored
category. Set `FARO_WIKIDATA_ENRICHMENT_ENABLED=false` to disable new Wikidata requests; cached
verified results remain available.

When one source row contains comma-, semicolon-, or newline-separated contact names and emails,
Faro expands them positionally into separate contacts that share the row's organization. For
example, `Avery Jordan, Morgan Lee` paired with `avery@example.test, morgan@example.test` creates
two contacts. Positional roles, phone numbers, and external IDs are also applied when present.
Unmatched names or identifiers remain visible as row errors rather than being guessed.

The signed-in Google identity becomes the internal owner of imported records. Recognized follow-up
dates are preserved as pending work. Faro also recognizes `Initial Date`, `Initial Outreach Date`,
`Initial Contact Date`, `Initial Contact At`, `Follow-Up Initial Date`, and `Follow-Up Start Date`.
If the row has only a follow-up date, the
import timestamp becomes the initial date, clamped to the follow-up date for overdue rows. The user
creates a campaign and explicitly assigns both dates before Faro creates campaign membership or an
active follow-up task.

Every imported contact also receives a required future contact action immediately. Because a new
Sheet contact starts with unknown consent, that first action is a dated outreach-basis review.
After a person confirms consent, Faro deterministically assigns an initial-outreach date or, when
outbound history already exists, a follow-up date. A future imported follow-up date is preserved;
an expired imported date is replaced by a future operational date rather than activated as overdue
work. See [Contact scheduling](CONTACT_SCHEDULING.md).

Users can edit a contact's name, email, phone, person's role/title, timezone, type, and preferred
channel from the connected Contacts directory, and edit the person's role from Outreach. For
Sheet-imported contacts, Faro resolves `sourceRow`, updates the mapped Google cell with `RAW` input,
and only then stores the audited manual override. `Contact Role`, `Role`, `Job Role`, `Job Title`,
and `Position` map to the canonical contact title. If an edited field has no source column, Faro
adds a canonical mapped column before writing it. Formula-like values are escaped. A later poll
still reconciles source identity and organization membership while reapplying the saved manual
fields. Consent remains a separate, explicit review action.

Any accessible spreadsheet and tab can be inspected, but canonical contact workflows still need a
usable name plus an email or external ID. Rows without that minimum identity are visibly marked as
needing review and skipped; they are not silently coerced into contacts. For Excel, first
upload/convert the workbook to Google Sheets; direct `.xlsx` ingestion is not implemented.

## Credentials required

Real Google access needs OAuth client credentials, a matching redirect URI, and a 32-byte token
encryption key. Faro requests `https://www.googleapis.com/auth/spreadsheets` because explicit
contact saves can update their source cells; polling itself remains read-only.
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
5. Create a campaign workspace yourself, choose its Sheet source, and open it; import does not
   invent a campaign.
6. Add source-eligible contacts inside the campaign. Faro immediately attempts to optimize and
   write both dates; use Contacts, the campaign, or Outreach to replace them manually.
7. Open **Contacts → Recently imported** and review each imported contact's outreach basis.
8. Confirm that each contact now shows a future initial-outreach, follow-up, or review date.
9. Open the campaign to queue an eligible assigned contact for Bob. Bob retrieves the governed
   request from Faro MCP.
10. Refresh from the dashboard, reconnect OAuth, or call the Sheet and schedule cron endpoints with
    `FARO_SYNC_CRON_SECRET`.
11. If refresh fails, inspect the connection error; Faro continues showing the last successful
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

Run the web app and `pnpm worker` in separate processes. The worker immediately refreshes Sheets
and missing outreach schedules, then polls both protected endpoints every 30 seconds. Faro enforces
a 15-second minimum and prevents overlapping polls. Each read or sync is recorded under **Google
Sheet read and sync audit** with its actor and trigger. This is near-real-time, not instantaneous.
A later public deployment may replace polling with Google Drive change notifications after adding
the required Drive metadata scope, HTTPS webhook verification, channel renewal, and change-token
persistence.

The Sheet tab shows the newest 10 automatic poll attempts for that specific connection. This
operational log is intentionally bounded; the separate read/sync security audit remains durable and
workspace-scoped.

Write-back runs after an authenticated user explicitly saves an imported contact or schedule, and
when the worker assigns or rolls forward an optimizer schedule. It is limited to that contact's
stored source row and mapped fields, records a separate audit event, and escapes edited text
beginning with `=`, `+`, `-`, or `@` to prevent spreadsheet formula execution. Existing read-only
connections require one Google reconnect before the first write.
