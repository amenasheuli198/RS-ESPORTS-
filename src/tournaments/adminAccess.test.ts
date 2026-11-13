import test from 'node:test'
import assert from 'node:assert/strict'
import { hasTournamentAdminClaim } from './adminAccess.ts'

test('accepts trusted admin roles', () => {
  assert.equal(hasTournamentAdminClaim({ app_metadata: { role: 'admin' } } as any), true)
  assert.equal(hasTournamentAdminClaim({ app_metadata: { role: 'super_admin' } } as any), true)
})

test('rejects non-admin roles and missing users', () => {
  assert.equal(hasTournamentAdminClaim({ app_metadata: { role: 'member' } } as any), false)
  assert.equal(hasTournamentAdminClaim(null), false)
})
