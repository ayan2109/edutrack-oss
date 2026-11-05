import { Router } from 'express';
import { z } from 'zod';
import { randomInt } from 'node:crypto';
import { claimCooldown, deleteOtp, hashOtp, otpStoreMode, releaseCooldown, saveOtp, verifyOtp } from '../services/otpStore.js';
import { authAdmin, database } from '../lib/firebaseAdmin.js';
import { deliverOtp } from '../services/smsProvider.js';

const r = Router();
const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 30 * 1000;
const phoneSchema = z.string().regex(/^\+91[6-9]\d{9}$/, 'Enter a valid Indian mobile number including +91.');

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  const normalized = digits.length === 10 ? `+91${digits}` : `+${digits}`;
  return phoneSchema.parse(normalized);
}

// OTP delivery is backed by shared Upstash Redis in production and memory only in development.
r.post('/send-otp', async (req, res, next) => {
  try {
    const { phoneNumber } = z.object({ phoneNumber: z.string().min(10).max(16) }).parse(req.body);
    const phone = normalizePhone(phoneNumber);
    const claimed = await claimCooldown(phone, RESEND_COOLDOWN_MS / 1000);
    if (!claimed) return res.status(429).json({ message: 'Please wait 30 seconds before requesting another OTP.' });
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    try {
      const delivery = await deliverOtp(phone, code);
      await saveOtp(phone, { codeHash: hashOtp(phone, code), sentAt: Date.now(), expiresAt: Date.now() + OTP_TTL_MS, attempts: 0 }, OTP_TTL_MS / 1000);
      const message = delivery.channel === 'console'
        ? 'OTP generated. Check the backend terminal (development only).'
        : 'OTP sent successfully. Check your mobile phone.';
      return res.json({ message, deliveryChannel: delivery.channel, provider: delivery.provider, expiresIn: OTP_TTL_MS / 1000, resendAfter: RESEND_COOLDOWN_MS / 1000 });
    } catch (deliveryError) {
      await releaseCooldown(phone);
      await deleteOtp(phone);
      return res.status(503).json({ message: deliveryError.message || 'Unable to send OTP. Check SMS provider configuration.' });
    }
  } catch (error) { next(error); }
});

r.post('/verify-otp', async (req, res, next) => {
  try {
    const { phoneNumber, otp, institutionName } = z.object({
      phoneNumber: z.string().min(10).max(16),
      otp: z.string().regex(/^\d{6}$/, 'OTP must be exactly 6 digits.'),
      institutionName: z.string().min(2).max(120).optional()
    }).parse(req.body);
    const phone = normalizePhone(phoneNumber);
    const verification = await verifyOtp(phone, hashOtp(phone, otp), MAX_ATTEMPTS);
    if (verification === -1) return res.status(400).json({ message: 'No active OTP found. Request a new OTP.' });
    if (verification === -2) return res.status(400).json({ message: 'OTP expired. Request a new OTP.' });
    if (verification === -3) return res.status(429).json({ message: 'Too many incorrect attempts. Request a new OTP.' });
    if (verification > 0) return res.status(400).json({ message: `Incorrect OTP. ${MAX_ATTEMPTS - verification} attempts remaining.` });

    const adminAuth = authAdmin();
    let firebaseUser;
    let isNewUser = false;
    try {
      firebaseUser = await adminAuth.getUserByPhoneNumber(phone);
    } catch (error) {
      if (error.code !== 'auth/user-not-found') throw error;
      firebaseUser = await adminAuth.createUser({ phoneNumber: phone, disabled: false });
      isNewUser = true;
    }

    const uid = firebaseUser.uid;
    const userRef = database().ref(`users/${uid}`);
    const snapshot = await userRef.get();
    let profile = snapshot.val();
    if (!profile) {
      const createdAt = new Date().toISOString();
      profile = {
        uid,
        phoneNumber: phone,
        name: '',
        role: 'INSTITUTION_ADMIN',
        institutionId: uid,
        institutionName: institutionName?.trim() || 'My Institution',
        createdAt,
        status: 'active'
      };
      profile.institutions = { [uid]: { role: 'INSTITUTION_ADMIN', status: 'active', joinedAt: createdAt } };
      await userRef.set(profile);
      await database().ref().update({ [`institutions/${uid}`]: { id: uid, name: profile.institutionName, ownerUid: uid, status: 'active', createdAt }, [`institutions/${uid}/members/${uid}`]: { role: 'INSTITUTION_ADMIN', status: 'active', phoneNumber: phone } });
    } else if (profile.phoneNumber !== phone) {
      await userRef.update({ phoneNumber: phone, updatedAt: new Date().toISOString() });
      profile = { ...profile, phoneNumber: phone };
    }

    const activeInstitutionId = profile.institutionId || uid;
    const membershipRef = database().ref(`users/${uid}/institutions/${activeInstitutionId}`);
    if (!(await membershipRef.get()).exists()) {
      await membershipRef.set({ role: profile.role || 'INSTITUTION_ADMIN', status: 'active', joinedAt: profile.createdAt || new Date().toISOString() });
    }
    const membershipsSnap = await database().ref(`users/${uid}/institutions`).get();
    const memberships = membershipsSnap.val() || {};

    const customToken = await adminAuth.createCustomToken(uid, {
      role: profile.role || 'INSTITUTION_ADMIN',
      institutionId: activeInstitutionId
    });
    return res.json({
      customToken,
      isNewUser,
      user: {
        uid,
        phoneNumber: phone,
        name: profile.name || '',
        role: profile.role || 'INSTITUTION_ADMIN',
        institutionId: activeInstitutionId,
        institutions: memberships,
        institutionName: profile.institutionName || 'My Institution'
      }
    });
  } catch (error) { next(error); }
});

r.get('/me', async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/, '');
    if (!token) return res.status(401).json({ message: 'Authentication required' });
    const decoded = await authAdmin().verifyIdToken(token, true);
    const snapshot = await database().ref(`users/${decoded.uid}`).get();
    const user = snapshot.val() || { uid: decoded.uid, phoneNumber: decoded.phone_number || '' };
    const memberships = user.institutions || (user.institutionId ? { [user.institutionId]: { role: user.role || 'INSTITUTION_ADMIN', status: 'active' } } : {});
    res.json({ user: { ...user, institutions: memberships }, otpStorage: otpStoreMode() });
  } catch (error) { next(error); }
});

export default r;
