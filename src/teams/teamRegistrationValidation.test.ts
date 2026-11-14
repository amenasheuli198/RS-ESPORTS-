import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createDefaultTeamRegistrationMembers,
  validateTeamRegistrationMembers,
} from './teamRegistrationValidation.ts'

test('requires exactly four roster entries with all names filled', () => {
  const members = createDefaultTeamRegistrationMembers()
  members[0].member_name = 'Alpha'
  members[1].member_name = 'Bravo'
  members[2].member_name = 'Charlie'
  members[3].member_name = 'Delta'

  assert.equal(validateTeamRegistrationMembers(members), null)

  members[3].member_name = ''
  assert.match(validateTeamRegistrationMembers(members) ?? '', /Member 4.*name/i)
})

test('allows optional email and phone values without blocking registration', () => {
  const members = createDefaultTeamRegistrationMembers()
  members.forEach((member, index) => {
    member.member_name = `Member ${index + 1}`
  })
  members[0].email = 'captain@example.com'
  members[1].phone = '+8801712345678'
  members[2].email = ''
  members[3].phone = ''

  assert.equal(validateTeamRegistrationMembers(members), null)
})
