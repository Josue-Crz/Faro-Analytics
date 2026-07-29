# Security and privacy

Faro is production-minded scaffolding, not a completed security certification. The following
controls are implemented in domain boundaries or represented as explicit interfaces; deployment
owners must complete the credentials-required items before handling real personal data.

## Implemented boundaries

- Every tenant-owned Prisma record has a workspace relationship; repository and MCP operations
  require a `WorkspaceScope`. Cross-workspace identifiers return not found.
- Roles are ranked and enforced in service code. The browser never grants itself a workspace role.
- Zod validates Bob, Sheets, notification, MCP, and route inputs/outputs.
- Suppression/opt-out blocks optimizer and prompt creation before scoring or generation.
- Bob context is minimized; OAuth/session secrets and unrelated records are excluded.
- Notification, generation, sheet sync, and job types carry idempotency/deduplication keys.
- Sheet write-back runs only for explicit authenticated contact edits, is restricted to the stored
  connection/source row and mapped fields, neutralizes formula prefixes, and is audited.
- HTTP responses add clickjacking, MIME-sniffing, referrer, and permissions-policy headers.
- Sensitive generation/preview routes have a simple process-local development rate limiter.
- Database-mode demo routes fail closed unless the local-only
  `FARO_ENABLE_UNAUTHENTICATED_DEMO_DB_ACCESS` switch is explicitly enabled.
- Audit entities and sinks cover reads, writes, transitions, attempts, and failures.
- Soft-delete/retention fields exist where appropriate in the canonical schema.

## Deployment requirements

- Replace the demo identity with secure, HTTP-only, same-site sessions and a verified identity
  provider. Add CSRF tokens for cookie-authenticated mutations.
- Replace development MCP tokens with scoped, expiring credentials and constant-time verification.
- Encrypt Google refresh tokens with a managed key; validate OAuth state and exact redirect URI.
- Validate webhook signatures before accepting provider events.
- Replace the process-local limiter with a distributed store at the edge/API boundary.
- Sanitize any future HTML output with a maintained allowlist library and restrictive CSP.
- Put PostgreSQL/Redis on private networks, use TLS, backups, rotation, least privilege, and
  observability with personal-data redaction.
- Establish retention schedules, subject export/deletion approval, incident response, and audit-log
  retention with legal/privacy owners.

## Secret handling

`.env`, local MCP config, generic `config.json`, credentials, and tokens are ignored. `.env.example`
contains placeholders only. `pnpm check:ai-boundary`, source scans, dependency review, and a secret
scanner should run in CI. If any local credential has been shared or printed, revoke it; merely
adding it to `.gitignore` is not rotation.
