# EduTrack OSS production rollout checklist

This project is an early-stage application. Passing a frontend build or unit tests is not proof of production readiness. Complete this checklist in a staging Firebase project before using real student data.

## Build and CI
- Run `npm ci`, `npm run build`, and `npm test` from the repository root.
- CI runs the same build and tests for every pull request.
- Deploy the frontend as a static SPA (Netlify config is included) and the backend as a Node service (Render blueprint is included).
- Set the production frontend origin in `CLIENT_URL`; never use `*` for CORS.

## Firebase
- Create a dedicated Firebase project for staging and another for production.
- Deploy rules with `firebase deploy --only database` (the `firebase.json` points to `database.firebase.rules.json`).
- Confirm direct client reads/writes to tenant data are denied. The Express API uses Firebase Admin SDK, which bypasses RTDB rules, so server-side authorization tests are mandatory.
- Use a least-privilege service account where possible; keep its JSON only in backend secret storage.
- Enable database backups/exports and test restoration.

## Identity, roles and tenant isolation
- Test a user belonging to two institutions with different roles.
- Test active, revoked and suspended memberships.
- Test every API with a missing, forged, inactive and cross-tenant `X-Institution-Id`.
- Verify only institution admins manage memberships and only platform super admins use the platform directory.
- Verify teachers cannot delete records or publish results; students cannot call staff APIs.
- Never trust a role or institution ID supplied in request bodies or client storage; the server reloads membership from RTDB on each request.

## OTP and SMS
- Production refuses to start without Upstash Redis REST credentials.
- Set a random `OTP_HASH_SECRET` of at least 32 characters in secret storage.
- Configure one SMS provider and verify approved templates, sender IDs, Indian DLT registration/consent requirements, delivery receipts and costs with the provider.
- Test expiry, cooldown, wrong-attempt cap, provider timeout/failure and Redis outage.
- Add provider/IP-level fraud monitoring and alerting before broad public access.

## Operations and privacy
- Enforce HTTPS at the hosting edge and set exact CORS origins.
- Configure structured logs, error monitoring, uptime alerts and log redaction (never log OTPs, tokens or secrets).
- Set database backup retention, restore drills, data retention and deletion policies.
- Review privacy notices, student/guardian consent and applicable local legal obligations.
- Load-test expected concurrent users and verify rate limits at the hosting/proxy layer.

## Current limitations
- The included deployment manifests are starting configurations, not a completed deployment. You must create the provider resources and enter secrets.
- Upstash Redis REST provides shared OTP storage, but Redis outage handling, provider account setup and end-to-end delivery still require live staging tests.
- The current app has a basic member-management UI and API; invitation workflows, email notifications, bulk import, detailed audit trails and full online exam attempt/autosave remain future work.
- The current tests are not a substitute for Firebase Emulator integration tests or a third-party security review.
