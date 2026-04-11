import { useState, useEffect, useCallback } from 'react'
import pb from '../pb.js'

const CHANNEL_TYPES = {
  pushbullet: { label: 'Pushbullet', fields: [{ key: 'api_key', label: 'API Key', type: 'password' }] },
  webhook:    { label: 'Webhook',    fields: [{ key: 'url', label: 'Webhook URL', type: 'url' }, { key: 'secret', label: 'Secret (optional)', type: 'text' }] },
  email:      { label: 'Email',      fields: [{ key: 'address', label: 'Email Address', type: 'email' }] },
}

export default function Settings() {
  const [channels, setChannels] = useState([])
  const [loading, setLoading]   = useState(true)
  const [showAdd, setShowAdd]   = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const chs = await pb.collection('notification_channels').getFullList({ sort: 'name' })
      setChannels(chs)
    } catch (e) {
      if (e.status === 401) { pb.authStore.clear(); window.location.reload() }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

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
        <h1 className="page-title">Notification Channels</h1>
        <button className="btn-primary" onClick={() => setShowAdd(true)}>+ Add Channel</button>
      </div>

      <div style={{color:'var(--text-muted)',fontSize:13,marginBottom:20}}>
        Notifications are sent when an alert condition is met. Add channels here, then enable them.
      </div>

      {channels.length === 0 ? (
        <div className="empty-state">
          <p style={{marginBottom:12}}>No notification channels configured.</p>
          <button className="btn-primary" onClick={() => setShowAdd(true)}>Add Pushbullet or webhook</button>
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
    </>
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
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
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
    </div>
  )
}
