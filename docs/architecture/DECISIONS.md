# Architecture decisions

## ADR-001: pnpm TypeScript workspace

The repository had no prior application architecture, so Faro uses the brief's default workspace
shape. Apps deploy independently while domain packages keep data, timing, provider, and integration
boundaries testable without Next.js.

## ADR-002: PostgreSQL is canonical; demo data is explicit

Prisma/PostgreSQL owns connected-workspace operational records across dashboard, contacts,
organizations, campaigns, follow-ups, settings, notifications, Sheets, Gmail history, and Bob
request routes. A read-only fictional `demoWorkspace` remains available only as an explicitly
labeled OAuth-failure product tour; it is never presented as persisted or live integration data.
`FARO_DATA_SOURCE` selects the repository mode but never bypasses session authorization.

## ADR-003: deterministic timing before explanation

The outreach optimizer accepts an explicit reference time and evidence set, applies hard safety
stops and quiet hours, scores windows, and returns a fingerprint/version. IBM Bob may explain this
result but cannot replace it with an opaque send-time guess.

## ADR-004: Governed, MCP-first IBM Bob workflow

Faro does not infer a Bob HTTP endpoint or use a generic AI SDK. It creates pending requests and
exposes narrowly scoped MCP tools as the default integration. An unavailable adapter makes that
state explicit, while an opt-in local Bob Shell runner can complete the same request when the real
IBM tool and an Inference key are configured. Both paths use the shared contracts, output
validation, provenance, workspace scope, and audit lifecycle. No provider fallback is permitted.

## ADR-005: truthful development adapters

Sheets fixtures, notification previews, and in-memory MCP stores enable end-to-end development.
Their result types use `DEVELOPMENT_FIXTURE`, `PREVIEWED`, or `Demo draft`, never production-success
language. Credentials-required features remain disabled in the UI.

## ADR-006: human approval is separate from generation and delivery

IBM Bob may propose draft language, but it cannot approve or send external outreach. Generation,
editing, approval, and delivery are distinct states so consent and provenance remain visible. The
current product flow ends at approval unless a separately configured, audited external-delivery
workflow is added. Internal follow-up reminders are a separate notification domain.

## ADR-007: follow-up dates and required internal SMS

Every follow-up stores a required `initialAt` and `dueAt`, with a database constraint that prevents
the initial instant from falling after the due instant. Once an assignee verifies and consents to a
mobile number, every due follow-up enters the SMS reminder path regardless of priority. The
workspace still enforces lead time and quiet hours, and a deduplication key covers the follow-up,
SMS channel, and due instant. Missing recipient setup creates a visible cancelled audit row instead
of claiming that an SMS was sent.

## ADR-008: required future contact actions

Every contact persists a non-null `nextActionAt` and `nextActionType`. The deterministic scheduler
uses consent, suppression, interaction history, timezone, quiet hours, campaign state, and active
deadlines. Prior outbound activity yields a follow-up; otherwise an eligible contact receives an
initial outreach. Ineligible contacts receive a dated consent review, not an outreach instruction.
Past action times and expired campaign deadlines are recalculated from an explicit current clock.
Connected reads and the notification scheduler self-heal stale values, and lifecycle mutations
recalculate affected contacts with a workspace-scoped audit event.
