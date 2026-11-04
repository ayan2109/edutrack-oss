import test from 'node:test';
import assert from 'node:assert/strict';
import { deliverOtp } from './smsProvider.js';

test('console OTP delivery is blocked in production', async () => {
  const previous = { nodeEnv: process.env.NODE_ENV, delivery: process.env.OTP_DELIVERY };
  process.env.NODE_ENV = 'production';
  process.env.OTP_DELIVERY = 'console';
  try {
    await assert.rejects(() => deliverOtp('+919876543210', '123456'), /disabled in production/i);
  } finally {
    if (previous.nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous.nodeEnv;
    if (previous.delivery === undefined) delete process.env.OTP_DELIVERY; else process.env.OTP_DELIVERY = previous.delivery;
  }
});

test('unknown OTP delivery providers fail closed', async () => {
  const previous = process.env.OTP_DELIVERY;
  process.env.OTP_DELIVERY = 'unknown-provider';
  try {
    await assert.rejects(() => deliverOtp('+919876543210', '123456'), /Unsupported OTP_DELIVERY mode/i);
  } finally {
    if (previous === undefined) delete process.env.OTP_DELIVERY; else process.env.OTP_DELIVERY = previous;
  }
});

test('SMS provider credentials are required rather than silently falling back', async () => {
  const previous = { delivery: process.env.OTP_DELIVERY, key: process.env.MSG91_AUTH_KEY };
  process.env.OTP_DELIVERY = 'msg91';
  delete process.env.MSG91_AUTH_KEY;
  try {
    await assert.rejects(() => deliverOtp('+919876543210', '123456'), /MSG91_AUTH_KEY/);
  } finally {
    if (previous.delivery === undefined) delete process.env.OTP_DELIVERY; else process.env.OTP_DELIVERY = previous.delivery;
    if (previous.key === undefined) delete process.env.MSG91_AUTH_KEY; else process.env.MSG91_AUTH_KEY = previous.key;
  }
});
