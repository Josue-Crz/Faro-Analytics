# Tester deployment and integration setup

Faro has three intentionally separate experiences:

- **Unconnected:** a clean shell with empty contacts, organizations, campaigns, follow-ups, and
  analytics.
- **OAuth failure fallback:** the fictional Jordan Lee / Beacon Lab workspace, local Sheets fixture,
  `Demo draft` provenance, and notification previews.
- **Connected:** a Google-authenticated tester gets an isolated empty PostgreSQL workspace and may
  read an explicitly supplied spreadsheet, then write explicit contact edits to mapped source
  cells.

Faro never substitutes Jordan data for a failed connected request. A connected Bob request without
persisted workspace context is rejected; an accepted request without Bob remains `AWAITING_BOB`.

The same identity boundary applies to Settings:

- before authentication, Settings shows setup guidance only;
- after successful OAuth, Workspace, IBM Bob, and Notifications read the authenticated user's
  workspace-scoped database records and configured adapter state;
- only an explicit OAuth failure enables Jordan's fictional Settings preview.

Connected Settings never displays seeded member counts, fictional MCP timestamps, demo generation
requests, or fictional notification delivery rows.

## Generate application secrets

Generate these locally, then put deployment values in the hosting platform's secret manager:

```bash
openssl rand -base64 48 # AUTH_SECRET
openssl rand -hex 32    # TOKEN_ENCRYPTION_KEY
openssl rand -hex 32    # FARO_MCP_TOKEN
openssl rand -hex 32    # FARO_SYNC_CRON_SECRET
```

Do not commit the output. `TOKEN_ENCRYPTION_KEY` must decode to exactly 32 bytes. Rotating it
requires re-encrypting or revoking existing Google credentials.

## Configure Google Cloud

1. Create a project in <https://console.cloud.google.com/projectcreate>.
2. Enable the Sheets API in <https://console.cloud.google.com/apis/library/sheets.googleapis.com>.
3. Configure branding, audience, and tester accounts under
   <https://console.cloud.google.com/auth/overview>.
4. Create a **Web application** OAuth client under
   <https://console.cloud.google.com/auth/clients>.
5. Add the exact callback URI. Locally it is
   `http://localhost:3000/api/integrations/google-sheets/callback`; deployment must use
   `https://YOUR_DOMAIN/api/integrations/google-sheets/callback`.
6. Copy the client ID and client secret into the deployment secret manager.

Faro requests `openid`, `email`, `profile`, and
`https://www.googleapis.com/auth/spreadsheets`. The spreadsheet scope is sensitive; keep the OAuth
app in testing with explicitly listed testers until verification is appropriate. Gmail remains
read-only.

```dotenv
GOOGLE_CLIENT_ID="...apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="..."
GOOGLE_REDIRECT_URI="https://YOUR_DOMAIN/api/integrations/google-sheets/callback"
FARO_TESTER_EMAILS="tester-one@example.com,tester-two@example.com"
```

After login, paste a spreadsheet URL/ID, exact worksheet tab, and a bounded A1 range on
`/integrations/google-sheets`. Read and inspect the preview, then explicitly import it. Faro imports
at most 5,000 rows into the tester's isolated workspace. Saving an imported contact writes only its
mapped edits to its stored source row; polling does not write.

For `SF Hacks 2027 Internal Sponsor Outreach Database - Feburary Event`, use:

```text
Spreadsheet ID: 1rcowrjzuWPOnUAudCxXg0oNqOLffdjc7JAkvLp3UmWI
Worksheet tab: 2027 Sponsor Outreach
Range: A1:AF1000
```

To refresh configured connections from a deployment scheduler, set `FARO_SYNC_CRON_SECRET` and
send an authenticated `POST /api/cron/google-sheets` with
`Authorization: Bearer <FARO_SYNC_CRON_SECRET>`. A failed refresh preserves the last successful
database snapshot.

Reconnecting Google automatically attempts to refresh saved Sheet connections. The dashboard also
provides a manual refresh action. Import creates contacts and organizations only. Campaigns remain
user-created, and imported follow-up dates remain pending until the user assigns them to a campaign.

For near-real-time polling, set `FARO_WEB_URL`, `FARO_SYNC_CRON_SECRET`, and
`FARO_SHEET_POLL_INTERVAL_MS`, then run `pnpm worker` alongside the web process. Use 30 seconds for
tester deployments; the worker enforces a 15-second minimum, avoids overlapping requests, and every
poll creates a timestamped actor/trigger audit entry.

## Configure PostgreSQL

Local Docker uses the `DATABASE_URL` from the repository-root `.env` (start from `.env.example`).
The Prisma configuration loads that root file even though pnpm executes database commands from
`packages/database`. For deployment, obtain a PostgreSQL connection
URL from the selected host, require TLS according to that provider, and run:

```bash
pnpm db:generate
pnpm db:deploy
```

For a complete local startup sequence and `DATABASE_URL` troubleshooting, see **Local quick start**
in the repository `README.md`. In short, start Compose, wait for healthy services, deploy migrations,
and then start `pnpm dev`; run all commands from the repository root.

Use `FARO_DATA_SOURCE=database` and never enable
`FARO_ENABLE_UNAUTHENTICATED_DEMO_DB_ACCESS` in a deployment.

## Configure IBM Bob

Choose one of two IBM Bob paths. For MCP-first operation, install/sign in to IBM Bob, open its MCP
settings, and register the Faro servers using the ignored `.bob/mcp.json` copied from
`.bob/mcp.example.json`. Supply `DATABASE_URL`, one `FARO_WORKSPACE_ID`, and a random
`FARO_MCP_TOKEN` through the process environment. No Bob model key is consumed by this path.

After the first import, the connected dashboard displays the tester workspace ID. Put that exact
value in `.bob/mcp.json` as `FARO_WORKSPACE_ID`, restart Faro MCP, and start a new Bob task. Ask Bob
to list awaiting generation requests, retrieve the approved request context, draft it, and save it
for human review. The web app does not consume a Bob model API key and does not send email.

The included server uses local stdio. A shared deployment needs an authenticated, encrypted,
workspace-bound Streamable HTTP transport before it can be called multi-tenant. Until that is
implemented and verified, leave `BOB_RUNTIME_ADAPTER=unavailable` and use Bob locally through MCP.

For a single-user or controlled tester environment, the opt-in local Bob Shell adapter can complete
requests from the web process. Install and verify Bob Shell, store an active IBM Bob Inference key
as `BOBSHELL_API_KEY`, set `BOB_RUNTIME_ADAPTER=bob-shell`, and restart the application. This runs a
local child process and is not a general multi-tenant network integration. Verify one real request
and its `IBM_BOB` provenance before describing the runtime as connected. Never expose the key to the
browser or commit it.

Configuration is not entitlement verification. Before a demo, confirm the IBM Bob plan is active
and run one minimal `bob` request from the same environment as the web process. A suspended plan can
surface in Faro as `BOB_SHELL_FAILED` because the adapter records a safe code instead of returning
provider account details to the browser. Reactivate the plan, or replace an invalid/expired key and
restart the app. Then create a new draft request; failed requests are terminal. See
[local Bob Shell troubleshooting](IBM_BOB_WORKFLOW.md#troubleshoot-local-bob-shell).

## Preflight

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm check:ai-boundary
pnpm build
```

Check `/api/health`; `configured-unverified` means variables exist, not that Google or Bob accepted
them. Complete an actual tester login and spreadsheet read before calling Google verified. Complete
one validated draft with `IBM_BOB` provenance before calling the Bob runtime verified.
