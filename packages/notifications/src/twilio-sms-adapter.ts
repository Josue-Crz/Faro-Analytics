import { z } from 'zod';

import {
  e164PhoneNumberSchema,
  internalNotificationSchema,
  type InternalNotification,
  type InternalNotificationProvider,
  type NotificationChannel,
  type NotificationDeliveryResult,
} from './contracts';

const accountSidSchema = z.string().regex(/^AC[0-9a-fA-F]{32}$/);
const apiKeySchema = z.string().regex(/^SK[0-9a-fA-F]{32}$/);
const messagingServiceSidSchema = z.string().regex(/^MG[0-9a-fA-F]{32}$/);
const verifyServiceSidSchema = z.string().regex(/^VA[0-9a-fA-F]{32}$/);

const twilioSmsConfigSchema = z
  .object({
    accountSid: accountSidSchema,
    apiKey: apiKeySchema,
    apiSecret: z.string().trim().min(1),
    appUrl: z.string().url(),
    fromNumber: e164PhoneNumberSchema.optional(),
    messagingServiceSid: messagingServiceSidSchema.optional(),
  })
  .strict()
  .refine((config) => config.fromNumber || config.messagingServiceSid, {
    message: 'A Twilio sender number or Messaging Service SID is required',
  });

const twilioVerifyConfigSchema = z
  .object({
    apiKey: apiKeySchema,
    apiSecret: z.string().trim().min(1),
    serviceSid: verifyServiceSidSchema,
  })
  .strict();

const messageResponseSchema = z.object({
  sid: z.string().regex(/^(SM|MM)[0-9a-fA-F]{32}$/),
  status: z.string(),
});

const verifyResponseSchema = z.object({
  sid: z.string().regex(/^VE[0-9a-fA-F]{32}$/),
  status: z.string(),
});

export type TwilioSmsConfig = z.input<typeof twilioSmsConfigSchema>;
export type TwilioVerifyConfig = z.input<typeof twilioVerifyConfigSchema>;

function basicAuthorization(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

async function safeJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function reminderBody(notification: InternalNotification, appUrl: string): string {
  const action = notification.actionUrl ? new URL(notification.actionUrl, appUrl).toString() : '';
  const requiredFooter = 'Reply STOP to unsubscribe.';
  const content = [
    `Faro reminder: ${notification.title}`,
    notification.bodyText,
    action,
    requiredFooter,
  ]
    .filter(Boolean)
    .join('\n');
  if (content.length <= 640) return content;

  const reserved = [action, requiredFooter].filter(Boolean).join('\n');
  const available = Math.max(0, 637 - reserved.length);
  return `${content.slice(0, available).trimEnd()}…\n${reserved}`;
}

/** Sends internal reminder SMS through a configured Twilio Messaging sender. */
export class TwilioSmsNotificationAdapter implements InternalNotificationProvider {
  readonly name = 'twilio-programmable-messaging';
  readonly supportedChannels: ReadonlySet<NotificationChannel> = new Set(['SMS']);
  private readonly config: z.output<typeof twilioSmsConfigSchema>;

  constructor(
    rawConfig: TwilioSmsConfig,
    private readonly now: () => Date = () => new Date(),
    private readonly fetcher: typeof fetch = fetch,
  ) {
    this.config = twilioSmsConfigSchema.parse(rawConfig);
  }

  async deliver(rawNotification: InternalNotification): Promise<NotificationDeliveryResult> {
    const notification = internalNotificationSchema.parse(rawNotification);
    const attemptedAt = this.now().toISOString();
    if (notification.channel !== 'SMS' || !notification.recipientPhone) {
      return {
        attemptedAt,
        detail: 'The Twilio adapter accepts verified SMS reminder payloads only.',
        errorCode: 'TWILIO_SMS_PAYLOAD_INVALID',
        provider: this.name,
        providerMessageId: null,
        status: 'FAILED',
      };
    }

    const form = new URLSearchParams({
      Body: reminderBody(notification, this.config.appUrl),
      To: notification.recipientPhone,
    });
    if (this.config.messagingServiceSid) {
      form.set('MessagingServiceSid', this.config.messagingServiceSid);
    } else {
      form.set('From', this.config.fromNumber!);
    }

    let response: Response;
    try {
      response = await this.fetcher(
        `https://api.twilio.com/2010-04-01/Accounts/${this.config.accountSid}/Messages.json`,
        {
          body: form,
          headers: {
            authorization: basicAuthorization(this.config.apiKey, this.config.apiSecret),
            'content-type': 'application/x-www-form-urlencoded',
          },
          method: 'POST',
          signal: AbortSignal.timeout(10_000),
        },
      );
    } catch {
      return {
        attemptedAt,
        detail:
          'The SMS provider request ended without a definitive response; Faro will not retry automatically to avoid a duplicate alert.',
        errorCode: 'TWILIO_SMS_DELIVERY_UNKNOWN',
        provider: this.name,
        providerMessageId: null,
        status: 'FAILED',
      };
    }

    const body = await safeJson(response);
    if (!response.ok) {
      return {
        attemptedAt,
        detail: 'Twilio rejected the SMS reminder request.',
        errorCode: `TWILIO_HTTP_${response.status}`,
        provider: this.name,
        providerMessageId: null,
        status: 'FAILED',
      };
    }
    const parsed = messageResponseSchema.safeParse(body);
    if (!parsed.success) {
      return {
        attemptedAt,
        detail:
          'Twilio returned an unexpected response; Faro will not retry automatically to avoid a duplicate alert.',
        errorCode: 'TWILIO_SMS_RESPONSE_INVALID',
        provider: this.name,
        providerMessageId: null,
        status: 'FAILED',
      };
    }
    return {
      attemptedAt,
      detail: `Twilio accepted the reminder with status ${parsed.data.status}.`,
      errorCode: null,
      provider: this.name,
      providerMessageId: parsed.data.sid,
      status: 'ACCEPTED',
    };
  }
}

/** Minimal Twilio Verify v2 client for proving possession of an SMS recipient number. */
export class TwilioVerifyClient {
  private readonly config: z.output<typeof twilioVerifyConfigSchema>;

  constructor(
    rawConfig: TwilioVerifyConfig,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    this.config = twilioVerifyConfigSchema.parse(rawConfig);
  }

  async start(rawPhone: string): Promise<{ sid: string; status: string }> {
    const phone = e164PhoneNumberSchema.parse(rawPhone);
    return this.request('Verifications', new URLSearchParams({ Channel: 'sms', To: phone }));
  }

  async check(rawPhone: string, rawCode: string): Promise<{ sid: string; status: string }> {
    const phone = e164PhoneNumberSchema.parse(rawPhone);
    const code = z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9]{4,10}$/)
      .parse(rawCode);
    return this.request('VerificationCheck', new URLSearchParams({ Code: code, To: phone }));
  }

  private async request(
    resource: 'Verifications' | 'VerificationCheck',
    body: URLSearchParams,
  ): Promise<{ sid: string; status: string }> {
    const response = await this.fetcher(
      `https://verify.twilio.com/v2/Services/${this.config.serviceSid}/${resource}`,
      {
        body,
        headers: {
          authorization: basicAuthorization(this.config.apiKey, this.config.apiSecret),
          'content-type': 'application/x-www-form-urlencoded',
        },
        method: 'POST',
        signal: AbortSignal.timeout(10_000),
      },
    );
    const responseBody = await safeJson(response);
    if (!response.ok) {
      throw Object.assign(new Error('TWILIO_VERIFY_REJECTED'), {
        code: `TWILIO_VERIFY_HTTP_${response.status}`,
      });
    }
    return verifyResponseSchema.parse(responseBody);
  }
}
