# Campaign associations and analytics

Connected campaigns are user-created PostgreSQL records. Google Sheet import never creates a
campaign or silently assigns an imported contact to one.

## Workflow

1. Create a draft campaign workspace under **Campaigns** and choose its polled data source.
2. Open the campaign workspace. Opening it does not silently change the user's saved app scope.
3. Choose **Focus entire app here** when the user wants Dashboard, Contacts, Organizations,
   Outreach, Follow-ups, Analytics, notifications, and Google Sheet source views to stay assigned
   to that campaign.
4. Use **Return to main workspace** in the persistent context bar to explicitly restore the full
   workspace view.
5. Add eligible contacts from the associated Sheet plus manually managed workspace records.
6. Assign any source-eligible pending imported follow-up dates from **Follow-ups**.
7. Open **Analytics** to inspect the focused campaign.

Creation immediately opens the new campaign. The campaign index shows current contact and follow-up
counts plus its associated Faro database or Google Sheet source.

Inside a campaign, the association control is a bounded searchable checklist with a
company-category filter. **Select shown** selects every currently filtered, unassigned contact;
**Clear** removes the pending selection. Contacts already in the campaign are shown in a separate
expandable list and cannot be duplicated.

The campaign workspace also exposes audited lifecycle controls. Users can edit the campaign name,
objective, type, and an optional inclusive start/end date range. Both dates must be supplied
together, the end cannot precede the start, and the selected date boundaries are stored as UTC
instants. Completing a campaign preserves its history but cancels open or snoozed follow-ups,
scheduled reminders, unprocessed IBM Bob requests, and pending-review drafts. The completed
workspace remains readable while new operational actions are disabled.

Deleting a campaign is a recoverable soft deletion from the active product view. Faro marks it
archived, cancels the same pending work, preserves historical records and audit evidence, and clears
that campaign from every member's saved focus so no user remains scoped to a removed workspace.
Campaign update, completion, and deletion routes all verify the authenticated workspace and reject
mutations against another actively focused campaign.

Each campaign can associate one `SheetConnection`. When one is selected, Faro accepts contacts
imported from that exact source and manually managed records; contacts from another Google Sheet
are rejected server-side. A campaign with no external source can use the full workspace database.
Changing a source preserves existing campaign history but constrains new candidates. Campaign
creation, contact assignment, and source changes remain workspace-scoped and audited.

Campaign focus is stored on `Membership.focusedCampaignId`, making it independent for every user in
the workspace and durable across routes and sessions. The selected campaign is validated against
the authenticated workspace before it is persisted. Focus changes are audited. Campaign-scoped
queries retain `workspaceId` in every nested filter, and a failed focus lookup does not fall back to
showing all workspace data.

The persistent context bar shows the authenticated workspace, saved campaign focus, associated
polled source, and whether worker polling is configured. “Automatic polling off” is a configuration
state, not a claim that a provider was contacted. Visiting `/campaigns/:id` never changes focus by
itself; switching requires the explicit campaign button. While focused, importing a new Sheet
associates that source with the focused campaign and records an audit event.

The dashboard prioritizes immediate work ahead of historical performance: it identifies the next
contact, campaign, company, category, due time, and recommended action. Contact, organization,
campaign-audience, follow-up, and outreach searches expose the same normalized company-category
filter. Each successful source poll recalculates the canonical category from explicit source data,
imported third-party taxonomy or description, bounded company-name/domain rules, and verified
Wikidata industry data. When none of those yield a specific result, Faro assigns a low-confidence
best-effort category from the organization's type or domain. Classification source and confidence
remain visible, while every company stays queryable in one of the canonical categories.
Recently imported contacts and their consent review actions live under **Contacts**, not on the
dashboard.

Contacts can be edited manually from the connected Contacts directory. The mutation is
workspace-scoped, respects the user's focused-campaign boundary, rejects duplicate workspace email
addresses, and records only changed field names in the audit event. The Outreach contact details
also expose a focused person's-role editor. For an imported contact, both editors first write the
changed mapped values to the exact Google Sheet source row, then store the Faro manual override;
database-only contacts remain local. Manual values are reapplied after imported values on later
Sheet polls, so correcting a source-backed contact does not require switching in and out of the
source.

The Outreach Center's Email tracking panel includes an interactive company-outreach calendar.
It combines tracked outbound/reply timestamps for contacts with companies, the focused campaign
deadline when present, workspace timezone and quiet hours, and Faro's deterministic timing
optimizer. The best 30-minute window and three alternatives spaced across separate days are labeled
in the calendar. The planning boundary advances every 30 seconds while the page remains open, and
every recommended instant must be strictly later than that boundary; an expired time cannot remain
eligible as a Best or Alternative window. A five-level blue opportunity signature shades weaker
eligible days dark blue and progressively stronger days brighter blue. Selecting any day exposes
its combined 1–100 day score, date-specific reasons, send-window recommendation, tracked activity,
and quarter-boundary context.
January 1, April 1, July 1, and October 1 mark the beginning of each quarter, while the final day of
March, June, September, and December marks its end.

Below the calendar, Faro reports the reasons, confidence, data sufficiency, tracked outcome count,
and optimizer version behind the recommendation. Sparse or absent reply history uses the
documented conservative weekday business-hours fallback. The calendar-day score combines that
weekday baseline, same-weekday tracked company reply outcomes, optimizer-selected dates, and a
bounded calendar-budget signal: 7–21 days before a standard quarter and the first 10 days of a
quarter receive a planning boost. This is not evidence of a specific company's fiscal calendar or
available budget. This aggregate planning view does not grant consent or send a message;
contact-level consent, suppression, and human-review controls still apply.

Analytics includes an interactive **Campaign pulse** visualization built with the same Carbon
tokens, typography, focus states, and reduced-motion behavior as the rest of Faro. Users choose a
plain-language question—replies, positive replies, or follow-ups—and select a horizontal campaign
bar to update the supporting metrics and interpretation. Every bar exposes its value as text and an
accessible button, so the comparison does not depend on color or pointer interaction.

Analytics also includes an interactive **Company categories** column graph. It uses the
organization's canonical category to group companies, and can compare either company count or
total known-contact reach. Selecting a category shows the individual companies behind its total.

The **Organizations** page supports both a detailed list and a **Group by category** view. Search,
category, stage, and type filters are applied before grouping, so the category totals and company
cards always reflect the user's current filter selection. Connected workspaces offer the same
list/group toggle with real organization and affiliated-contact counts.

## Calculated metrics

Campaign analytics are workspace-scoped and calculated from database relations:

- audience size from `CampaignContact`;
- sent/delivered outreach and response rate from campaign `Interaction` records;
- positive response rate from classified `Response` records;
- open work from `FollowUpTask`;
- awaiting and review-ready draft counts from `BobGenerationRequest` and `BobDraft`;
- average response time from campaign responses.

An empty campaign truthfully reports zero activity. No fictional dashboard values are blended into
a connected workspace. Contact assignment and campaign creation are audited, and all mutations
verify the authenticated user's workspace scope server-side.
