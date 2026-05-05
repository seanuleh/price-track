import { useState, useEffect, useCallback } from 'react'
import pb from '../pb.js'
import Portal from '../components/Portal.jsx'

const CHANNEL_TYPES = {
  pushbullet: { label: 'Pushbullet', fields: [{ key: 'api_key', label: 'API Key', type: 'password' }] },
  webhook:    { label: 'Webhook',    fields: [{ key: 'url', label: 'Webhook URL', type: 'url' }, { key: 'secret', label: 'Secret (optional)', type: 'text' }] },
  email:      { label: 'Email',      fields: [{ key: 'address', label: 'Email Address', type: 'email' }] },
}

const INTERVAL_OPTIONS = [
  { value: '', label: 'Use server default' },
  { value: '30', label: 'Every 30 minutes' },
  { value: '60', label: 'Every hour' },
  { value: '120', label: 'Every 2 hours' },
  { value: '240', label: 'Every 4 hours' },
  { value: '720', label: 'Every 12 hours' },
  { value: '1440', label: 'Every 24 hours' },
]

export default function Settings() {
  const [channels, setChannels] = useState([])
  const [loading, setLoading]   = useState(true)
  const [showAdd, setShowAdd]   = useState(false)
  const [editing, setEditing]   = useState(null) // channel object being edited
  const [globalInterval, setGlobalInterval] = useState('')
  const [intervalSaving, setIntervalSaving] = useState(false)
  const [intervalSaved, setIntervalSaved]   = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [chs, user] = await Promise.all([
        pb.collection('notification_channels').getFullList({ sort: 'name' }),
        pb.collection('users').getOne(pb.authStore.model?.id),
      ])
      setChannels(chs)
      setGlobalInterval(user.default_check_interval_minutes ? String(user.default_check_interval_minutes) : '')
    } catch (e) {
      if (e.status === 401) { pb.authStore.clear(); window.location.reload() }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const saveInterval = async (val) => {
    setGlobalInterval(val)
    setIntervalSaving(true)
    setIntervalSaved(false)
    try {
      await pb.collection('users').update(pb.authStore.model?.id, {
        default_check_interval_minutes: val ? parseInt(val, 10) : null,
      })
      setIntervalSaved(true)
      setTimeout(() => setIntervalSaved(false), 2000)
    } catch (e) {
      console.error('Failed to save interval:', e.message)
    } finally {
      setIntervalSaving(false)
    }
  }

  const deleteChannel = async (id) => {
    if (!confirm('Delete this notification channel?')) return
    await pb.collection('notification_channels').delete(id)
    setChannels(prev => prev.filter(c => c.id !== id))
  }

  const toggleChannel = async (ch) => {
    const updated = await pb.collection('notification_channels').update(ch.id, { enabled: !ch.enabled })
    setChannels(prev => prev.map(c => c.id === ch.id ? updated : c))
  }

  const testChannel = async (ch) => {
    try {
      const res = await fetch('/api/price-track/test-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': pb.authStore.token },
        body: JSON.stringify({ channel_id: ch.id }),
      })
      const data = await res.json()
      alert(res.ok ? '✅ Test notification sent!' : `❌ ${data.error}`)
    } catch {
      alert('❌ Worker unavailable')
    }
  }

  if (loading) return <div className="empty-state"><div className="spinner" /></div>

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
      </div>

      <div className="card" style={{marginBottom: 28, padding: '18px 20px'}}>
        <div style={{fontWeight: 600, fontSize: 15, marginBottom: 14}}>General</div>
        <div className="field" style={{marginBottom: 0}}>
          <label>Default Check Interval</label>
          <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
            <select
              value={globalInterval}
              onChange={e => saveInterval(e.target.value)}
              disabled={intervalSaving}
              style={{flex: 1}}
            >
              {INTERVAL_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {intervalSaving && <span className="spinner" style={{width: 14, height: 14, borderWidth: 2}} />}
            {intervalSaved && <span style={{color: 'var(--success)', fontSize: 13}}>Saved</span>}
          </div>
          <div style={{fontSize: 12, color: 'var(--text-muted)', marginTop: 5}}>
            How often to check prices. Individual products can override this.
          </div>
        </div>
      </div>

      <div className="page-header" style={{marginBottom: 8}}>
        <h2 style={{fontSize: 17, fontWeight: 600, margin: 0}}>Notification Channels</h2>
        <button className="btn-primary" onClick={() => setShowAdd(true)}>+ Add Channel</button>
      </div>

      <p className="page-description">
        Notifications are sent when an alert condition is met. Add channels here, then enable them.
      </p>

      {channels.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📨</div>
          <p>No notification channels configured.</p>
          <button className="btn-primary" onClick={() => setShowAdd(true)}>Add a channel</button>
        </div>
      ) : (
        <div className="channel-list">
          {channels.map(ch => {
            const typeInfo = CHANNEL_TYPES[ch.type]
            return (
              <div key={ch.id} className="channel-item">
                <div className="channel-info">
                  <div className="channel-name">{ch.name}</div>
                  <div className="channel-type">{typeInfo?.label || ch.type}</div>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <span className={`tag ${ch.enabled ? 'tag-success' : 'tag-neutral'}`}>
                    {ch.enabled ? 'Active' : 'Paused'}
                  </span>
                  <label className="toggle">
                    <input type="checkbox" checked={ch.enabled || false} onChange={() => toggleChannel(ch)} />
                    <span className="toggle-slider" />
                  </label>
                  <button className="btn-ghost btn-sm" onClick={() => testChannel(ch)}>Test</button>
                  <button className="btn-ghost btn-sm" onClick={() => setEditing(ch)} title="Edit channel">✎</button>
                  <button className="btn-danger btn-sm" onClick={() => deleteChannel(ch.id)}>✕</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showAdd && (
        <AddChannelModal
          onClose={() => setShowAdd(false)}
          onAdded={(ch) => { setChannels(prev => [...prev, ch]); setShowAdd(false) }}
        />
      )}
      {editing && (
        <EditChannelModal
          channel={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => { setChannels(prev => prev.map(c => c.id === updated.id ? updated : c)); setEditing(null) }}
        />
      )}
    </>
  )
}

function EditChannelModal({ channel, onClose, onSaved }) {
  const [type, setType]     = useState(channel.type)
  const [name, setName]     = useState(channel.name)
  const [config, setConfig] = useState(channel.config || {})
  const [error, setError]   = useState('')
  const [saving, setSaving] = useState(false)

  const fields = CHANNEL_TYPES[type]?.fields || []

  const save = async () => {
    if (!name.trim()) { setError('Name is required'); return }
    for (const f of fields) {
      if (!f.optional && !config[f.key]?.trim()) { setError(`${f.label} is required`); return }
    }
    setSaving(true)
    try {
      const updated = await pb.collection('notification_channels').update(channel.id, {
        type,
        name: name.trim(),
        config,
      })
      onSaved(updated)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Portal><div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">Edit Notification Channel</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="field">
          <label>Channel Type</label>
          <select value={type} onChange={e => { setType(e.target.value); setConfig({}) }}>
            {Object.entries(CHANNEL_TYPES).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Display Name</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder={`My ${CHANNEL_TYPES[type]?.label}`} />
        </div>

        {fields.map(f => (
          <div key={f.key} className="field">
            <label>{f.label}</label>
            <input
              type={f.type || 'text'}
              value={config[f.key] || ''}
              onChange={e => setConfig(prev => ({ ...prev, [f.key]: e.target.value }))}
            />
          </div>
        ))}

        {type === 'pushbullet' && (
          <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:12}}>
            Get your API key at <a href="https://www.pushbullet.com/#settings" target="_blank" rel="noopener">pushbullet.com/settings</a> → Access Tokens.
          </div>
        )}

        {error && <p className="error-msg">{error}</p>}

        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div></Portal>
  )
}

function AddChannelModal({ onClose, onAdded }) {
  const [type, setType]     = useState('pushbullet')
  const [name, setName]     = useState('')
  const [config, setConfig] = useState({})
  const [error, setError]   = useState('')
  const [saving, setSaving] = useState(false)

  const fields = CHANNEL_TYPES[type]?.fields || []

  const save = async () => {
    if (!name.trim()) { setError('Name is required'); return }
    for (const f of fields) {
      if (!f.optional && !config[f.key]?.trim()) { setError(`${f.label} is required`); return }
    }
    setSaving(true)
    try {
      const record = await pb.collection('notification_channels').create({
        type,
        name: name.trim(),
        config,
        enabled: true,
        user: pb.authStore.model?.id,
      })
      onAdded(record)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Portal><div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">Add Notification Channel</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="field">
          <label>Channel Type</label>
          <select value={type} onChange={e => { setType(e.target.value); setConfig({}) }}>
            {Object.entries(CHANNEL_TYPES).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Display Name</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder={`My ${CHANNEL_TYPES[type]?.label}`} />
        </div>

        {fields.map(f => (
          <div key={f.key} className="field">
            <label>{f.label}</label>
            <input
              type={f.type || 'text'}
              value={config[f.key] || ''}
              onChange={e => setConfig(prev => ({ ...prev, [f.key]: e.target.value }))}
            />
          </div>
        ))}

        {type === 'pushbullet' && (
          <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:12}}>
            Get your API key at <a href="https://www.pushbullet.com/#settings" target="_blank" rel="noopener">pushbullet.com/settings</a> → Access Tokens.
          </div>
        )}

        {error && <p className="error-msg">{error}</p>}

        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Add Channel'}
          </button>
        </div>
      </div>
    </div></Portal>
  )
}
