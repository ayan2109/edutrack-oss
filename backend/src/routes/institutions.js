import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { database } from '../lib/firebaseAdmin.js';
import { auth, allow } from '../middleware/auth.js';

const router = Router();
router.use(auth);
const institutionSummary = (id, value, role) => ({ id, name: value.name || '', code: value.code || '', status: value.status || 'active', createdAt: value.createdAt || null, ...(role ? { role } : {}) });

router.get('/', async (req, res, next) => {
  try {
    const db = database();
    if (req.user.platformRole === 'SUPER_ADMIN') {
      const snap = await db.ref('institutions').get();
      const institutions = Object.entries(snap.val() || {}).map(([id, value]) => institutionSummary(id, value));
      return res.json({ institutions, platformRole: 'SUPER_ADMIN' });
    }
    const userRef = db.ref(`users/${req.user.uid}`);
    const profileSnap = await userRef.get();
    const profile = profileSnap.val() || {};
    const membershipsRef = userRef.child('institutions');
    let snap = await membershipsRef.get();
    if (!snap.exists() && profile.institutionId) {
      const legacyMembership = { role: profile.role || 'INSTITUTION_ADMIN', status: 'active', joinedAt: profile.createdAt || new Date().toISOString() };
      await membershipsRef.child(profile.institutionId).set(legacyMembership);
      await db.ref(`institutions/${profile.institutionId}/members/${req.user.uid}`).update({ role: legacyMembership.role, status: 'active', phoneNumber: profile.phoneNumber || '' });
      snap = await membershipsRef.get();
    }
    const memberships = snap.val() || {};
    const institutions = await Promise.all(Object.entries(memberships)
      .filter(([, m]) => m?.status === 'active')
      .map(async ([id, membership]) => {
        const institutionSnap = await db.ref(`institutions/${id}`).get();
        return institutionSnap.exists() ? institutionSummary(id, institutionSnap.val(), membership.role) : null;
      }));
    res.json({ institutions: institutions.filter(Boolean), platformRole: null });
  } catch (error) { next(error); }
});

router.post('/', allow('INSTITUTION_ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    const { name, code } = z.object({ name: z.string().trim().min(2).max(120), code: z.string().trim().max(24).optional() }).parse(req.body);
    const db = database();
    const id = randomUUID();
    const now = new Date().toISOString();
    const institution = { id, name, code: code || '', status: 'active', ownerUid: req.user.uid, createdAt: now, updatedAt: now };
    const updates = { [`institutions/${id}`]: institution };
    // Every newly created tenant gets an explicit owner membership and member index.
    updates[`users/${req.user.uid}/institutions/${id}`] = { role: 'INSTITUTION_ADMIN', status: 'active', joinedAt: now };
    updates[`institutions/${id}/members/${req.user.uid}`] = { role: 'INSTITUTION_ADMIN', status: 'active', joinedAt: now, phoneNumber: req.user.phoneNumber || '' };
    await db.ref().update(updates);
    res.status(201).json({ institution: { ...institution, role: 'INSTITUTION_ADMIN' } });
  } catch (error) { next(error); }
});

router.get('/:institutionId/members', allow('INSTITUTION_ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    if (req.user.platformRole !== 'SUPER_ADMIN' && (req.user.institutionId !== req.params.institutionId || req.user.role !== 'INSTITUTION_ADMIN')) return res.status(403).json({ message: 'Institution administrator access is required.' });
    const snap = await database().ref(`institutions/${req.params.institutionId}/members`).get();
    res.json({ members: Object.entries(snap.val() || {}).map(([uid, member]) => ({ uid, ...member })) });
  } catch (error) { next(error); }
});

router.post('/:institutionId/members', allow('INSTITUTION_ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    if (req.user.platformRole !== 'SUPER_ADMIN' && (req.user.institutionId !== req.params.institutionId || req.user.role !== 'INSTITUTION_ADMIN')) return res.status(403).json({ message: 'Institution administrator access is required.' });
    const { uid, role } = z.object({ uid: z.string().min(1), role: z.enum(['INSTITUTION_ADMIN', 'TEACHER', 'STUDENT']) }).parse(req.body);
    const db = database();
    const [institutionSnap, userSnap] = await Promise.all([db.ref(`institutions/${req.params.institutionId}`).get(), db.ref(`users/${uid}`).get()]);
    if (!institutionSnap.exists()) return res.status(404).json({ message: 'Institution not found' });
    if (!userSnap.exists()) return res.status(404).json({ message: 'User profile not found. The user must sign in once before being assigned.' });
    const member = { role, status: 'active', joinedAt: new Date().toISOString() };
    await db.ref().update({
      [`users/${uid}/institutions/${req.params.institutionId}`]: member,
      [`institutions/${req.params.institutionId}/members/${uid}`]: { role, status: 'active', phoneNumber: userSnap.val().phoneNumber || '' }
    });
    res.status(201).json({ uid, ...member });
  } catch (error) { next(error); }
});

router.delete('/:institutionId/members/:uid', allow('INSTITUTION_ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    if (req.user.platformRole !== 'SUPER_ADMIN' && (req.user.institutionId !== req.params.institutionId || req.user.role !== 'INSTITUTION_ADMIN')) return res.status(403).json({ message: 'Institution administrator access is required.' });
    if (req.params.uid === req.user.uid) return res.status(400).json({ message: 'You cannot remove your own active membership.' });
    const memberRef = database().ref(`institutions/${req.params.institutionId}/members/${req.params.uid}`);
    const targetSnap = await memberRef.get();
    if (!targetSnap.exists() || targetSnap.val()?.status !== 'active') return res.status(404).json({ message: 'Active membership not found.' });
    if (targetSnap.val()?.role === 'INSTITUTION_ADMIN') {
      const allMembers = (await database().ref(`institutions/${req.params.institutionId}/members`).get()).val() || {};
      const activeAdmins = Object.values(allMembers).filter((m) => m?.role === 'INSTITUTION_ADMIN' && m?.status === 'active');
      if (activeAdmins.length <= 1) return res.status(409).json({ message: 'The last institution administrator cannot be removed.' });
    }
    await database().ref().update({
      [`users/${req.params.uid}/institutions/${req.params.institutionId}/status`]: 'revoked',
      [`institutions/${req.params.institutionId}/members/${req.params.uid}/status`]: 'revoked'
    });
    res.status(204).end();
  } catch (error) { next(error); }
});

router.get('/:institutionId', async (req, res, next) => {
  try {
    if (req.user.platformRole !== 'SUPER_ADMIN' && req.user.institutionId !== req.params.institutionId) {
      return res.status(403).json({ message: 'Cross-institution access denied.' });
    }
    const snap = await database().ref(`institutions/${req.params.institutionId}`).get();
    if (!snap.exists()) return res.status(404).json({ message: 'Institution not found' });
    res.json({ institution: institutionSummary(snap.key, snap.val()) });
  } catch (error) { next(error); }
});

export default router;
