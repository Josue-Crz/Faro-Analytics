# Hackathon story and real-world applications

## Why Faro was built

Faro was created as a hackathon project around a common operational problem: outreach teams often
have useful relationship data, but it is fragmented across spreadsheets, inboxes, campaign notes,
and individual memory. The hard part is not producing more text. It is deciding whom to contact,
when to follow up, which facts are safe to use, and how to keep a person accountable for the final
message.

The hackathon build turns that problem into one reviewable workflow:

1. Import or preview governed contact data from Google Sheets.
2. Combine campaign context, consent state, and bounded interaction history.
3. Calculate an explainable outreach window with deterministic rules.
4. Create a workspace-scoped IBM Bob request with a versioned prompt and approved source IDs.
5. Let IBM Bob produce a structured draft through Faro MCP or the opt-in local Bob Shell adapter.
6. Validate the result, expose its provenance and risk flags, and require human review.
7. Track follow-up and response outcomes without claiming that Faro sent a message.

This division of labor is intentional. Faro owns authorization, consent, data minimization, timing,
validation, and auditability. IBM Bob handles the language task inside that boundary. A human owns
approval and external delivery.

## How the hackathon project was created

The repository began as a minimal shell and was developed as a strict TypeScript monorepo. The
hackathon implementation was organized around a few demonstrable vertical slices rather than a
single unconstrained AI prompt:

- a Carbon-based Next.js interface for dashboards, contacts, campaigns, follow-ups, and analytics;
- a PostgreSQL/Prisma domain model with workspace isolation and fictional seed data;
- a deterministic optimizer for quiet hours, time zones, suppression, and follow-up timing;
- an IBM Bob-only package containing versioned prompts, contracts, output validation, and request
  state transitions;
- a scoped Faro MCP server that gives Bob only the approved records needed for one task;
- Google Sheets mapping and preview primitives with validation, deduplication, and formula safety;
- explicit demo, preview, pending, completed, and failed states so the demo never implies an
  integration succeeded when it did not.

The result is useful as both a product prototype and a reference architecture for governed AI
workflows. The credential-free demo shows the product experience; database mode demonstrates the
shared request lifecycle; the local Bob Shell adapter can complete a real Bob request when it is
installed and configured; and MCP remains the portable, least-privilege integration path.

## Real-world applications

### Hackathon and conference sponsorship

Organizers can import a sponsor pipeline, identify missing decision-makers, prioritize overdue
follow-ups, and ask Bob for a draft grounded in the event date, sponsorship package, prior contact,
and approved campaign facts. Faro remains the system of review and never auto-sends the pitch.

### Nonprofit fundraising

Development teams can coordinate donor or corporate-partner outreach while respecting suppression,
tracking relationship history, and separating an AI suggestion from an approved communication.
Campaign analytics can compare response rates and expected value without letting the model invent
financial or program claims.

### University and community partnerships

Program teams can manage employer, mentor, speaker, venue, and community-organization relationships.
The same workflow helps a team remember commitments and prepare a context-aware follow-up while
keeping student or participant data outside the prompt unless it is explicitly approved.

### Sales and business development

Faro can act as a lightweight, governed engagement layer over a contact list: deterministic next
actions, explainable timing, draft assistance, and human approval. A production deployment would
still need production authentication, retention policies, provider-specific delivery controls, and
the organization's legal basis for outreach.

### Customer success and account management

Teams can use response history and follow-up queues to prepare renewal, onboarding, or check-in
messages. The model drafts language; Faro preserves source provenance and prevents unrelated account
data from crossing workspace boundaries.

## What makes the project hackathon-ready

- **Fast to evaluate:** `FARO_DATA_SOURCE=demo` provides a fictional, credential-free product tour.
- **Real integration path:** database mode plus Faro MCP demonstrates scoped IBM Bob retrieval and
  validated writes; Bob Shell provides optional local automation.
- **Visible responsible-AI controls:** provenance, consent gates, source allowlists, risk flags,
  output schemas, audit events, and human approval are part of the user flow.
- **Measurable outcomes:** response rate, positive-response rate, follow-up health, pipeline value,
  and timing performance connect the AI feature to operational results.
- **Truthful limitations:** live providers, production authentication, and external delivery are
  labeled as configured, preview-only, or planned instead of being simulated.

## Submission image assets

Use the checked-in, upload-ready assets for project listings:

- [Faro project logo](assets/faro-project-logo.png) — 100 × 100 PNG and under 5 MB.
- [Faro dashboard background](assets/faro-dashboard-background.png) — wide PNG and under 5 MB.

The logo is rasterized from the canonical Faro lighthouse mark. The background is promotional
project-cover artwork generated from the real seeded dashboard screenshot and is not a replacement
for product evidence. When a submission asks for screenshots, use
[the captured dashboard](screenshots/dashboard.png) or the other Playwright captures instead. Full
dimensions, file sizes, provenance, and validation commands are documented in
[Project image assets](PROJECT_ASSETS.md).

## Suggested demo narrative

1. Open the seeded dashboard and explain the fragmented-outreach problem.
2. Preview a Sheet import and show invalid-row and duplicate handling.
3. Open a follow-up to show the recommended time, reason codes, and consent state.
4. Create an IBM Bob draft request and show the bounded context and prompt version.
5. If Bob Shell or MCP is configured, complete the request; otherwise show the truthful
   **Awaiting IBM Bob** state.
6. Review the draft's sources, confidence, and risk flags, edit it, and approve it.
7. Return to analytics to show how response and pipeline outcomes close the loop.

For implementation details, see the [IBM Bob workflow](IBM_BOB_WORKFLOW.md),
[AI boundary](AI_BOUNDARY.md), and [architecture decisions](architecture/DECISIONS.md).
