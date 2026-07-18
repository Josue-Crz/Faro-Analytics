# Faro implementation plan

## Repository assessment

The repository began as a minimal shell: one MIT license, an empty README, and no application,
package manifest, tests, database, CI, or established conventions. The brief's default architecture
therefore applies. A local ignored `config.json` is intentionally excluded: it is not an IBM Bob
integration and must never become an application dependency or committed credential.

## Architecture decisions

- **Workspace:** pnpm and TypeScript, with `apps/web`, `apps/worker`, and focused packages.
- **Web:** Next.js App Router with Carbon React, Carbon icons, Carbon Charts, IBM Plex, and
  Faro-specific semantic tokens.
- **Data:** PostgreSQL is canonical through Prisma. A clearly labeled, read-only demo repository
  makes the product tour usable before credentials or services are configured.
- **Tenancy:** every tenant-owned record carries `workspaceId`; application and MCP service methods
  require an authorized workspace scope rather than trusting client-supplied IDs.
- **IBM Bob:** contracts, versioned prompts, validated outputs, and a request lifecycle are isolated
  in `packages/ibm-bob`. Without a verified Bob runtime, requests remain `AWAITING_BOB` and Bob
  exchanges governed context through the Faro MCP server. There is no fallback AI provider.
- **Timing:** a versioned deterministic optimizer produces reproducible windows, reason codes,
  confidence, data-sufficiency labels, and hard suppression/quiet-hour guards.
- **Sheets:** a shared typed client and mapping engine power preview and MCP tools. An allowlisted
  Google tester flow encrypts tokens, reads an explicit spreadsheet/range, and transactionally
  imports recognized sponsor/contact fields into PostgreSQL. Sheet write-back remains disabled.
- **Notifications:** provider contracts separate internal reminders from external outreach. The
  default preview adapter records truthful development-only deliveries.
- **Jobs:** an explicitly labeled in-memory repository powers the development worker. PostgreSQL
  and Redis job adapters are future production work; neither delivery nor persistence is claimed.

## Milestones

1. Establish repository contracts, packages, database schema, seed data, and CI-quality scripts.
2. Deliver the seeded Carbon dashboard and complete follow-up-to-draft-review workflow.
3. Add contacts, organizations, campaigns, analytics, Sheets preview, and integration status views.
4. Implement and test the optimizer, Bob lifecycle, governed MCP tools, mapping, deduplication,
   notification scheduling, workspace isolation, and audit events.
5. Apply migrations, seed PostgreSQL, capture real screenshots, run all quality gates, and reconcile
   documentation claims with verified behavior.

## Risks and assumptions

- IBM Bob has no repository-provided verified network SDK or endpoint, so only the MCP workflow is
  enabled. The UI must say `Awaiting IBM Bob`, never simulate generated output.
- Google OAuth, email, push, and SMS require credentials/providers and remain accurate disabled or
  development-preview states.
- The demo workspace is fictional and intentionally separate from the PostgreSQL repository mode.
- Production authentication is represented by explicit membership/role boundaries; the local demo
  session is not a production identity provider.

## Verification commands

```bash
pnpm install
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm check:ai-boundary
docker compose up -d postgres redis
pnpm db:generate
pnpm db:deploy
pnpm db:seed
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```
