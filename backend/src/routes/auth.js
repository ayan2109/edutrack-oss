import { Router } from 'express';
import { z } from 'zod';
import { randomInt, timingSafeEqual } from 'node:crypto';
import { authAdmin, database } from '../lib/firebaseAdmin.js';

const r = Router();
const pendingOtps = new Map();
const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 30 * 1000;
const phoneSchema = z.string().regex(/^\+91[6-9]\d{9}$/, 'Enter a valid Indian mobile number including +91.');

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  const normalized = digits.length === 10 ? `+91${digits}` : `+${digits}`;
  return phoneSchema.parse(normalized);
}

// Development-only OTP delivery: code is printed to the backend terminal, never returned by the API.
r.post('/send-otp', async (req, res, next) => {
  try {
    if (process.env.OTP_DELIVERY !== 'console' || process.env.NODE_ENV === 'production') {
      return res.status(503).json({ message: 'Console OTP is development-only. Configure a real SMS provider before production.' });
    }
    const { phoneNumber } = z.object({ phoneNumber: z.string().min(10).max(16) }).parse(req.body);
    const phone = normalizePhone(phoneNumber);
    const now = Date.now();
    const previous = pendingOtps.get(phone);
    if (previous && now - previous.sentAt < RESEND_COOLDOWN_MS) {
      return res.status(429).json({ message: 'Please wait 30 seconds before requesting another OTP.' });
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    pendingOtps.set(phone, { code, sentAt: now, expiresAt: now + OTP_TTL_MS, attempts: 0 });
    console.log(`\n[EduTrack DEV OTP] ${phone} => ${code} (valid for 5 minutes)\n`);
    return res.json({ message: 'OTP generated. Check the backend terminal (development only).', expiresIn: OTP_TTL_MS / 1000 });
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
    const record = pendingOtps.get(phone);
    if (!record) return res.status(400).json({ message: 'No active OTP found. Request a new OTP.' });
    if (Date.now() > record.expiresAt) {
      pendingOtps.delete(phone);
      return res.status(400).json({ message: 'OTP expired. Request a new OTP.' });
    }
    if (record.attempts >= MAX_ATTEMPTS) {
      pendingOtps.delete(phone);
      return res.status(429).json({ message: 'Too many incorrect attempts. Request a new OTP.' });
    }
    record.attempts += 1;
    const supplied = Buffer.from(otp);
    const expected = Buffer.from(record.code);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      return res.status(400).json({ message: `Incorrect OTP. ${MAX_ATTEMPTS - record.attempts} attempts remaining.` });
    }
    pendingOtps.delete(phone);

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
      await userRef.set(profile);
      await database().ref(`institutions/${uid}`).set({ id: uid, name: profile.institutionName, ownerUid: uid, createdAt });
    } else if (profile.phoneNumber !== phone) {
      await userRef.update({ phoneNumber: phone, updatedAt: new Date().toISOString() });
      profile = { ...profile, phoneNumber: phone };
    }

    const customToken = await adminAuth.createCustomToken(uid, {
      role: profile.role || 'INSTITUTION_ADMIN',
      institutionId: profile.institutionId || uid
    });
    return res.json({
      customToken,
      isNewUser,
      user: {
        uid,
        phoneNumber: phone,
        name: profile.name || '',
        role: profile.role || 'INSTITUTION_ADMIN',
        institutionId: profile.institutionId || uid,
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
    res.json({ user: snapshot.val() || { uid: decoded.uid, phoneNumber: decoded.phone_number || '' } });
  } catch (error) { next(error); }
});

export default r;
