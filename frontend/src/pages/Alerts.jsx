import { useState, useEffect, useCallback } from 'react'
import pb from '../pb.js'
import Portal from '../components/Portal.jsx'

export default function Alerts() {
  const [alerts, setAlerts]     = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading]   = useState(true)
  const [showAdd, setShowAdd]   = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [al, pr] = await Promise.all([
        pb.collection('alerts').getFullList({ sort: '-created', expand: 'product' }),
        pb.collection('products').getFullList({ sort: 'name' }),
      ])
      setAlerts(al)
      setProducts(pr)
    } catch (e) {
      if (e.status === 401) { pb.authStore.clear(); window.location.reload() }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const deleteAlert = async (id) => {
    if (!confirm('Delete this alert?')) return
    await pb.collection('alerts').delete(id)
    setAlerts(prev => prev.filter(a => a.id !== id))
  }

  const toggleAlert = async (alert) => {
    const updated = await pb.collection('alerts').update(alert.id, { enabled: !alert.enabled })
    setAlerts(prev => prev.map(a => a.id === alert.id ? updated : a))
  }

  const conditionLabel = (c, price) => {
    if (c === 'below')      return `Price drops below $${price}`
    if (c === 'above')      return `Price rises above $${price}`
    if (c === 'any_change') return 'Any price change'
    if (c === 'any_drop')   return 'Any price drop'
    return c
  }

  if (loading) return <div className="empty-state"><div className="spinner" /></div>

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Alerts</h1>
        <button className="btn-primary" onClick={() => setShowAdd(true)}>+ Add Alert</button>
      </div>

      {alerts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🔔</div>
          <p>No alerts set up yet.</p>
          <button className="btn-primary" onClick={() => setShowAdd(true)}>Create your first alert</button>
        </div>
      ) : (
        <div className="alert-list">
          {alerts.map(a => {
            const product = a.expand?.product || products.find(p => p.id === a.product)
            return (
              <div key={a.id} className="alert-item">
                <div className="alert-info">
                  <div className="alert-product">{product?.name || '—'}</div>
                  <div className="alert-condition">{conditionLabel(a.condition, a.target_price)}</div>
                  {a.triggered_at && (
                    <div style={{fontSize:11,color:'var(--warning)',marginTop:4,fontWeight:500}}>
                      Last triggered: {new Date(a.triggered_at).toLocaleString('en-AU',{dateStyle:'short',timeStyle:'short'})}
                    </div>
                  )}
                </div>
                <div style={{display:'flex',alignItems:'center',gap:12}}>
                  <span className={`tag ${a.enabled ? 'tag-success' : 'tag-neutral'}`}>
                    {a.enabled ? 'Active' : 'Paused'}
                  </span>
                  <label className="toggle">
                    <input type="checkbox" checked={a.enabled || false} onChange={() => toggleAlert(a)} />
                    <span className="toggle-slider" />
                  </label>
                  <button className="btn-danger btn-sm" onClick={() => deleteAlert(a.id)}>✕</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showAdd && (
        <AddAlertModal products={products} onClose={() => setShowAdd(false)} onAdded={(a) => { setAlerts(prev => [a, ...prev]); setShowAdd(false) }} />
      )}
    </>
  )
}

function AddAlertModal({ products, onClose, onAdded }) {
  const [productId, setProductId]   = useState(products[0]?.id || '')
  const [condition, setCondition]   = useState('below')
  const [targetPrice, setTargetPrice] = useState('')
  const [error, setError]           = useState('')
  const [saving, setSaving]         = useState(false)

  const save = async () => {
    if (!productId)                         { setError('Select a product'); return }
    if (condition !== 'any_change' && condition !== 'any_drop' && !targetPrice) { setError('Enter a target price'); return }
    setSaving(true)
    try {
      const record = await pb.collection('alerts').create({
        product: productId,
        condition,
        target_price: (condition === 'any_change' || condition === 'any_drop') ? null : parseFloat(targetPrice),
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
          <span className="modal-title">Add Alert</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="field">
          <label>Product</label>
          <select value={productId} onChange={e => setProductId(e.target.value)}>
            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Condition</label>
          <select value={condition} onChange={e => setCondition(e.target.value)}>
            <option value="below">Price drops below</option>
            <option value="above">Price rises above</option>
            <option value="any_change">Any price change</option>
            <option value="any_drop">Any price drop</option>
          </select>
        </div>
        {condition !== 'any_change' && condition !== 'any_drop' && (
          <div className="field">
            <label>Target Price ($)</label>
            <input type="number" step="0.01" min="0" value={targetPrice} onChange={e => setTargetPrice(e.target.value)} placeholder="0.00" />
          </div>
        )}

        {error && <p className="error-msg">{error}</p>}

        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Create Alert'}
          </button>
        </div>
      </div>
    </div></Portal>
  )
}
