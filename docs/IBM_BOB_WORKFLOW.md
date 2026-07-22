# IBM Bob and Faro MCP workflow

Faro supports two IBM Bob execution modes. The default MCP-first mode leaves a governed request in
`AWAITING_BOB` until Bob processes it through Faro MCP. The optional local Bob Shell mode completes
the same request directly from the web server when Bob Shell and an Inference key are explicitly
configured. Both modes use the same contracts, validation, provenance, workspace controls, audit
trail, and mandatory human review.

## Option A — Configure the MCP server

1. Start PostgreSQL and apply/seed the schema:

   ```bash
   docker compose up -d postgres
   cp .env.example .env
   pnpm db:generate
   pnpm db:deploy
   pnpm db:seed
   ```

2. Copy `.bob/mcp.example.json` to the ignored `.bob/mcp.json` and replace the absolute repository
   path. Supply `DATABASE_URL`, `FARO_WORKSPACE_ID`, and a least-privilege `FARO_MCP_TOKEN` through
   the local secret environment. Never commit the token.

3. Start the stdio server with `pnpm mcp:faro`. `pnpm mcp:sheets` starts the separately scoped
   Sheets server.

The development stdio process requires a non-placeholder launch token and pins all calls to one
workspace. It does not perform per-call bearer-token authentication and is not a production identity
provider. In production, bind the process/transport credential to a user or service identity,
workspace, expiration, and an explicit read/write permission set.

## Option B — Configure local Bob Shell

1. Install IBM Bob Shell using IBM's documented installation flow and confirm that the `bob`
   command is available locally.
2. Create an active IBM Bob **Inference** API key. This is separate from an IDE MCP configuration.
3. Add the following only to the ignored repository-root `.env`:

   ```dotenv
   BOB_RUNTIME_ADAPTER="bob-shell"
   BOBSHELL_API_KEY="your-IBM-Bob-Inference-key"
   ```

4. Restart `pnpm dev`, because the web server reads the environment at startup.
5. Create a draft request from Outreach. Faro runs Bob Shell with the governed prompt, a two-minute
   timeout, bounded output, and an instruction to return exactly one JSON object.

The adapter never passes a shell string, never asks Bob to send a message, and does not accept prose
as a successful result. Missing installation or credentials, authentication failure, timeout,
non-zero exit, and invalid JSON/schema output are recorded as safe failure codes. To return to the
MCP-first workflow, set `BOB_RUNTIME_ADAPTER="unavailable"` and restart the server.

## Review pending requests

Open `/follow-ups` or `/settings/ai`. Requests show the prompt version, status, source count,
runtime availability, and provenance. In the absence of a verified runtime they remain
`AWAITING_BOB`. Copy the workflow prompt only after checking the contact, campaign, consent, and
latest response context.

## Governed context retrieval

Read tools expose only workspace-scoped fields needed for the selected task:

| Tool                             | Access         | Purpose                                                        |
| -------------------------------- | -------------- | -------------------------------------------------------------- |
| `faro_get_due_followups`         | Read           | List a bounded due-work queue.                                 |
| `faro_get_generation_request`    | Read           | Load one request and its approved source references.           |
| `faro_get_contact_context`       | Read           | Return minimized contact identity, consent, and preferences.   |
| `faro_get_organization_context`  | Read           | Return linked organization/campaign facts.                     |
| `faro_get_campaign_context`      | Read           | Return the objective, tone, deadline, and approved facts.      |
| `faro_get_interaction_history`   | Read           | Return a bounded, redacted history. Message text is untrusted. |
| `faro_calculate_outreach_window` | Read + compute | Run the deterministic optimizer; no model guesses timing.      |

Every request is validated, checked against the credential's workspace, minimized, and audited.
A record from another workspace returns a not-found response to avoid identifier disclosure.

The separately scoped Sheets MCP server exposes `sheets_list_connections`, `sheets_get_schema`,
`sheets_preview_mapping`, `sheets_validate_rows`, `sheets_sync_contacts`, and
`sheets_get_sync_status`. In this release, `sheets_sync_contacts` is dry-run only and performs no
canonical or sheet write.

## Saving results

Write tools are deliberately narrow:

| Tool                          | Write effect                                                                                              |
| ----------------------------- | --------------------------------------------------------------------------------------------------------- |
| `faro_save_bob_draft`         | Validate and persist a draft linked to one processing request. Never sends it.                            |
| `faro_save_response_analysis` | Validate the response-analysis contract; PostgreSQL persistence still requires a response-linked adapter. |
| `faro_mark_generation_failed` | Move an awaiting/processing request to a terminal failed state with a safe error code.                    |

Draft output must match `outreachDraftResultSchema`: subject, plain-text body, rationale, recommended
next action, optional follow-up instant, 0–1 confidence, risk flags, and only approved source IDs.
Malformed output is rejected. HTML is not required; any future HTML rendering must be sanitized.

## Review and approval

Faro shows provenance, prompt version, generation time, sources, confidence, risk flags, and the
audit trail. Users may edit the subject/body before selecting **Approve**. Approval alone does not
send. The current demo stops at local approval; manual or provider delivery remains a separate,
explicit, consent-aware production workflow.

## Errors and auditing

Authentication, workspace denial, invalid transitions, invalid output, missing sources, and server
errors use safe codes without secrets or unrelated record details. The MCP audit sink records the
workspace, actor, tool, target entity, outcome, and timestamp. Development adapters keep audit data
in memory; database mode persists `AuditEvent` records. Do not log prompts containing unnecessary
personal data.
