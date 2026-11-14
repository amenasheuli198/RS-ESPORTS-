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
  const normalizedMembers = Array.isArray(members) ? members.map((member) => ({
    member_name: normalizeOptionalValue(member?.member_name),
    email: normalizeOptionalValue(member?.email),
    phone: normalizeOptionalValue(member?.phone),
  })) : []

  if (normalizedMembers.length !== 4) {
    return 'Team registration requires exactly four members.'
  }

  for (let index = 0; index < normalizedMembers.length; index += 1) {
    const member = normalizedMembers[index]
    if (!member.member_name || member.member_name.length < 2 || member.member_name.length > 100) {
      return `Member ${index + 1} name is required and must be 2-100 characters.`
    }
    if (/[\u0000-\u001f\u007f]/.test(member.member_name)) {
      return `Member ${index + 1} name contains invalid characters.`
    }
    if (member.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(member.email)) {
      return `Member ${index + 1} email is invalid. Leave it blank if not available.`
    }
    if (member.phone && !/^[+()\d\s-]{7,24}$/.test(member.phone)) {
      return `Member ${index + 1} phone number is invalid. Leave it blank if not available.`
    }
  }

  return null
}
