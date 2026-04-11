import { useState, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import pb from '../pb.js'
import AddRetailerModal from './AddRetailerModal.jsx'
import FindRetailersModal from './FindRetailersModal.jsx'
import EditProductModal from './EditProductModal.jsx'

export default function ProductDetail({ product, retailers, history, onBack, onUpdated, onDeleted }) {
  const [showAddRetailer, setShowAddRetailer]   = useState(false)
  const [showFindRetailers, setShowFindRetailers] = useState(false)
  const [showEdit, setShowEdit]                 = useState(false)
  const [scraping, setScraping]             = useState({})
  const [scrapingAll, setScrapingAll]       = useState(false)
  const [scrapeErr, setScrapeErr]           = useState({})
  const [deletingRet, setDeletingRet]       = useState(null)
  const [sortCol, setSortCol]               = useState('price')
  const [sortAsc, setSortAsc]               = useState(true)

  const sortedRetailers = useMemo(() => {
    const sorted = [...retailers].sort((a, b) => {
      if (sortCol === 'price') {
        const pa = a.last_price ?? Infinity
        const pb_ = b.last_price ?? Infinity
        return sortAsc ? pa - pb_ : pb_ - pa
      }
      const na = (a.name || '').toLowerCase()
      const nb = (b.name || '').toLowerCase()
      return sortAsc ? na.localeCompare(nb) : nb.localeCompare(na)
    })
    return sorted
  }, [retailers, sortCol, sortAsc])

  const toggleSort = (col) => {
    if (sortCol === col) setSortAsc(!sortAsc)
    else { setSortCol(col); setSortAsc(true) }
  }

  const scrapeRetailer = async (retailer) => {
    setScraping(prev => ({ ...prev, [retailer.id]: true }))
    setScrapeErr(prev => ({ ...prev, [retailer.id]: null }))
    try {
      const res = await fetch('/api/price-track/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': pb.authStore.token },
        body: JSON.stringify({ retailer_id: retailer.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Scrape failed')
      await onUpdated()
    } catch (e) {
      setScrapeErr(prev => ({ ...prev, [retailer.id]: e.message }))
    } finally {
      setScraping(prev => ({ ...prev, [retailer.id]: false }))
    }
  }

  const scrapeAll = async () => {
    setScrapingAll(true)
    setScrapeErr({})
    const enabled = retailers.filter(r => r.enabled !== false)
    const pendingIds = new Set(enabled.map(r => r.id))

    // Mirror is_scraping from PocketBase in real time
    pb.collection('retailers').subscribe('*', (e) => {
      if (!pendingIds.has(e.record.id)) return
      setScraping(prev => ({ ...prev, [e.record.id]: !!e.record.is_scraping }))
      onUpdated()
      if (!e.record.is_scraping) {
        pendingIds.delete(e.record.id)
        if (pendingIds.size === 0) {
          pb.collection('retailers').unsubscribe()
          setScrapingAll(false)
        }
      }
    })

    // Fire and forget — don't await
    fetch('/api/price-track/check-all', {
      method: 'POST',
      headers: { 'Authorization': pb.authStore.token },
    }).catch(e => console.error('check-all failed:', e.message))
  }

  const deleteRetailer = async (ret) => {
    if (!confirm(`Remove ${ret.name}?`)) return
    setDeletingRet(ret.id)
    try {
      await pb.collection('retailers').delete(ret.id)
      await onUpdated()
    } catch (e) {
      alert(e.message)
    } finally {
      setDeletingRet(null)
    }
  }

  const deleteProduct = async () => {
    if (!confirm(`Delete "${product.name}" and all its data?`)) return
    try {
      await pb.collection('products').delete(product.id)
      onDeleted(product.id)
    } catch (e) {
      alert(e.message)
    }
  }

  const COLORS = ['#6366f1','#22c55e','#f59e0b','#ef4444','#06b6d4','#a855f7']

  const WINDOWS = [
    { label: '1D', days: 1 },
    { label: '1W', days: 7 },
    { label: '1M', days: 30 },
    { label: '6M', days: 180 },
    { label: '1Y', days: 365 },
    { label: 'All', days: null },
  ]
  const [chartWindow, setChartWindow] = useState(() => localStorage.getItem('priceChartWindow') || '1M')

  const data = useMemo(() => {
    const selectedDays = WINDOWS.find(w => w.label === chartWindow)?.days
    const cutoff = selectedDays ? Date.now() - selectedDays * 86400000 : 0
    const filtered = history.filter(h => new Date(h.created).getTime() >= cutoff)
    const points = {}
    filtered.forEach(h => {
      const ts = new Date(h.created).getTime()
      if (!points[ts]) points[ts] = { ts, label: new Date(h.created).toLocaleDateString('en-AU', {day:'numeric',month:'short'}) }
      const ret = retailers.find(r => r.id === h.retailer)
      if (ret) points[ts][ret.name] = h.price
    })
    return Object.values(points).sort((a, b) => a.ts - b.ts)
  }, [history, retailers, chartWindow])

  return (
    <>
      <button className="detail-back" onClick={onBack}>← Back to products</button>

      <div className="detail-header">
        {product.image_url
          ? <img className="detail-img" src={product.image_url} alt={product.name} onError={e=>e.target.style.display='none'} />
          : <div className="detail-img" style={{display:'flex',alignItems:'center',justifyContent:'center',fontSize:48}}>📦</div>
        }
        <div className="detail-meta">
          <h1 className="detail-name">{product.name}</h1>
          {product.brand && <div className="detail-brand">{product.brand} {product.model && `· ${product.model}`}</div>}
          {product.description && <p className="detail-desc">{product.description}</p>}
          {product.url && <a href={product.url} target="_blank" rel="noopener" style={{fontSize:12,marginTop:6,display:'block'}}>View product page ↗</a>}
        </div>
        <div style={{display:'flex',gap:8,flexShrink:0}}>
          <button className="btn-ghost btn-sm" onClick={() => setShowEdit(true)}>Edit</button>
          <button className="btn-danger btn-sm" onClick={deleteProduct}>Delete</button>
        </div>
      </div>

      {/* Price history chart */}
      {history.length > 0 && (
        <div className="card" style={{marginBottom:24}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
            <div style={{fontWeight:600}}>Price History</div>
          </div>
          <div className="window-pills">
            {WINDOWS.map(w => (
              <button
                key={w.label}
                className={`pill${chartWindow === w.label ? ' active' : ''}`}
                onClick={() => { setChartWindow(w.label); localStorage.setItem('priceChartWindow', w.label) }}
              >{w.label}</button>
            ))}
          </div>
          {data.length === 0 && <div style={{color:'var(--text-muted)',fontSize:13,padding:'24px 0',textAlign:'center'}}>No data in this period</div>}
          {data.length > 0 && <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{top:4,right:16,left:0,bottom:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{fill:'var(--text-muted)',fontSize:11}} tickLine={false} axisLine={false} />
                <YAxis
                  tick={{fill:'var(--text-muted)',fontSize:11}}
                  tickFormatter={v=>`$${v.toLocaleString()}`}
                  tickLine={false}
                  axisLine={false}
                  width={64}
                  domain={['auto','auto']}
                />
                <Tooltip
                  contentStyle={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,fontSize:13}}
                  labelStyle={{color:'var(--text-muted)',marginBottom:4}}
                  formatter={(v, name) => [`$${v.toLocaleString('en-AU',{minimumFractionDigits:2,maximumFractionDigits:2})}`, name]}
                />
                {retailers.map((r, i) => (
                  <Line
                    key={r.id}
                    type="stepAfter"
                    dataKey={r.name}
                    stroke={COLORS[i % COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{r:4,strokeWidth:0}}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>}
          {/* Legend */}
          <div style={{display:'flex',flexWrap:'wrap',gap:'8px 16px',marginTop:12}}>
            {retailers.map((r, i) => (
              <div key={r.id} style={{display:'flex',alignItems:'center',gap:6,fontSize:12}}>
                <div style={{width:12,height:3,borderRadius:2,background:COLORS[i%COLORS.length]}} />
                <span>{r.name}</span>
                {r.last_price && <span style={{color:'var(--text-muted)'}}>${r.last_price.toLocaleString('en-AU',{minimumFractionDigits:2})}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Retailers table */}
      <div className="retailers-header">
        <span style={{fontWeight:600}}>Retailers</span>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          {retailers.length > 0 && (
            <button className="btn-ghost btn-sm" onClick={scrapeAll} disabled={scrapingAll || Object.values(scraping).some(Boolean)}>
              {scrapingAll ? <><span className="spinner" style={{width:10,height:10,borderWidth:2,display:'inline-block',verticalAlign:'middle',marginRight:4}} />Checking…</> : '↻ Check All'}
            </button>
          )}
          <button className="btn-ghost btn-sm" onClick={() => setShowFindRetailers(true)}>Find AU Retailers</button>
          <button className="btn-primary btn-sm" onClick={() => setShowAddRetailer(true)}>+ Add Retailer</button>
        </div>
      </div>

      {retailers.length === 0 ? (
        <div className="empty-state" style={{padding:'24px 0'}}>
          <p style={{marginBottom:10}}>No retailers tracked yet.</p>
          <button className="btn-primary btn-sm" onClick={() => setShowAddRetailer(true)}>Add a retailer</button>
        </div>
      ) : (
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <table className="retailers-table">
            <thead>
              <tr>
                <th className="sortable" onClick={() => toggleSort('name')}>
                  Retailer {sortCol === 'name' ? (sortAsc ? '▲' : '▼') : ''}
                </th>
                <th className="sortable" onClick={() => toggleSort('price')}>
                  Current Price {sortCol === 'price' ? (sortAsc ? '▲' : '▼') : ''}
                </th>
                <th className="col-last-checked">Last Checked</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sortedRetailers.map((r, i) => {
                const retHistory = history.filter(h => h.retailer === r.id).sort((a,b) => new Date(b.created) - new Date(a.created))
                const prev = retHistory[1]
                const change = prev && r.last_price ? r.last_price - prev.price : null
                return (
                  <tr key={r.id}>
                    <td>
                      <div style={{fontWeight:500}}>{r.name}</div>
                      {r.url && <a href={r.url} target="_blank" rel="noopener" style={{fontSize:11,color:'var(--text-muted)'}}>View ↗</a>}
                    </td>
                    <td>
                      {r.last_price
                        ? <><span style={{fontWeight:700,color:COLORS[i%COLORS.length]}}>${r.last_price.toFixed(2)}</span>
                            {change !== null && (
                              <span className={`price-change ${change > 0 ? 'up' : 'down'}`}>
                                {change > 0 ? '▲' : '▼'} ${Math.abs(change).toFixed(2)}
                              </span>
                            )}
                          </>
                        : <span style={{color:'var(--text-muted)'}}>—</span>
                      }
                    </td>
                    <td className="col-last-checked" style={{color:'var(--text-muted)',fontSize:12}}>
                      {r.last_checked ? new Date(r.last_checked).toLocaleString('en-AU',{dateStyle:'short',timeStyle:'short'}) : 'Never'}
                    </td>
                    <td>
                      <label className="toggle">
                        <input type="checkbox" checked={r.enabled !== false} onChange={async e => {
                          await pb.collection('retailers').update(r.id, { enabled: e.target.checked })
                          await onUpdated()
                        }} />
                        <span className="toggle-slider" />
                      </label>
                    </td>
                    <td>
                      <div style={{display:'flex',gap:6,justifyContent:'flex-end'}}>
                        <button
                          className="btn-ghost btn-sm"
                          onClick={() => scrapeRetailer(r)}
                          disabled={!!scraping[r.id]}
                        >
                          {scraping[r.id] ? <span className="spinner" style={{width:12,height:12,borderWidth:2}} /> : '↻ Check'}
                        </button>
                        <button
                          className="btn-danger btn-sm"
                          onClick={() => deleteRetailer(r)}
                          disabled={deletingRet === r.id}
                        >
                          ✕
                        </button>
                      </div>
                      {scrapeErr[r.id] && <div className="error-msg">{scrapeErr[r.id]}</div>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showAddRetailer && (
        <AddRetailerModal
          product={product}
          onClose={() => setShowAddRetailer(false)}
          onAdded={async () => { setShowAddRetailer(false); await onUpdated() }}
        />
      )}

      {showEdit && (
        <EditProductModal
          product={product}
          onClose={() => setShowEdit(false)}
          onSaved={async () => { setShowEdit(false); await onUpdated() }}
        />
      )}

      {showFindRetailers && (
        <FindRetailersModal
          product={product}
          onClose={() => setShowFindRetailers(false)}
          onAdded={async () => { setShowFindRetailers(false); await onUpdated() }}
        />
      )}
    </>
  )
}
