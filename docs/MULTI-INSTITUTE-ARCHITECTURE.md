# EduTrack OSS — Multi-institute architecture

## Tenant model

- `institutions/{institutionId}` is the tenant root. Students, subjects, exams, marks, results, settings, members and audit data must live beneath that root.
- `users/{uid}/institutions/{institutionId}` is the authoritative user-to-tenant membership map. Each membership has a tenant-scoped role and `active`/`revoked` status.
- `institutions/{institutionId}/members/{uid}` is an administrative index. Authorization always checks the user's membership record under `users/{uid}/institutions`, not this index.
- `users/{uid}/platformRole` is reserved for platform-level privileges such as `SUPER_ADMIN`; never let a client write it.

## Request authorization

- Every authenticated tenant API request must send `X-Institution-Id`.
- Backend middleware verifies the Firebase ID token, loads the user profile, and validates an active membership for the requested institution before exposing `req.user.institutionId` and the membership role.
- API data paths are always constructed from the verified `req.user.institutionId`; never accept a tenant ID from a request body or query string for CRUD operations.
- Legacy single-institute profiles are migrated to a membership on first institution-directory access or first tenant API access.
- The public result lookup is intentionally a separate endpoint and returns only a published result after matching institution, exam and student identifiers.

## Frontend contexts and layouts

- `AuthContext` owns Firebase authentication and the server profile.
- `InstitutionContext` loads the memberships available to the signed-in user, remembers the selected tenant, and creates additional institutions.
- `PlatformLayout` is reserved for platform administrators; `InstitutionLayout` is the tenant workspace; `StudentLayout` is the student portal.
- The API client sends the selected tenant in `X-Institution-Id`. Switching tenants reloads the tenant-scoped resources.

## Roles

- `SUPER_ADMIN`: platform-level control. Provision this role only through a trusted server-side/admin process.
- `INSTITUTION_ADMIN`: administers one tenant and manages its members.
- `TEACHER`: tenant-scoped academic operations; cannot manage tenant memberships.
- `STUDENT`: portal-only role; cannot read tenant-wide student, subject or exam collections.

## Firebase rules strategy

The backend uses Firebase Admin SDK, which bypasses Realtime Database Security Rules. Therefore the rules file denies direct client access to tenant data and privileged membership fields. All tenant reads/writes go through the Express API, where membership and role checks are enforced. Do not loosen these rules unless direct-client access is designed with equivalent tenant-aware rules and tested against the Emulator Suite.

## Important deployment steps

1. Deploy `database.firebase.rules.json` to the Realtime Database rules for the intended Firebase project.
2. Confirm the backend service account has only the IAM permissions it needs.
3. Create platform administrators by a trusted Admin SDK operation; never expose a public endpoint that sets `platformRole`.
4. Before production, add audit logging for membership/role changes, automated cross-tenant tests, and rate limits on membership management.
5. Existing users with a legacy `institutionId` are migrated when they open the institution directory. Verify their membership records after the first login.
