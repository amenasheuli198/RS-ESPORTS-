export interface TeamRegistrationMemberInput {
  member_name: string
  email: string
  phone: string
}

export function createDefaultTeamRegistrationMembers(): TeamRegistrationMemberInput[] {
  return Array.from({ length: 4 }, () => ({ member_name: '', email: '', phone: '' }))
}

function normalizeOptionalValue(rawValue: string | null | undefined): string {
  return String(rawValue ?? '').trim()
}

export function validateTeamRegistrationMembers(members: TeamRegistrationMemberInput[] | null | undefined) {
  if (!Array.isArray(members)) return null

  for (const member of members) {
    const memberName = normalizeOptionalValue(member?.member_name)
    const email = normalizeOptionalValue(member?.email)
    const phone = normalizeOptionalValue(member?.phone)

    if (!memberName && (email || phone)) {
      return 'Add a roster member name before entering their email or phone number.'
    }
    if (memberName && /[\u0000-\u001f\u007f]/.test(memberName)) {
      return 'Roster member names cannot contain control characters.'
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return 'Roster member email is invalid. Leave it blank if not available.'
    }
    if (phone && !/^[+()\d\s-]{7,24}$/.test(phone)) {
      return 'Roster member phone number is invalid. Leave it blank if not available.'
    }
  }

  return null
}
