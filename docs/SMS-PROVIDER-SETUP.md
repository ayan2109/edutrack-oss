# SMS OTP provider setup

EduTrack generates the OTP on the backend. The selected adapter only delivers it; OTP verification and Firebase custom-token creation remain in the EduTrack backend. Firebase Phone Authentication is not used.

## Local development (no SMS account needed)

In `backend/.env`:

```dotenv
NODE_ENV=development
OTP_DELIVERY=console
```

Start the app with `npm run dev`. Request an OTP and read it from the backend terminal. The OTP is never included in the HTTP response. Console delivery is blocked whenever `NODE_ENV=production`.

## MSG91

1. Create/configure an MSG91 Flow template for an OTP message.
2. Add the OTP placeholder to the template (default variable name is `var1`).
3. Configure the approved sender ID and template in your MSG91 account.
4. Set these server-only variables in `backend/.env`:

```dotenv
NODE_ENV=production
OTP_DELIVERY=msg91
MSG91_AUTH_KEY=...
MSG91_TEMPLATE_ID=...
MSG91_SENDER_ID=...
MSG91_OTP_VARIABLE=var1
```

The backend posts the recipient and generated OTP to the MSG91 Flow API. Check your approved template's variable syntax and account-specific requirements before live use.

## Twilio

Configure either a Messaging Service SID or a sender number:

```dotenv
NODE_ENV=production
OTP_DELIVERY=twilio
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_MESSAGING_SERVICE_SID=...
# Or use TWILIO_FROM_NUMBER=+1...
TWILIO_OTP_MESSAGE=Your EduTrack verification code is {otp}. It expires in 5 minutes.
```

The `{otp}` token is replaced by the generated six-digit code. Ensure the Twilio account, sender and destination country are enabled for your use case.

## Operational and security notes

- Put credentials only in the backend environment or a secret manager. Never use `VITE_` variables for provider secrets and never commit `.env` files.
- `OTP_DELIVERY` accepts `console`, `msg91`, or `twilio`. Missing credentials, unsupported providers and provider failures fail closed; the API does not pretend an SMS was sent.
- Provider requests time out after `SMS_REQUEST_TIMEOUT_MS` (default 10 seconds).
- OTPs expire after five minutes, resend is limited to one request per phone every 30 seconds, and verification allows at most five attempts. API-level rate limits also apply.
- The current OTP store is process-memory only. It is not shared across multiple backend instances and is cleared on restart. Use shared TTL storage (for example Redis), distributed throttling, monitoring and real-device delivery tests before scaling production.
- SMS fees, sender/template approvals, DLT registration and country-specific compliance are the responsibility of the operator/institute using its own provider account.
