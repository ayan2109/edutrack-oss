import test from 'node:test';
import assert from 'node:assert/strict';
import { allow, requireInstitutionAdmin } from './middleware/permissions.js';

function invoke(middleware, user) {
  const result = { statusCode: 200, body: null, nextCalled: false };
  const res = { status(code) { result.statusCode = code; return this; }, json(body) { result.body = body; return this; } };
  middleware({ user }, res, () => { result.nextCalled = true; });
  return result;
}

test('role middleware permits only explicitly listed roles', () => {
  assert.equal(invoke(allow('INSTITUTION_ADMIN'), { role: 'INSTITUTION_ADMIN' }).nextCalled, true);
  const denied = invoke(allow('INSTITUTION_ADMIN'), { role: 'TEACHER' });
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.nextCalled, false);
});

test('institution member management is restricted to tenant admins or platform admins', () => {
  assert.equal(invoke(requireInstitutionAdmin, { role: 'INSTITUTION_ADMIN' }).nextCalled, true);
  assert.equal(invoke(requireInstitutionAdmin, { platformRole: 'SUPER_ADMIN', role: 'SUPER_ADMIN' }).nextCalled, true);
  assert.equal(invoke(requireInstitutionAdmin, { role: 'TEACHER' }).statusCode, 403);
  assert.equal(invoke(requireInstitutionAdmin, { role: 'STUDENT' }).statusCode, 403);
});
