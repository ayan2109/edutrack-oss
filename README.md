# EduTrack OSS

An open-source examination and academic management platform. Current stack: React + Vite, Express, Firebase Authentication (Admin-created phone users + custom-token sign-in), Firebase Admin SDK and Firebase Realtime Database.

> **Development status:** Early alpha. Authentication and core institution-scoped Realtime Database APIs are implemented. Review `docs/COMPLETION-REPORT.md`; do not use with real student records until security and workflow testing is complete.

## Requirements
- Node.js 20+
- A Firebase project with Firebase Authentication (for custom-token sessions) and Realtime Database enabled
- Firebase Admin service account for the backend

## Firebase setup
1. Create a Realtime Database and copy its exact database URL. Do not assume the default URL; regional databases may use a `.firebasedatabase.app` hostname.
2. In Project settings → Service accounts, generate a private key. Keep it private; never commit it.
3. Copy `backend/.env.example` to `backend/.env`. Set `FIREBASE_SERVICE_ACCOUNT_JSON` to the complete service-account JSON as a single-line JSON value (or set `GOOGLE_APPLICATION_CREDENTIALS` to a secure local file path) and set `FIREBASE_DATABASE_URL` to the exact URL from the console. Keep `NODE_ENV=development` and `OTP_DELIVERY=console` for local development. Never commit `backend/.env`.
4. Copy root `.env.example` to `frontend/.env` if you want to override the provided public web config. Set `VITE_FIREBASE_DATABASE_URL` to the same exact RTDB URL.
5. Apply `database.rules.json` to Realtime Database. The rules deny direct client access; the Express API uses the Admin SDK after verifying Firebase ID tokens.
6. Firebase Phone sign-in/SMS region settings are not used by this flow. The backend creates Firebase Auth phone users with the Admin SDK after the development OTP is verified.

## Install and run
From repository root:

```bash
npm install
npm run dev
```

Frontend: http://localhost:5173  
Backend: http://localhost:5000  
Health: http://localhost:5000/api/health

Or run separately:

```bash
npm run dev -w backend
npm run dev -w frontend
```

## Phone OTP + custom token flow

1. User enters an Indian mobile number in the frontend.
2. `POST /api/auth/send-otp` generates a cryptographically random 6-digit OTP with a five-minute expiry and sends it through the configured delivery adapter.
3. The OTP is never returned by the API. The backend stores only its SHA-256 digest in process memory and compares digests using a timing-safe comparison.
4. `POST /api/auth/verify-otp` validates expiry, attempt count and the supplied code.
5. After successful verification, Firebase Admin SDK looks up the phone number and creates a Firebase Authentication user if one does not already exist.
6. Backend creates/loads the user's Realtime Database profile, generates a Firebase custom token, and returns it.
7. Frontend calls `signInWithCustomToken(auth, customToken)` to establish the Firebase session.

### Choose an OTP delivery provider

Set `OTP_DELIVERY` in `backend/.env`:

- `console` – local development only. Prints the OTP in the backend terminal. It is deliberately blocked when `NODE_ENV=production`.
- `msg91` – sends the generated OTP using the MSG91 Flow API. Configure `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID`, `MSG91_SENDER_ID`, and ensure the approved template contains the variable configured by `MSG91_OTP_VARIABLE` (default `var1`). The template and sender must be approved/configured in your MSG91 account.
- `twilio` – sends an SMS through Twilio Programmable Messaging. Configure `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and either `TWILIO_MESSAGING_SERVICE_SID` or `TWILIO_FROM_NUMBER`. `TWILIO_OTP_MESSAGE` supports the `{otp}` placeholder.

No SMS provider account or payment is required to develop, run, or contribute to the code while using `console` mode. An institute/operator deploying real SMS must create and pay for its own provider account and configure its credentials on the server. Never put provider credentials in frontend variables (`VITE_*`) or commit them to GitHub.

Example production configuration:

```dotenv
NODE_ENV=production
OTP_DELIVERY=msg91
MSG91_AUTH_KEY=your-server-side-auth-key
MSG91_TEMPLATE_ID=your-approved-template-id
MSG91_SENDER_ID=your-approved-sender-id
MSG91_OTP_VARIABLE=var1
```

Use either MSG91 or Twilio configuration, not both. Provider requests have a configurable timeout (`SMS_REQUEST_TIMEOUT_MS`, default 10000 ms). A provider error returns an HTTP 503; the OTP is not treated as sent and no verification success is fabricated.

### Deployment limitations to address before a public production rollout

The current OTP store is in-memory and is suitable only for a single backend process / development-scale deployment. Restarting the server clears pending OTPs, and multiple server instances do not share them. Before a multi-instance or high-volume production deployment, replace it with shared storage such as Redis, add per-phone/IP abuse controls and monitoring, and verify provider template, delivery, DLT/consent and regional requirements. The HTTP rate limits are useful baseline protections but are not a complete anti-abuse system.

## Realtime Database data layout

```text
institutions/{institutionId}/
  students/{studentId}
  subjects/{subjectId}
  exams/{examId}
  marks/{examId}/{studentId}/{subjectId}
  results/{examId}/{studentId}
users/{firebaseUid}
```

## API overview
- `POST /api/auth/exchange-phone-token` – verify Firebase ID token, provision profile, return custom token.
- `GET /api/auth/me` – current verified profile.
- `GET/POST/PUT/DELETE /api/students`
- `GET/POST/PUT/DELETE /api/subjects`
- `GET/POST/PUT/DELETE /api/exams`
- `POST /api/results/marks`
- `POST /api/results/:examId/publish`
- `POST /api/results/public/lookup`

Protected endpoints require `Authorization: Bearer <Firebase ID token>`.

## Important production work still required
- Confirm the exact RTDB URL and service-account setup in the target Firebase project.
- Replace the in-memory OTP store with shared persistent/TTL storage (for multi-instance production), strengthen per-phone/IP abuse controls and monitoring, and complete real-device delivery tests with the institution's SMS provider.
- Add admin onboarding/invitation and role management; current first-login behavior provisions the first phone identity as an institution admin.
- Complete online exam attempt/answer autosave workflows, institution settings persistence, profile editing and full result lookup UI.
- Add comprehensive automated tests, audit logging, backups, monitoring and privacy/retention policies.
- Validate every role and tenant boundary with integration tests before public deployment.

## Security
Firebase web API keys are public client identifiers, not server credentials. Never expose the Firebase Admin service-account JSON/private key. Never commit `.env` files. The RTDB rules in `database.rules.json` deny client-side access; all data access in this alpha is performed by the backend Admin SDK.

## License
MIT. See [LICENSE](LICENSE).
