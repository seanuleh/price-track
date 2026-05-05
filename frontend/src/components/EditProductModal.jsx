import { useState } from 'react'
import pb from '../pb.js'
import Portal from './Portal.jsx'

export default function EditProductModal({ product, onClose, onSaved }) {
  const [name, setName]   = useState(product.name || '')
  const [url, setUrl]     = useState(product.url || '')
  const [brand, setBrand] = useState(product.brand || '')
  const [model, setModel] = useState(product.model || '')
  const [image, setImage] = useState(product.image_url || '')
  const [desc, setDesc]   = useState(product.description || '')
  const [interval, setInterval_] = useState(product.check_interval_minutes || '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!name.trim()) { setError('Product name is required'); return }
    setSaving(true)
    setError('')
    try {
      await pb.collection('products').update(product.id, {
        name: name.trim(),
        url: url.trim() || null,
        brand: brand.trim() || null,
        model: model.trim() || null,
        image_url: image.trim() || null,
        description: desc.trim() || null,
        check_interval_minutes: interval ? parseInt(interval, 10) : null,
      })
      onSaved()
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  return (
    <Portal><div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">Edit Product</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="field">
          <label>Name</label>
          <input value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div className="field">
          <label>URL</label>
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" />
        </div>
        <div className="field">
          <label>Brand</label>
          <input value={brand} onChange={e => setBrand(e.target.value)} />
        </div>
        <div className="field">
          <label>Model</label>
          <input value={model} onChange={e => setModel(e.target.value)} />
        </div>
        <div className="field">
          <label>Image URL</label>
          <input value={image} onChange={e => setImage(e.target.value)} />
        </div>
        {image && (
          <div style={{marginBottom:12}}>
            <img src={image} alt="preview" style={{height:80,objectFit:'contain',borderRadius:6,background:'var(--surface2)',padding:4}} onError={e=>e.target.style.display='none'} />
          </div>
        )}
        <div className="field">
          <label>Description</label>
          <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3} />
        </div>
        <div className="field">
          <label>Check Interval</label>
          <select value={interval} onChange={e => setInterval_(e.target.value)}>
            <option value="">Global default</option>
            <option value="30">Every 30 minutes</option>
            <option value="60">Every hour</option>
            <option value="120">Every 2 hours</option>
            <option value="240">Every 4 hours</option>
            <option value="720">Every 12 hours</option>
            <option value="1440">Every 24 hours</option>
          </select>
        </div>
        {error && <p className="error-msg">{error}</p>}
        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div></Portal>
  )
}
