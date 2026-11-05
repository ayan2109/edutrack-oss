import test from 'node:test';
import assert from 'node:assert/strict';
import { hashOtp, safeHashEqual, saveOtp, getOtp, deleteOtp, claimCooldown, releaseCooldown, otpStoreMode, verifyOtp } from './otpStore.js';

test('OTP hashes are phone-bound and compared safely', () => {
  const digest = hashOtp('+919876543210', '123456');
  assert.equal(safeHashEqual(digest, hashOtp('+919876543210', '123456')), true);
  assert.equal(safeHashEqual(digest, hashOtp('+919876543210', '123457')), false);
  assert.equal(safeHashEqual(digest, hashOtp('+919876543211', '123456')), false);
  assert.equal(safeHashEqual('not-hex', digest), false);
});

test('development OTP store saves, reads and deletes records', async () => {
  assert.equal(otpStoreMode(), 'memory-development-only');
  await saveOtp('+919876543210', { codeHash: 'abc', attempts: 0 }, 60);
  assert.deepEqual(await getOtp('+919876543210'), { codeHash: 'abc', attempts: 0 });
  await deleteOtp('+919876543210');
  assert.equal(await getOtp('+919876543210'), null);
});

test('resend cooldown can only be claimed once until released', async () => {
  const phone = '+919876543211';
  await releaseCooldown(phone);
  assert.equal(await claimCooldown(phone, 30), true);
  assert.equal(await claimCooldown(phone, 30), false);
  await releaseCooldown(phone);
  assert.equal(await claimCooldown(phone, 30), true);
  await releaseCooldown(phone);
});

test('OTP verification enforces wrong-attempt cap and consumes valid codes', async () => {
  const phone = '+919876543212';
  const correct = hashOtp(phone, '654321');
  await saveOtp(phone, { codeHash: correct, attempts: 0, expiresAt: Date.now() + 60000 }, 60);
  assert.equal(await verifyOtp(phone, hashOtp(phone, '000000'), 3), 1);
  assert.equal(await verifyOtp(phone, hashOtp(phone, '000001'), 3), 2);
  assert.equal(await verifyOtp(phone, hashOtp(phone, '000002'), 3), -3);
  assert.equal(await verifyOtp(phone, correct, 3), -1);
  await saveOtp(phone, { codeHash: correct, attempts: 0, expiresAt: Date.now() + 60000 }, 60);
  assert.equal(await verifyOtp(phone, correct, 3), 0);
  assert.equal(await verifyOtp(phone, correct, 3), -1);
});
