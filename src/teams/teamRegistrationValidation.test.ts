import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createDefaultTeamRegistrationMembers,
  validateTeamRegistrationMembers,
} from './teamRegistrationValidation.ts'

test('allows a single captain entry or any roster size without blocking registration', () => {
  const members = createDefaultTeamRegistrationMembers()
  members[0].member_name = 'Alpha'
  members[1].member_name = ''
  members[2].member_name = ''
  members[3].member_name = ''

  assert.equal(validateTeamRegistrationMembers(members), null)

  const singleMember = [{ member_name: 'Only Captain', email: '', phone: '' }]
  assert.equal(validateTeamRegistrationMembers(singleMember), null)
})

test('allows optional email and phone values without blocking registration', () => {
  const members = createDefaultTeamRegistrationMembers()
  members[0].member_name = 'Captain'
  members[1].member_name = 'Teammate'
  members[2].email = 'captain@example.com'
  members[3].phone = '+8801712345678'

  assert.equal(validateTeamRegistrationMembers(members), null)
})
