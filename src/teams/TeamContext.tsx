import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import type { Team, TeamInvitation, TeamMember } from '../types/team'

interface TeamContextValue {
  team: Team | null
  membership: TeamMember | null
  roster: TeamMember[]
  outgoingInvitations: TeamInvitation[]
  incomingInvitations: TeamInvitation[]
  isLoading: boolean
  error: string | null
  refreshTeam: () => Promise<void>
}

const TeamContext = createContext<TeamContextValue | null>(null)

export function TeamProvider({ children }: { children?: ReactNode }) {
  const { client, user } = useAuth()
  const [team, setTeam] = useState<Team | null>(null)
  const [membership, setMembership] = useState<TeamMember | null>(null)
  const [roster, setRoster] = useState<TeamMember[]>([])
  const [outgoingInvitations, setOutgoingInvitations] = useState<TeamInvitation[]>([])
  const [incomingInvitations, setIncomingInvitations] = useState<TeamInvitation[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refreshTeam = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    if (!client || !user) {
      setTeam(null)
      setMembership(null)
      setRoster([])
      setOutgoingInvitations([])
      setIncomingInvitations([])
      setIsLoading(false)
      return
    }

    try {
      const { data: membershipData, error: membershipError } = await client.from('team_members')
        .select('id, team_id, user_id, ign, free_fire_uid, role, slot, status, joined_at')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle()
      if (membershipError) throw membershipError

      if (membershipData) {
        const { data: teamData, error: teamError } = await client.from('teams')
          .select('id, name, slug, game_code, format_code, logo_path, description, region, created_at, updated_at')
          .eq('id', membershipData.team_id)
          .maybeSingle()
        if (teamError) throw teamError
        if (!teamData) throw new Error('TEAM_UNAVAILABLE')

        const { data: rosterData, error: rosterError } = await client.rpc('get_team_roster', { p_team_id: teamData.id })
        if (rosterError) throw rosterError
        setTeam(teamData as Team)
        setMembership({
          member_id: membershipData.id,
          user_id: membershipData.user_id,
          ign: membershipData.ign,
          free_fire_uid: membershipData.free_fire_uid,
          role: membershipData.role,
          slot: membershipData.slot,
          status: membershipData.status,
          joined_at: membershipData.joined_at,
        } as TeamMember)
        setRoster((rosterData ?? []) as TeamMember[])

        if (membershipData.role === 'captain') {
          const { data, error: invitationsError } = await client.rpc('get_team_invitations', { p_team_id: teamData.id })
          if (invitationsError) throw invitationsError
          setOutgoingInvitations((data ?? []) as TeamInvitation[])
        } else {
          setOutgoingInvitations([])
        }
      } else {
        setTeam(null)
        setMembership(null)
        setRoster([])
        setOutgoingInvitations([])
      }

      const { data: incomingData, error: incomingError } = await client.rpc('get_my_team_invitations')
      if (incomingError) throw incomingError
      setIncomingInvitations((incomingData ?? []) as TeamInvitation[])
    } catch {
      setTeam(null)
      setMembership(null)
      setRoster([])
      setOutgoingInvitations([])
      setIncomingInvitations([])
      setError('Team information could not be loaded. Check your connection and database migration status.')
    } finally {
      setIsLoading(false)
    }
  }, [client, user])

  useEffect(() => {
    void refreshTeam()
  }, [refreshTeam])

  return (
    <TeamContext.Provider value={{ team, membership, roster, outgoingInvitations, incomingInvitations, isLoading, error, refreshTeam }}>
      {children ?? <Outlet />}
    </TeamContext.Provider>
  )
}

export function useTeam() {
  const context = useContext(TeamContext)
  if (!context) throw new Error('useTeam must be used within TeamProvider')
  return context
}