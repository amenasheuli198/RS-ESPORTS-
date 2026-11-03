import { useEffect, useMemo, useState } from 'react'
import { Save, ShieldCheck } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { getSupabaseConfigurationError } from '../services/supabase/client'

interface SettingRecord {
  id?: string
  setting_key: string
  setting_value: Record<string, unknown>
  setting_group: string
  description: string | null
  is_public: boolean
  updated_at?: string
}

const sectionOrder = ['general', 'branding', 'tournament_defaults', 'registration', 'match', 'notifications', 'player_team', 'content', 'maintenance', 'security']

function AdminSettingsPage() {
  const { client } = useAuth()
  const [settings, setSettings] = useState<Record<string, SettingRecord>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [notice, setNotice] = useState('')
  const configurationError = getSupabaseConfigurationError()

  const grouped = useMemo(() => {
    const groups: Record<string, SettingRecord[]> = {}
    Object.values(settings).forEach((setting) => {
      const group = setting.setting_group || 'general'
      groups[group] = groups[group] ?? []
      groups[group].push(setting)
    })
    return Object.fromEntries(sectionOrder.map((group) => [group, groups[group] ?? []]))
  }, [settings])

  useEffect(() => {
    async function loadSettings() {
      if (!client || configurationError) {
        setErrorMessage(configurationError ?? 'Platform settings are not available.')
        setIsLoading(false)
        return
      }

      try {
        const { data, error } = await client.rpc('get_private_platform_settings')
        if (error) throw error
        const next = (data ?? []) as SettingRecord[]
        const mapping = Object.fromEntries(next.map((item) => [item.setting_key, item]))
        setSettings(mapping)
      } catch {
        setErrorMessage('Unable to load private settings. Confirm admin authorization.')
      } finally {
        setIsLoading(false)
      }
    }

    void loadSettings()
  }, [client, configurationError])

  async function updateSetting(settingKey: string, value: Record<string, unknown>) {
    if (!client) return
    try {
      const record = settings[settingKey]
      const payload = value
      const { error } = await client.rpc('set_platform_setting', {
        p_setting_key: settingKey,
        p_setting_value: payload,
        p_setting_group: record?.setting_group ?? 'general',
        p_description: record?.description ?? '',
        p_is_public: record?.is_public ?? false,
        p_change_reason: 'Admin configuration update',
      })
      if (error) throw error
      setNotice(`${settingKey} saved successfully.`)
    } catch {
      setErrorMessage(`Unable to save ${settingKey}.`)
    }
  }

  function renderSettingField(setting: SettingRecord) {
    const value = setting.setting_value as Record<string, unknown>

    if (typeof value.value === 'boolean') {
      return (
        <label className="form-field" key={setting.setting_key}>
          <span>{setting.setting_key}</span>
          <select value={String(Boolean(value.value))} onChange={(event) => {
            const next = { ...value, value: event.target.value === 'true' }
            updateSetting(setting.setting_key, next)
          }}>
            <option value="true">Enabled</option>
            <option value="false">Disabled</option>
          </select>
        </label>
      )
    }

    return (
      <label className="form-field" key={setting.setting_key}>
        <span>{setting.setting_key}</span>
        <input value={typeof value.value === 'string' ? value.value : JSON.stringify(value.value ?? value)} onChange={(event) => {
          const next = { ...value, value: event.target.value }
          updateSetting(setting.setting_key, next)
        }} />
      </label>
    )
  }

  return (
    <main className="page-width admin-settings-page">
      <header className="announcements-heading">
        <div>
          <p className="section-heading__eyebrow">ADMIN / SETTINGS</p>
          <h1>Platform configuration.</h1>
          <p>Manage public defaults, maintenance, registration, branding, and platform behavior.</p>
        </div>
        <div className="admin-dashboard-header__actions">
          <button type="button" className="auth-submit" onClick={() => void setNotice('Settings saved in the trusted backend layer.')}><Save size={15} /> Save changes</button>
          <ShieldCheck size={16} />
        </div>
      </header>

      {errorMessage && <p className="admin-form-error" role="alert">{errorMessage}</p>}
      {notice && <p className="auth-success-message" role="status">{notice}</p>}

      {isLoading ? <p>Loading settings...</p> : (
        <div className="admin-dashboard-panels">
          {sectionOrder.map((section) => grouped[section]?.length ? (
            <section key={section} className="admin-dashboard-panel">
              <div className="admin-dashboard-panel__head">
                <h2>{section.replace(/_/g, ' ')}</h2>
              </div>
              <div className="profile-form">
                {grouped[section].map((setting) => renderSettingField(setting))}
              </div>
            </section>
          ) : null)}
        </div>
      )}
    </main>
  )
}

export default AdminSettingsPage
