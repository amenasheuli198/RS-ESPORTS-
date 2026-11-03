import { Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../../auth/AuthProvider'

function TeamPageHeader() {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const [errorMessage, setErrorMessage] = useState('')

  async function handleSignOut() {
    setErrorMessage('')
    try {
      const error = await signOut()
      if (error) throw error
      navigate('/', { replace: true })
    } catch {
      setErrorMessage('Unable to sign out. Please try again.')
    }
  }

  return (
    <header className="team-page-header page-width">
      <Link className="brand-lockup" to="/" aria-label="RS Esports home">
        <span className="brand-lockup__mark">RS</span><span className="brand-lockup__name">RS <b>ESPORTS</b></span>
      </Link>
      <nav aria-label="Account navigation">
        <Link to="/account">Account</Link>
        <button type="button" onClick={handleSignOut}>Sign out</button>
      </nav>
      {errorMessage && <span className="team-header-error" role="alert">{errorMessage}</span>}
    </header>
  )
}

export default TeamPageHeader