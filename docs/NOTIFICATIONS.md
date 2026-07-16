# Notifications

Internal reminders and external outreach are separate domains. `packages/notifications` supports
in-app, email, web-push, and optional SMS channels through an `InternalNotificationProvider`.

The default `PreviewNotificationAdapter` records `PREVIEWED` and explicitly states that no email,
push, or SMS provider was called. It supports testing payloads, quiet hours, timezone scheduling,
deduplication, retry/error behavior, and audit events without fabricating delivery.

Production adapters must:

- support only declared channels;
- return a provider message ID only after the provider accepts the request;
- distinguish accepted, delivered (when verified), bounced, and failed states;
- respect user/workspace quiet hours and notification preferences;
- use a workspace-scoped deduplication key and retry-safe idempotency key;
- redact contact/message content from logs;
- validate webhook signatures;
- never turn an internal reminder into an external contact message.

SMS is optional and unconfigured. No vendor is hard-coded. External outreach delivery remains a
separate, human-approved workflow and is not implemented by the preview adapter.
