import { createHmac, timingSafeEqual } from 'node:crypto';

const PREFIX = process.env.OTP_REDIS_PREFIX || 'edutrack:otp:';
const memory = new Map();
const isProduction = process.env.NODE_ENV === 'production';
const redisUrl = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, '');
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

if (isProduction && (!redisUrl || !redisToken)) {
  throw new Error('Production OTP requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.');
}
if (isProduction && (!process.env.OTP_HASH_SECRET || process.env.OTP_HASH_SECRET.length < 32)) {
  throw new Error('Production OTP requires OTP_HASH_SECRET with at least 32 characters.');
}

function secret() {
  const value = process.env.OTP_HASH_SECRET || (!isProduction ? 'edutrack-local-development-only-secret-32chars' : '');
  if (!value || value.length < 32) throw new Error('OTP_HASH_SECRET must contain at least 32 characters.');
  return value;
}

export function hashOtp(phone, otp) {
  return createHmac('sha256', secret()).update(`${phone}:${otp}`).digest('hex');
}

export function safeHashEqual(a, b) {
  const left = Buffer.from(String(a || ''), 'hex');
  const right = Buffer.from(String(b || ''), 'hex');
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

async function redis(command) {
  const response = await fetch(redisUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${redisToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(Number(process.env.REDIS_REQUEST_TIMEOUT_MS || 5000))
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) throw new Error('Shared OTP storage is unavailable.');
  return payload.result;
}

export async function claimCooldown(phone, seconds) {
  const key = `${PREFIX}cooldown:${phone}`;
  if (redisUrl) return (await redis(['SET', key, '1', 'NX', 'EX', String(seconds)])) === 'OK';
  const current = memory.get(key);
  if (current && current.expiresAt > Date.now()) return false;
  memory.set(key, { value: '1', expiresAt: Date.now() + seconds * 1000 });
  return true;
}

export async function releaseCooldown(phone) {
  const key = `${PREFIX}cooldown:${phone}`;
  if (redisUrl) return redis(['DEL', key]);
  memory.delete(key);
}

export async function saveOtp(phone, record, ttlSeconds) {
  const key = `${PREFIX}code:${phone}`;
  const value = JSON.stringify(record);
  if (redisUrl) return redis(['SET', key, value, 'EX', String(ttlSeconds)]);
  memory.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

export async function getOtp(phone) {
  const key = `${PREFIX}code:${phone}`;
  let value;
  if (redisUrl) value = await redis(['GET', key]);
  else {
    const item = memory.get(key);
    if (!item || item.expiresAt <= Date.now()) { memory.delete(key); return null; }
    value = item.value;
  }
  if (!value) return null;
  try { return JSON.parse(value); } catch { return null; }
}

export async function deleteOtp(phone) {
  const key = `${PREFIX}code:${phone}`;
  if (redisUrl) return redis(['DEL', key]);
  memory.delete(key);
}


export async function verifyOtp(phone, suppliedHash, maxAttempts) {
  const key = `${PREFIX}code:${phone}`;
  if (redisUrl) {
    const script = `local raw = redis.call('GET', KEYS[1]); if not raw then return -1 end; local r = cjson.decode(raw); local now = tonumber(ARGV[1]); if now > tonumber(r.expiresAt) then redis.call('DEL', KEYS[1]); return -2 end; if tonumber(r.attempts) >= tonumber(ARGV[3]) then redis.call('DEL', KEYS[1]); return -3 end; if r.codeHash ~= ARGV[2] then r.attempts = tonumber(r.attempts) + 1; if r.attempts >= tonumber(ARGV[3]) then redis.call('DEL', KEYS[1]); return -3 end; local ttl = redis.call('TTL', KEYS[1]); redis.call('SET', KEYS[1], cjson.encode(r), 'EX', math.max(1, ttl)); return r.attempts end; redis.call('DEL', KEYS[1]); return 0`;
    const result = await redis(['EVAL', script, '1', key, String(Date.now()), suppliedHash, String(maxAttempts)]);
    return Number(result);
  }
  const item = memory.get(key);
  if (!item || item.expiresAt <= Date.now()) { memory.delete(key); return -1; }
  const record = JSON.parse(item.value);
  if (Date.now() > record.expiresAt) { memory.delete(key); return -2; }
  if (record.attempts >= maxAttempts) { memory.delete(key); return -3; }
  if (!safeHashEqual(record.codeHash, suppliedHash)) {
    record.attempts += 1;
    if (record.attempts >= maxAttempts) memory.delete(key);
    else memory.set(key, { value: JSON.stringify(record), expiresAt: item.expiresAt });
    return record.attempts >= maxAttempts ? -3 : record.attempts;
  }
  memory.delete(key);
  return 0;
}

export function otpStoreMode() { return redisUrl ? 'upstash-redis' : 'memory-development-only'; }
