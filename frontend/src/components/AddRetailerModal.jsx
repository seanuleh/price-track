import { useState } from 'react'
import pb from '../pb.js'

export default function AddRetailerModal({ product, onClose, onAdded }) {
  const [name, setName]     = useState('')
  const [url, setUrl]       = useState('')
  const [error, setError]   = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!name.trim()) { setError('Retailer name is required'); return }
    if (!url.trim())  { setError('URL is required'); return }
    setSaving(true)
    setError('')
    try {
      await pb.collection('retailers').create({
        product: product.id,
        name: name.trim(),
        url: url.trim(),
        enabled: true,
        user: pb.authStore.model?.id,
      })
      onAdded()
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
          <span className="modal-title">Add Retailer</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div style={{color:'var(--text-muted)',fontSize:12,marginBottom:16}}>
          Tracking prices for: <strong style={{color:'var(--text)'}}>{product.name}</strong>
        </div>

        <div className="field">
          <label>Retailer Name</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Amazon AU, JB Hi-Fi" />
        </div>
        <div className="field">
          <label>Product URL at this retailer</label>
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." />
        </div>
{error && <p className="error-msg">{error}</p>}

        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Add Retailer'}
          </button>
        </div>
      </div>
    </div>
  )
}
