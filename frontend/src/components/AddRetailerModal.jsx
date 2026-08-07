import { useState } from 'react'
import pb from '../pb.js'
import Portal from './Portal.jsx'

export default function AddRetailerModal({ product, onClose, onAdded }) {
  const [name, setName]     = useState('')
  const [url, setUrl]       = useState('')
  const [error, setError]   = useState('')
  const [saving, setSaving] = useState(false)
  const [detecting, setDetecting] = useState(false)

  const save = async () => {
    if (!url.trim())  { setError('URL is required'); return }
    setSaving(true)
    setError('')
    try {
      let finalName = name.trim()
      if (!finalName) {
        setDetecting(true)
        try {
          const res = await fetch('/api/price-track/retailer-name', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': pb.authStore.token },
            body: JSON.stringify({ url: url.trim() }),
          })
          if (res.ok) finalName = (await res.json()).name || ''
        } catch { /* fall through to hostname below */ }
        setDetecting(false)
        // Endpoint already falls back to the hostname; this covers it being down.
        if (!finalName) {
          try { finalName = new URL(url.trim()).hostname.replace(/^www\./, '') }
          catch { finalName = 'Unknown Retailer' }
        }
      }

      await pb.collection('retailers').create({
        product: product.id,
        name: finalName,
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
    <Portal><div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">Add Retailer</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div style={{color:'var(--text-muted)',fontSize:12,marginBottom:16}}>
          Tracking prices for: <strong style={{color:'var(--text)'}}>{product.name}</strong>
        </div>

        <div className="field">
          <label>Retailer Name <span style={{color:'var(--text-muted)',fontWeight:400}}>— optional, detected from the URL if blank</span></label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Leave blank to auto-detect" />
        </div>
        <div className="field">
          <label>Product URL at this retailer</label>
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." />
        </div>
{error && <p className="error-msg">{error}</p>}

        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {detecting ? 'Detecting name…' : saving ? 'Saving…' : 'Add Retailer'}
          </button>
        </div>
      </div>
    </div></Portal>
  )
}
