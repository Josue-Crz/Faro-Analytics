# Contact scheduling

Every active Faro contact has one required, workspace-scoped next action:

- `nextActionAt` is a UTC instant strictly later than the scheduling reference time.
- `nextActionType` is `INITIAL_OUTREACH`, `FOLLOW_UP`, `CONSENT_REVIEW`, or `SCHEDULE_REVIEW`.

Once a contact is assigned to a campaign, its open `FollowUpTask` is the canonical two-date
outreach schedule:

- `initialAt` is the initial contact instant.
- `dueAt` is the later follow-up instant.

The saved pair is shown in Contacts, the campaign workspace, Follow-ups, Outreach, the dashboard,
and the Outreach calendar. `Contact.nextActionAt` and `CampaignContact.nextActionAt` are projections
of the next still-relevant instant in that pair.

The action type is derived from relationship state. A contact with no recorded outbound activity
receives an initial-outreach date once consent permits outreach. Any outbound interaction or open
follow-up changes the action to a follow-up. Unknown, opted-out, or suppressed contacts receive a
future consent-review date instead of an unsafe outreach recommendation. When no safe optimizer
window exists, Faro schedules a future human schedule review.

## Calculation and reset rules

Faro uses the deterministic outreach optimizer with an explicit clock, contact timezone, workspace
quiet hours, consent state, campaign priority, recent outbound history, and active campaign
deadline. Automatic assignment runs stage one from the current worker/UI clock, then runs stage two
from the selected initial instant with that initial contact included in frequency-safety history.
This makes the follow-up respect the optimizer cooldown as well as quiet hours and deadlines. A
user can replace both dates manually; the API validates that the follow-up is future and later than
the initial contact.

An expired campaign deadline is never reused as an optimizer boundary. If `nextActionAt` is due or
past due, Faro recalculates from the current clock and persists a new future instant. This refresh
runs before connected dashboard, contact-directory, and campaign reads, and during each
notification scheduler pass. Campaign date changes, campaign completion or archival, consent
reviews, contact timing edits, Gmail interaction sync, campaign assignment, and stale Sheet
imports also trigger recalculation.

Active follow-up tasks retain their required `initialAt` history. When a follow-up reaches its due
instant, the notification worker first records the required SMS outcome for that exact due instant.
Only then may a still-open task be moved to the contact's next optimized future follow-up date.
This preserves notification evidence without leaving the operational queue overdue.

Adding eligible contacts to a campaign immediately attempts automatic pair assignment. The
secret-protected `/api/cron/outreach-schedules` pass fills missing pairs for draft and active
campaigns every time the configured worker polls. Connected views refresh every 30 seconds while
visible. These
operations schedule work only; they never send external outreach, and drafting/delivery retain
their human-review requirements.

## Import behavior

A newly imported contact starts with unknown consent, so Faro assigns a future `CONSENT_REVIEW`
action immediately. Reviewing the outreach basis recomputes the contact:

- no outbound interaction becomes `INITIAL_OUTREACH`;
- prior outbound activity or an open follow-up becomes `FOLLOW_UP`;
- an ineligible contact remains `CONSENT_REVIEW`.

Imported follow-up dates that are already past are not activated as overdue work. Faro replaces
the operational due instant with the contact's future action time, while retaining the original
imported value in source metadata for traceability and idempotency.

## Storage and audit

The database makes both contact fields non-null and indexes them by workspace and action time.
Every recalculation updates campaign-contact projections and creates a
`CONTACT_NEXT_ACTION_RECALCULATED` audit event containing the algorithm version, action type,
future instant, and reason code. All reads and writes include `workspaceId`.

Saving a pair creates `CONTACT_OUTREACH_SCHEDULE_SAVED`. For Sheet-owned contacts, Faro first
writes `Initial Contact Date` and `Follow-Up Date` to the exact stored source row using the
spreadsheet timezone and native date-time cells. Only a successful Sheet write is accepted into
Faro; database-only contacts remain local. Notification-driven roll-forward updates both stores
again, while failures are audited without inventing delivery success.
