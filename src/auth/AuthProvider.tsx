import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { AuthError, Session, User } from '@supabase/supabase-js'
import { getSupabaseClient, getSupabaseConfigurationError } from '../services/supabase/client'

interface AuthContextValue {
  client: ReturnType<typeof getSupabaseClient>
  user: User | null
  session: Session | null
  isLoading: boolean
  configurationError: string | null
  signIn: (email: string, password: string) => Promise<{ user: User | null; session: Session | null; error: AuthError | null }>
  signUp: (fullName: string, email: string, password: string) => Promise<{ user: User | null; session: Session | null; error: AuthError | null }>
  signOut: () => Promise<AuthError | null>
  sendPasswordReset: (email: string) => Promise<AuthError | null>
  updatePassword: (password: string) => Promise<AuthError | null>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [client] = useState(getSupabaseClient)
  const [configurationError] = useState(getSupabaseConfigurationError)
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!client) {
      setIsLoading(false)
      return
    }

    const { data: { subscription } } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setIsLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [client])

  async function signIn(email: string, password: string) {
    if (!client) throw new Error('SUPABASE_NOT_CONFIGURED')
    const { data, error } = await client.auth.signInWithPassword({ email, password })
    return { user: data.user, session: data.session, error }
  }

  async function signUp(fullName: string, email: string, password: string) {
    if (!client) throw new Error('SUPABASE_NOT_CONFIGURED')
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: new URL('/login', window.location.origin).toString(),
      },
    })
    return { user: data.user, session: data.session, error }
  }

  async function signOut() {
    if (!client) throw new Error('SUPABASE_NOT_CONFIGURED')
    const { error } = await client.auth.signOut()
    return error
  }

  async function sendPasswordReset(email: string) {
    if (!client) throw new Error('SUPABASE_NOT_CONFIGURED')
    const redirectTo = new URL('/reset-password', window.location.origin).toString()
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo })
    return error
  }

  async function updatePassword(password: string) {
    if (!client) throw new Error('SUPABASE_NOT_CONFIGURED')
    const { error } = await client.auth.updateUser({ password })
    return error
  }

  const value: AuthContextValue = {
    client,
    user: session?.user ?? null,
    session,
    isLoading,
    configurationError,
    signIn,
    signUp,
    signOut,
    sendPasswordReset,
    updatePassword,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}