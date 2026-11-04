const DEFAULT_TIMEOUT_MS = 10_000;

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required SMS configuration: ${name}`);
  return value;
}

function phoneDigits(phone) {
  return String(phone).replace(/\D/g, '');
}

async function fetchWithTimeout(url, options) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(Number(process.env.SMS_REQUEST_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS)
  });
  const body = await response.text();
  let data;
  try { data = body ? JSON.parse(body) : {}; } catch { data = { message: body.slice(0, 500) }; }
  if (!response.ok) {
    const detail = data?.message || data?.error || data?.errors?.[0]?.message;
    throw new Error(`SMS provider rejected the request (${response.status})${detail ? `: ${String(detail).slice(0, 240)}` : ''}`);
  }
  return data;
}

async function sendWithMsg91(phone, otp) {
  const authKey = required('MSG91_AUTH_KEY');
  const templateId = required('MSG91_TEMPLATE_ID');
  const senderId = required('MSG91_SENDER_ID');
  const variableName = process.env.MSG91_OTP_VARIABLE?.trim() || 'var1';
  const payload = {
    template_id: templateId,
    sender: senderId,
    short_url: '0',
    recipients: [{ mobiles: phoneDigits(phone), [variableName]: otp }]
  };
  await fetchWithTimeout(process.env.MSG91_FLOW_URL || 'https://control.msg91.com/api/v5/flow/', {
    method: 'POST',
    headers: { authkey: authKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(payload)
  });
  return { channel: 'sms', provider: 'msg91' };
}

async function sendWithTwilio(phone, otp) {
  const accountSid = required('TWILIO_ACCOUNT_SID');
  const authToken = required('TWILIO_AUTH_TOKEN');
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim();
  const from = process.env.TWILIO_FROM_NUMBER?.trim();
  if (!messagingServiceSid && !from) {
    throw new Error('Configure TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER.');
  }
  const template = process.env.TWILIO_OTP_MESSAGE?.trim() || 'Your EduTrack verification code is {otp}. It expires in 5 minutes.';
  const params = new URLSearchParams({ To: phone, Body: template.replaceAll('{otp}', otp) });
  if (messagingServiceSid) params.set('MessagingServiceSid', messagingServiceSid);
  else params.set('From', from);
  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  await fetchWithTimeout(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: { authorization: `Basic ${credentials}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });
  return { channel: 'sms', provider: 'twilio' };
}

/** Sends an already-generated OTP. The OTP is never returned to the client. */
export async function deliverOtp(phone, otp) {
  const mode = (process.env.OTP_DELIVERY || 'console').toLowerCase();
  if (mode === 'console') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Console OTP delivery is disabled in production. Configure MSG91 or Twilio.');
    }
    console.log(`\n[EduTrack DEV OTP] ${phone} => ${otp} (valid for 5 minutes)\n`);
    return { channel: 'console', provider: 'console' };
  }
  if (mode === 'msg91') return sendWithMsg91(phone, otp);
  if (mode === 'twilio') return sendWithTwilio(phone, otp);
  throw new Error(`Unsupported OTP_DELIVERY mode: ${mode}. Use console, msg91, or twilio.`);
}

export function getOtpDeliveryMode() {
  return (process.env.OTP_DELIVERY || 'console').toLowerCase();
}
