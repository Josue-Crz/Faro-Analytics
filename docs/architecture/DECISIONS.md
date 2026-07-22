# Architecture decisions

## ADR-001: pnpm TypeScript workspace

The repository had no prior application architecture, so Faro uses the brief's default workspace
shape. Apps deploy independently while domain packages keep data, timing, provider, and integration
boundaries testable without Next.js.

## ADR-002: PostgreSQL is canonical; demo data is explicit

Prisma/PostgreSQL owns operational records. A read-only fictional `demoWorkspace` lets reviewers
run the UI without credentials. It is labeled throughout and is not presented as persisted or live
integration data. `FARO_DATA_SOURCE=database` enables the shared web/MCP Bob request repository;
database-backed repositories for the remaining UI routes are future work.

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
hackathon demo ends at approval unless a separately configured, audited delivery workflow is added.
