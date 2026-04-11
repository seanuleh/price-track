import { useState } from 'react'
import pb from '../pb.js'
import Portal from './Portal.jsx'

export default function FindRetailersModal({ product, onClose, onAdded }) {
  const [loading, setLoading]     = useState(false)
  const [statusLines, setStatus]  = useState([])
  const [results, setResults]     = useState(null)
  const [selected, setSelected]   = useState({})
  const [existing, setExisting]   = useState([])
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  const find = async () => {
    setLoading(true)
    setError('')
    setResults(null)
    setSelected({})
    setStatus([])

    try {
      const existingRetailers = await pb.collection('retailers').getFullList({
        filter: `product="${product.id}"`,
      })
      setExisting(existingRetailers)

      const params = new URLSearchParams({
        product_name: product.name,
        ...(product.brand && { brand: product.brand }),
        ...(product.model && { model: product.model }),
        ...(product.url   && { url: product.url }),
        existing: JSON.stringify(existingRetailers.map(e => ({ name: e.name, url: e.url }))),
      })

      const response = await fetch(`/api/price-track/find-retailers-stream?${params}`, {
        headers: { Authorization: pb.authStore.token },
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const parts = buf.split('\n\n')
        buf = parts.pop()

        for (const part of parts) {
          const eventLine = part.match(/^event: (.+)$/m)?.[1]
          const dataLine  = part.match(/^data: (.+)$/m)?.[1]
          if (!dataLine) continue
          const payload = JSON.parse(dataLine)

          if (eventLine === 'status') {
            setStatus(prev => [...prev, payload.message])
          } else if (eventLine === 'done') {
            const retailers = payload.retailers || []
            if (!retailers.length) {
              setError('No Australian retailers found for this product.')
            } else {
              setResults(retailers)
              const sel = {}
              retailers.forEach((r, i) => {
                const alreadyAdded = existingRetailers.some(e =>
                  e.url === r.url || e.name.toLowerCase() === r.name.toLowerCase()
                )
                sel[i] = !alreadyAdded
              })
              setSelected(sel)
            }
          } else if (eventLine === 'error') {
            throw new Error(payload.message)
          }
        }
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const toggle = (i) => {
    const alreadyAdded = existing.some(e =>
      e.url === results[i].url || e.name.toLowerCase() === results[i].name.toLowerCase()
    )
    if (alreadyAdded) return
    setSelected(prev => ({ ...prev, [i]: !prev[i] }))
  }

  const addSelected = async () => {
    const toAdd = results.filter((_, i) => selected[i])
    if (!toAdd.length) { setError('Select at least one retailer'); return }
    setSaving(true)
    setError('')
    try {
      for (const r of toAdd) {
        await pb.collection('retailers').create({
          product: product.id,
          name: r.name,
          url: r.url,
          enabled: true,
          user: pb.authStore.model?.id,
        })
      }
      onAdded()
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  return (
    <Portal><div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">Find Australian Retailers</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div style={{color:'var(--text-muted)',fontSize:12,marginBottom:16}}>
          Claude will search for Australian retailers selling <strong style={{color:'var(--text)'}}>{product.name}</strong>
        </div>

        {!results && !loading && (
          <button className="btn-primary" onClick={find} style={{width:'100%'}}>
            Search for Australian Retailers
          </button>
        )}

        {loading && (
          <div style={{padding:'4px 0'}}>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:statusLines.length ? 10 : 0,color:'var(--text-muted)'}}>
              <span className="spinner" style={{width:16,height:16,borderWidth:2,flexShrink:0}} />
              <span style={{fontSize:13}}>Searching… this may take 15–30 seconds</span>
            </div>
            {statusLines.length > 0 && (
              <div style={{
                background:'var(--surface2)',borderRadius:8,padding:'10px 12px',
                fontSize:12,display:'flex',flexDirection:'column',gap:5,
                maxHeight:160,overflowY:'auto',
              }}>
                {statusLines.map((line, i) => {
                  const isLast = i === statusLines.length - 1
                  return (
                    <div key={i} style={{display:'flex',gap:7,alignItems:'flex-start',color: isLast ? 'var(--text)' : 'var(--text-muted)'}}>
                      <span style={{flexShrink:0,marginTop:1}}>{isLast ? '›' : '✓'}</span>
                      {line}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {results && (
          <>
            <div style={{fontSize:13,marginBottom:12,color:'var(--text-muted)'}}>
              Found {results.length} retailer{results.length !== 1 ? 's' : ''}. Select which to add:
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:16}}>
              {results.map((r, i) => {
                const alreadyAdded = existing.some(e =>
                  e.url === r.url || e.name.toLowerCase() === r.name.toLowerCase()
                )
                const isChecked = !alreadyAdded && !!selected[i]
                return (
                  <div key={i} onClick={() => toggle(i)} style={{
                    display:'grid', gridTemplateColumns:'18px 1fr auto', alignItems:'center', gap:10,
                    cursor: alreadyAdded ? 'default' : 'pointer',
                    padding:'10px 12px', borderRadius:8,
                    border:`1px solid ${isChecked ? 'var(--accent)' : 'var(--border)'}`,
                    background: isChecked ? 'var(--accent-light)' : 'transparent',
                    opacity: alreadyAdded ? 0.45 : 1,
                    transition:'all 0.15s', overflow:'hidden'}}>
                    <div style={{
                      width:16, height:16, borderRadius:4, flexShrink:0,
                      border:`2px solid ${isChecked ? 'var(--accent)' : 'var(--border)'}`,
                      background: isChecked ? 'var(--accent)' : 'transparent',
                      display:'flex', alignItems:'center', justifyContent:'center',
                      transition:'all 0.15s',
                    }}>
                      {isChecked && <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </div>
                    <div style={{minWidth:0,overflow:'hidden'}}>
                      <div style={{fontWeight:500,fontSize:14,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:'var(--text)'}}>{r.name}</div>
                      <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.url}</div>
                    </div>
                    {alreadyAdded && <span style={{fontSize:11,color:'var(--text-muted)',whiteSpace:'nowrap'}}>Already added</span>}
                  </div>
                )
              })}
            </div>
            <button className="btn-ghost btn-sm" onClick={find} disabled={loading} style={{marginBottom:12}}>
              ↻ Search Again
            </button>
          </>
        )}

        {error && <p className="error-msg">{error}</p>}

        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          {results && (
            <button className="btn-primary" onClick={addSelected} disabled={saving || !Object.values(selected).some(Boolean)}>
              {saving ? 'Adding…' : `Add ${Object.values(selected).filter(Boolean).length} Retailer${Object.values(selected).filter(Boolean).length !== 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      </div>
    </div></Portal>
  )
}
