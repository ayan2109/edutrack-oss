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
3. Copy `backend/.env.example` to `backend/.env`. Set `FIREBASE_SERVICE_ACCOUNT_JSON` to the complete service-account JSON as a single-line JSON value (or set `GOOGLE_APPLICATION_CREDENTIALS` to a secure local file path) and set `FIREBASE_DATABASE_URL` to the exact URL from the console. Keep `NODE_ENV=development` and `OTP_DELIVERY=console` for local development.
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

## Phone OTP + custom token flow (development mode)
1. User enters an Indian mobile number in the frontend.
2. `POST /api/auth/send-otp` generates a 6-digit, five-minute OTP and prints it to the backend terminal. The OTP is never returned in the HTTP response.
3. User reads that code from the backend terminal and enters it in the frontend.
4. `POST /api/auth/verify-otp` validates expiry, attempt count and the code.
5. After successful verification, Firebase Admin SDK looks up the phone number and creates a Firebase Authentication user if one does not already exist.
6. Backend creates/loads the user's Realtime Database profile, generates a Firebase custom token, and returns it.
7. Frontend calls `signInWithCustomToken(auth, customToken)` to establish the Firebase session.

**Important:** Terminal OTP delivery is for local development/testing only. It does not send an SMS to the entered phone. The code is visible to anyone with access to the backend terminal. Do not deploy this configuration or use it for real user verification. Before production, replace the console OTP delivery with a real SMS provider and set `OTP_DELIVERY` to a provider implementation; keep OTPs hashed at rest and add persistent storage/abuse controls. Firebase Phone Authentication provider and SMS region allowlisting are not required for the development terminal flow.

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
- Replace development terminal OTP output with a production SMS provider, persistent OTP storage, stronger abuse controls and monitoring.
- Add admin onboarding/invitation and role management; current first-login behavior provisions the first phone identity as an institution admin.
- Complete online exam attempt/answer autosave workflows, institution settings persistence, profile editing and full result lookup UI.
- Add comprehensive automated tests, audit logging, backups, monitoring and privacy/retention policies.
- Validate every role and tenant boundary with integration tests before public deployment.

## Security
Firebase web API keys are public client identifiers, not server credentials. Never expose the Firebase Admin service-account JSON/private key. Never commit `.env` files. The RTDB rules in `database.rules.json` deny client-side access; all data access in this alpha is performed by the backend Admin SDK.

## License
MIT. See [LICENSE](LICENSE).
