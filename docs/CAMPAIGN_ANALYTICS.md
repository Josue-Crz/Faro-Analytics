# Campaign associations and analytics

Connected campaigns are user-created PostgreSQL records. Google Sheet import never creates a
campaign or silently assigns an imported contact to one.

## Workflow

1. Create a draft campaign under **Campaigns**.
2. Select an existing campaign and explicitly associate imported contacts.
3. Assign any pending imported follow-up dates from **Follow-ups**.
4. Open **Analytics** and select the campaign.

The campaign list refreshes immediately after creation and shows its current contact and follow-up
counts.

The association control is a bounded searchable checklist. **Select all shown** selects every
currently filtered, unassigned contact; **Clear** removes the pending selection. Contacts already in
the campaign remain visibly checked and cannot be duplicated.

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
