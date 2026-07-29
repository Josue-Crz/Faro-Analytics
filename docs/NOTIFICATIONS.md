# Notifications and SMS follow-up alerts

Internal reminders and external contact outreach are separate domains. Faro notifications target
the signed-in workspace user assigned to a follow-up; they never send a reminder to the external
contact.

## User flow

1. The user opens **Settings → Notifications**.
2. In-app reminders can be enabled immediately.
3. SMS remains disabled until Twilio Messaging and Twilio Verify are configured.
4. The user enters an E.164 mobile number and completes the Twilio Verify code challenge.
5. A successful verification records the number, verification time, explicit consent time, and SMS
   preference. Faro does not store the verification code.
6. The user chooses the lead time, quiet hours, and whether only high-priority work should alert.

The header bell lists accepted in-app, SMS, and preview notification records. Users can mark one
notification or all notifications read. Reads and preference changes are workspace-scoped and
audited.

## Scheduling and delivery

`apps/worker` polls `POST /api/cron/notifications` using `FARO_NOTIFICATION_CRON_SECRET`. The route:

- scans open follow-ups due within the next 24 hours;
- applies the assigned user's lead time, priority preference, timezone, and quiet hours;
- clamps an overdue automatic reminder to the current scheduler instant rather than persisting a
  newly scheduled timestamp from yesterday or earlier today;
- creates a unique notification for each follow-up, channel, and due instant;
- records in-app reminders immediately;
- records email as a truthful development preview;
- schedules SMS only for an explicitly opted-in, verified internal user;
- claims each scheduled SMS before calling Twilio so concurrent workers cannot both send it;
- retries only definitive `429` or `5xx` provider rejections, with exponential backoff;
- does not automatically retry an ambiguous network failure or malformed success response because
  the provider might already have accepted the SMS.

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

## Safety and compliance

- SMS phone numbers must use E.164 format.
- Verification and code-check endpoints are rate-limited per authenticated user.
- Phone ownership is proven through Twilio Verify before SMS can be enabled.
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
