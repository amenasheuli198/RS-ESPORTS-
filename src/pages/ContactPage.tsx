import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { getSupabaseConfigurationError } from '../services/supabase/client'
import SiteHeader from '../components/SiteHeader'

const categories = ['general', 'account_login', 'team_management', 'tournament_registration', 'match_issues', 'results_scoring', 'technical', 'other']

function ContactPage() {
  const { client } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [category, setCategory] = useState('general')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [notice, setNotice] = useState('')
  const [isError, setIsError] = useState(false)
  const configurationError = getSupabaseConfigurationError()

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!client || configurationError) {
      setIsError(true)
      setNotice(configurationError ?? 'Contact form is unavailable right now.')
      return
    }

    if (name.trim().length < 2 || email.trim().length < 5 || subject.trim().length < 3 || message.trim().length < 20) {
      setIsError(true)
      setNotice('Please complete all required fields with enough detail to review your request.')
      return
    }

    try {
      setIsSubmitting(true)
      const { error } = await client.rpc('save_contact_request', {
        p_name: name.trim(),
        p_email: email.trim(),
        p_subject: subject.trim(),
        p_message: message.trim(),
        p_category: category,
      })

      if (error) {
        setIsError(true)
        setNotice('Your message could not be submitted. Please check your details and try again.')
      } else {
        setIsError(false)
        setNotice('Your message has been submitted. Our support team will review it shortly.')
        setName('')
        setEmail('')
        setSubject('')
        setMessage('')
        setCategory('general')
      }
    } catch {
      setIsError(true)
      setNotice('Your message could not be submitted. Please try again later.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <SiteHeader />
      <main className="page-width contact-page">
        <header className="announcements-heading">
          <div>
            <p className="section-heading__eyebrow">RS / SUPPORT</p>
            <h1>Contact the RS Esports team.</h1>
            <p>Use this form for general questions, support issues, or competition concerns.</p>
          </div>
        </header>

        <div className="contact-layout">
          <section className="profile-panel">
            <form className="profile-form" onSubmit={handleSubmit}>
              <label className="form-field">
                <span>Name</span>
                <input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} />
              </label>
              <label className="form-field">
                <span>Email</span>
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={180} />
              </label>
              <label className="form-field">
                <span>Category</span>
                <select value={category} onChange={(event) => setCategory(event.target.value)}>
                  {categories.map((option) => <option key={option} value={option}>{option.replaceAll('_', ' ')}</option>)}
                </select>
              </label>
              <label className="form-field">
                <span>Subject</span>
                <input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={180} />
              </label>
              <label className="form-field">
                <span>Message</span>
                <textarea rows={7} value={message} onChange={(event) => setMessage(event.target.value)} maxLength={5000} />
              </label>
              {notice && <p className={isError ? 'auth-error' : 'auth-success-message'} role="status">{notice}</p>}
              <button type="submit" className="auth-submit" disabled={isSubmitting}>
                {isSubmitting ? 'Sending...' : 'Send message'}
              </button>
            </form>
          </section>

          <aside className="player-profile-panel">
            <h2>Support quick info</h2>
            <p>We typically respond to general support requests within 24–48 hours during active competition periods.</p>
            <ul>
              <li>Account and access requests</li>
              <li>Tournament and registration issues</li>
              <li>Results and dispute intake</li>
              <li>Team and roster questions</li>
            </ul>
          </aside>
        </div>
      </main>
    </>
  )
}

export default ContactPage
