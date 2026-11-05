import { authAdmin, database } from '../lib/firebaseAdmin.js';

const ROLES = new Set(['INSTITUTION_ADMIN', 'TEACHER', 'STUDENT']);
const platformDirectory = (req) => req.method === 'GET' && /\/api\/institutions\/?$/.test(req.originalUrl.split('?')[0]);
const institutionCreation = (req) => req.method === 'POST' && /\/api\/institutions\/?$/.test(req.originalUrl.split('?')[0]);

export async function auth(req, res, next) {
  const token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Authentication required' });
  try {
    const decoded = await authAdmin().verifyIdToken(token, true);
    const db = database();
    const profileSnap = await db.ref(`users/${decoded.uid}`).get();
    const profile = profileSnap.val();
    if (!profile || profile.disabled || profile.status === 'disabled') return res.status(403).json({ message: 'Account disabled or profile unavailable' });

    const platformRole = profile.platformRole || (profile.role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : null);
    const requestedInstitutionId = String(req.headers['x-institution-id'] || '').trim();
    let membership = null;

    if (platformRole !== 'SUPER_ADMIN' && !platformDirectory(req) && !institutionCreation(req)) {
      if (!requestedInstitutionId) return res.status(400).json({ message: 'Select an institution before accessing its workspace.' });
      const [membershipSnap, institutionSnap] = await Promise.all([
        db.ref(`users/${decoded.uid}/institutions/${requestedInstitutionId}`).get(),
        db.ref(`institutions/${requestedInstitutionId}`).get()
      ]);
      membership = membershipSnap.val();
      // One-time compatibility migration for the original single-institute schema.
      if (!membership && profile.institutionId === requestedInstitutionId) {
        membership = { role: profile.role || 'INSTITUTION_ADMIN', status: 'active', joinedAt: profile.createdAt || new Date().toISOString() };
        await db.ref(`users/${decoded.uid}/institutions/${requestedInstitutionId}`).set(membership);
      }
      if (!institutionSnap.exists() || institutionSnap.val()?.status === 'suspended' || institutionSnap.val()?.status === 'disabled') {
        return res.status(403).json({ message: 'Institution is unavailable.' });
      }
      if (!membership || membership.status !== 'active' || !ROLES.has(membership.role)) {
        return res.status(403).json({ message: 'You do not have active access to this institution.' });
      }
    } else if (requestedInstitutionId) {
      const institutionSnap = await db.ref(`institutions/${requestedInstitutionId}`).get();
      if (!institutionSnap.exists()) return res.status(404).json({ message: 'Institution not found' });
    }

    req.user = {
      uid: decoded.uid,
      phoneNumber: decoded.phone_number || profile.phoneNumber || '',
      name: profile.name || '',
      platformRole,
      role: platformRole === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : (membership?.role || profile.role || null),
      institutionId: requestedInstitutionId || null,
      institutionMembership: membership,
      token: decoded
    };
    next();
  } catch (error) {
    if (error.code === 'auth/id-token-revoked') return res.status(401).json({ message: 'Session revoked. Sign in again.' });
    return res.status(401).json({ message: 'Invalid or expired Firebase ID token' });
  }
}

export { allow, requireInstitutionAdmin } from './permissions.js';
