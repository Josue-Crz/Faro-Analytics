import { TwilioSmsNotificationAdapter, TwilioVerifyClient } from '@faro/notifications';

function value(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

export function smsAdapterMode(): 'preview' | 'twilio' {
  return value('NOTIFICATION_ADAPTER') === 'twilio' ? 'twilio' : 'preview';
}

export function createTwilioSmsAdapter(): TwilioSmsNotificationAdapter | null {
  if (smsAdapterMode() !== 'twilio') return null;
  const accountSid = value('TWILIO_ACCOUNT_SID');
  const apiKey = value('TWILIO_API_KEY');
  const apiSecret = value('TWILIO_API_SECRET');
  const appUrl = value('APP_URL');
  const messagingServiceSid = value('TWILIO_MESSAGING_SERVICE_SID');
  const fromNumber = value('TWILIO_FROM_NUMBER');
  if (!accountSid || !apiKey || !apiSecret || !appUrl || (!messagingServiceSid && !fromNumber)) {
    return null;
  }
  try {
    return new TwilioSmsNotificationAdapter({
      accountSid,
      apiKey,
      apiSecret,
      appUrl,
      fromNumber,
      messagingServiceSid,
    });
  } catch {
    return null;
  }
}

export function createTwilioVerifyClient(): TwilioVerifyClient | null {
  if (smsAdapterMode() !== 'twilio') return null;
  const apiKey = value('TWILIO_API_KEY');
  const apiSecret = value('TWILIO_API_SECRET');
  const serviceSid = value('TWILIO_VERIFY_SERVICE_SID');
  if (!apiKey || !apiSecret || !serviceSid) return null;
  try {
    return new TwilioVerifyClient({ apiKey, apiSecret, serviceSid });
  } catch {
    return null;
  }
}

export function smsProviderState() {
  return {
    adapter: smsAdapterMode(),
    configured: Boolean(createTwilioSmsAdapter()),
    verificationConfigured: Boolean(createTwilioVerifyClient()),
  };
}
