import { useState } from 'react'
import pb from '../pb.js'

export default function AddProductModal({ onClose, onAdded }) {
  const [step, setStep]       = useState('form')   // 'form' | 'fetching' | 'confirm'
  const [url, setUrl]         = useState('')
  const [name, setName]       = useState('')
  const [brand, setBrand]     = useState('')
  const [image, setImage]     = useState('')
  const [desc, setDesc]       = useState('')
  const [error, setError]     = useState('')
  const [saving, setSaving]   = useState(false)

  const fetchMeta = async () => {
    if (!url.trim() && !name.trim()) { setError('Enter a URL or product name'); return }
    setError('')
    setStep('fetching')
    try {
      const res = await fetch('/api/price-track/fetch-meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': pb.authStore.token },
        body: JSON.stringify({ url: url.trim(), query: name.trim() }),
      })
      if (res.ok) {
        const data = await res.json()
        setName(data.name || name)
        setBrand(data.brand || '')
        setImage(data.image_url || '')
        setDesc(data.description || '')
        setStep('confirm')
      } else {
        // Worker not available — go straight to confirm with what we have
        setStep('confirm')
      }
    } catch {
      setStep('confirm')
    }
  }

  const save = async () => {
    if (!name.trim()) { setError('Product name is required'); return }
    setSaving(true)
    setError('')
    try {
      const record = await pb.collection('products').create({
        name: name.trim(),
        url: url.trim() || null,
        image_url: image.trim() || null,
        description: desc.trim() || null,
        brand: brand.trim() || null,
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
          <span className="modal-title">Add Product</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {step === 'fetching' && (
          <div style={{textAlign:'center', padding:'40px 0'}}>
            <div className="spinner" style={{width:32,height:32,borderWidth:3,margin:'0 auto 12px'}} />
            <p style={{color:'var(--text-muted)'}}>Fetching product info…</p>
          </div>
        )}

        {(step === 'form' || step === 'confirm') && (
          <>
            <div className="field">
              <label>Product URL (optional)</label>
              <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://amazon.com/dp/..." />
            </div>
            <div className="field">
              <label>Product Name {step === 'confirm' ? '' : '(or search query)'}</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Sony WH-1000XM5" />
            </div>
            {step === 'confirm' && (
              <>
                <div className="field">
                  <label>Brand</label>
                  <input value={brand} onChange={e => setBrand(e.target.value)} />
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
              </>
            )}
            {error && <p className="error-msg">{error}</p>}
            <div className="modal-footer">
              <button className="btn-ghost" onClick={onClose}>Cancel</button>
              {step === 'form' && (
                <button className="btn-primary" onClick={fetchMeta}>Next →</button>
              )}
              {step === 'confirm' && (
                <>
                  <button className="btn-ghost" onClick={() => setStep('form')}>← Back</button>
                  <button className="btn-primary" onClick={save} disabled={saving}>
                    {saving ? 'Saving…' : 'Save Product'}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
