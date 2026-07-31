# Notifications and SMS follow-up alerts

Internal reminders and external contact outreach are separate domains. Faro notifications target
the signed-in workspace user assigned to a follow-up; they never send a reminder to the external
contact.

## User flow

1. The user opens **Settings → Notifications**.
2. In-app reminders can be enabled immediately.
3. SMS remains disabled until Twilio Messaging and Twilio Verify are configured.
4. The user enters an E.164 mobile number and completes the Twilio Verify code challenge.
5. A successful verification records the number, verification time, and explicit consent time.
   Faro does not store the verification code.
6. Required SMS becomes active for every due follow-up assigned to that user. It is not a
   per-priority preference.
7. The user chooses the lead time and quiet hours. The high-priority filter affects optional
   in-app and email-preview channels only.
8. **Disable SMS reminders** records consent withdrawal and cancels messages that are still
   scheduled. Re-verification is required to activate SMS again.

The header bell lists accepted in-app, SMS, and preview notification records. Users can mark one
notification or all notifications read. Reads and preference changes are workspace-scoped and
audited.

## Scheduling and delivery

`apps/worker` polls `POST /api/cron/notifications` using `FARO_NOTIFICATION_CRON_SECRET`. The route:

- scans open follow-ups due within the next 24 hours;
- applies the assigned user's lead time, timezone, and quiet hours;
- clamps an overdue automatic reminder to the current scheduler instant rather than persisting a
  newly scheduled timestamp from yesterday or earlier today;
- creates a unique notification for each follow-up, channel, and due instant;
- records in-app reminders immediately;
- records email as a truthful development preview;
- creates an SMS record for every due follow-up;
- schedules delivery only for an explicitly consenting, verified internal user and records
  `SMS_RECIPIENT_NOT_READY` when setup is incomplete;
- includes both the initial date and follow-up date in the reminder;
- never lets the optional high-priority filter suppress a required SMS;
- claims each scheduled SMS before calling Twilio so concurrent workers cannot both send it;
- retries only definitive `429` or `5xx` provider rejections, with exponential backoff;
- does not automatically retry an ambiguous network failure or malformed success response because
  the provider might already have accepted the SMS.
- after a terminal SMS outcome is recorded for the exact due instant, recalculates any still-open
  expired task to the contact's next future optimized follow-up date.

Notification rows retain provider acceptance separately from confirmed delivery. A Twilio API
response is stored as `ACCEPTED`, not `DELIVERED`. The provider message SID is stored for later
delivery-status reconciliation. A worker interruption can leave a row in `PROCESSING`; Faro does
not automatically replay that ambiguous attempt because doing so could send the same SMS twice.

## Provider configuration

The default `PreviewNotificationAdapter` records `PREVIEWED` and explicitly states that no email,
push, or SMS provider was called. Set `NOTIFICATION_ADAPTER=twilio` only when these values are
present:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_API_KEY`
- `TWILIO_API_SECRET`
- either `TWILIO_MESSAGING_SERVICE_SID` or `TWILIO_FROM_NUMBER`
- `TWILIO_VERIFY_SERVICE_SID`
- `APP_URL`

Faro calls Twilio over HTTPS with form-encoded requests and API-key Basic authentication. The
implementation follows Twilio's
[Messaging API](https://www.twilio.com/docs/messaging/api/message-resource),
[API authentication](https://www.twilio.com/docs/usage/requests-to-twilio), and
[Verify v2](https://www.twilio.com/docs/verify/api) contracts.

## Start required follow-up SMS

Required SMS is a connected, database-backed workflow; the fictional fallback does not verify
phones or call Twilio. Complete the Google-authenticated connected-workspace setup in
[Deployment and integrations](DEPLOYMENT_INTEGRATIONS.md) first.

1. Start PostgreSQL and Redis, install dependencies, generate Prisma Client, and apply migrations.
   Set `FARO_DATA_SOURCE=database` in the ignored `.env`:

   ```bash
   corepack enable
   pnpm install
   cp .env.example .env
   docker compose up -d postgres redis
   docker compose ps
   pnpm db:generate
   pnpm db:deploy
   ```

2. In Twilio, create or select:

   - an account;
   - an API key and secret;
   - either a Messaging Service or an SMS-capable sender number;
   - a Verify Service.

3. Put the following values in the ignored `.env`. Generate the cron secret locally and do not
   commit any value:

   ```dotenv
   APP_URL="http://localhost:3000"
   FARO_WEB_URL="http://localhost:3000"
   FARO_NOTIFICATION_CRON_SECRET="<output of: openssl rand -hex 32>"
   FARO_NOTIFICATION_POLL_INTERVAL_MS="30000"
   NOTIFICATION_ADAPTER="twilio"
   TWILIO_ACCOUNT_SID="..."
   TWILIO_API_KEY="..."
   TWILIO_API_SECRET="..."
   TWILIO_MESSAGING_SERVICE_SID="..."
   TWILIO_FROM_NUMBER=""
   TWILIO_VERIFY_SERVICE_SID="..."
   ```

   Use `TWILIO_FROM_NUMBER` instead of `TWILIO_MESSAGING_SERVICE_SID` when appropriate; do not set
   both unless the deployment deliberately supports both.

4. Start the web app and worker in separate terminals:

   ```bash
   pnpm dev
   ```

   ```bash
   pnpm worker
   ```

5. Sign in, open **Settings → Notifications**, enter your own E.164 mobile number, request a
   verification code, and select **Verify and enable SMS**. Verification is the explicit consent
   step.

6. Create or import a follow-up with:

   - an initial date;
   - a follow-up date at or after the initial date;
   - an assignee whose mobile number was verified.

7. Keep the worker running. At the configured lead time, outside quiet hours, it calls the
   protected notification route and claims the SMS before contacting Twilio.

8. Confirm the result in **Settings → Notifications → Delivery audit**. `ACCEPTED` means Twilio
   accepted the request; it does not yet prove carrier delivery. `PREVIEWED` means no SMS provider
   was called.

9. For a direct scheduler smoke test, call the protected endpoint from a trusted terminal:

   ```bash
   curl -X POST \
     -H "Authorization: Bearer $FARO_NOTIFICATION_CRON_SECRET" \
     http://localhost:3000/api/cron/notifications
   ```

   Never expose the cron secret to browser code or an untrusted client.

## Follow-up date invariant

Every `FollowUpTask` has two required UTC instants:

- `initialAt`: when the follow-up need began or was first recorded;
- `dueAt`: the date and time the follow-up action is due.

The database enforces `initialAt <= dueAt`. Google Sheets recognizes `Initial Date`,
`Initial Outreach Date`, `Follow-Up Initial Date`, and `Follow-Up Start Date`. If a Sheet supplies
only a follow-up date, Faro uses the import time as the initial date, clamped to the follow-up date
for already-overdue rows. Both dates are returned by connected APIs and Faro MCP, displayed in
follow-up surfaces, and included in SMS reminders.

An active task is never silently moved before its due-instant SMS evidence exists. After the SMS is
accepted, delivered, previewed, definitively failed, or truthfully cancelled because the internal
recipient is not ready, the worker may roll the still-open task to a new future optimized date.
Historical completed or cancelled tasks keep their original dates. Contact-level scheduling is
defined in [Contact scheduling](CONTACT_SCHEDULING.md).

## Safety and compliance

- SMS phone numbers must use E.164 format.
- Verification and code-check endpoints are rate-limited per authenticated user.
- Phone ownership and explicit consent are proven through Twilio Verify before required SMS can be
  activated.
- Every SMS includes Faro's identity and `Reply STOP to unsubscribe`.
- Quiet hours are enforced using the user's IANA timezone before provider delivery.
- Deferral and delivery boundaries are clamped forward; a worker never moves a notification's
  eligible delivery time backward.
- Provider credentials remain server-side and must be stored in deployment secrets.
- Logs and audit metadata exclude phone numbers and message bodies; only the last four digits are
  recorded during verification events.
- Workspace ID is present in every tenant-owned read and mutation predicate.
- Twilio and carrier registration, consent retention, and regional messaging requirements still
  apply to the deploying organization.

Web push remains unavailable. External outreach continues to require human review and is not sent
through this reminder system.
