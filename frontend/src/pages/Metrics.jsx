import { useState, useEffect, useCallback } from 'react'
import pb from '../pb.js'

function fmt(ms) {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function timeAgo(dateStr) {
  if (!dateStr) return '—'
  const diff = Date.now() - new Date(dateStr).getTime()
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

function StatusBadge({ status }) {
  const map = {
    success: { bg: 'var(--success-bg)', color: 'var(--success)', label: 'OK' },
    error:   { bg: 'var(--danger-bg)',  color: 'var(--danger)',  label: 'Error' },
    blocked: { bg: 'var(--warning-bg)', color: 'var(--warning)', label: 'Blocked' },
  }
  const s = map[status] || { bg: 'var(--surface2)', color: 'var(--text-muted)', label: status }
  return (
    <span style={{ background: s.bg, color: s.color, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
      {s.label}
    </span>
  )
}

function StatCard({ label, value, sub }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sub}</div>}
    </div>
  )
}

export default function Metrics() {
  const [logs, setLogs]         = useState([])
  const [retailers, setRetailers] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading]   = useState(true)
  const [tab, setTab]           = useState('overview') // overview | retailers | log

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [lg, rt, pr] = await Promise.all([
        pb.collection('scrape_logs').getFullList({ sort: '-created', perPage: 500, expand: 'retailer,product' }),
        pb.collection('retailers').getFullList({ sort: 'name', expand: 'product' }),
        pb.collection('products').getFullList({ sort: 'name' }),
      ])
      setLogs(lg)
      setRetailers(rt)
      setProducts(pr)
    } catch (e) {
      if (e.status === 401) { pb.authStore.clear(); window.location.reload() }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="empty-state"><div className="spinner" /></div>

  // --- derived stats ---
  const now = Date.now()
  const h24 = logs.filter(l => now - new Date(l.created).getTime() < 86400000)
  const total24 = h24.length
  const success24 = h24.filter(l => l.status === 'success').length
  const successRate = total24 ? Math.round((success24 / total24) * 100) : null
  const durations = h24.filter(l => l.status === 'success' && l.duration_ms).map(l => l.duration_ms)
  const avgDuration = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null
  const maxDuration = durations.length ? Math.max(...durations) : null

  // Per-retailer stats from logs
  const retailerStats = {}
  for (const r of retailers) {
    const rLogs = logs.filter(l => l.retailer === r.id)
    const rLogs24 = rLogs.filter(l => now - new Date(l.created).getTime() < 86400000)
    const rSuccess = rLogs24.filter(l => l.status === 'success')
    const rDurations = rSuccess.filter(l => l.duration_ms).map(l => l.duration_ms)
    const last = rLogs[0]
    // Consecutive failures: count from most recent going back until we hit a success
    let consecFail = 0
    for (const l of rLogs) {
      if (l.status === 'success') break
      consecFail++
    }
    retailerStats[r.id] = {
      total24: rLogs24.length,
      success24: rSuccess.length,
      avgDuration: rDurations.length ? Math.round(rDurations.reduce((a, b) => a + b, 0) / rDurations.length) : null,
      lastStatus: last?.status ?? null,
      lastRun: last?.created ?? r.last_checked ?? null,
      lastDuration: last?.duration_ms ?? null,
      consecFail,
    }
  }

  // Per-product stats
  const productStats = products.map(p => {
    const pRetailers = retailers.filter(r => r.product === p.id)
    const pLogs24 = h24.filter(l => l.product === p.id)
    const pSuccess24 = pLogs24.filter(l => l.status === 'success').length
    const lastLog = logs.filter(l => l.product === p.id)[0]
    return {
      ...p,
      retailerCount: pRetailers.length,
      enabledCount: pRetailers.filter(r => r.enabled).length,
      total24: pLogs24.length,
      success24: pSuccess24,
      rate24: pLogs24.length ? Math.round((pSuccess24 / pLogs24.length) * 100) : null,
      lastRun: lastLog?.created ?? null,
      lastStatus: lastLog?.status ?? null,
    }
  })

  const tabBtn = (id, label) => (
    <button
      onClick={() => setTab(id)}
      style={{
        background: tab === id ? 'var(--accent)' : 'transparent',
        color: tab === id ? '#fff' : 'var(--text-muted)',
        border: tab === id ? 'none' : '1px solid var(--border)',
        borderRadius: 8,
        padding: '6px 14px',
        fontSize: 13,
        fontWeight: 500,
      }}
    >
      {label}
    </button>
  )

  return (
    <div style={{ padding: '24px 20px', maxWidth: 900, margin: '0 auto', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Scrape Metrics</h1>
        <button className="btn-ghost btn-sm" onClick={load}>Refresh</button>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
        <StatCard label="Scrapes (24h)" value={total24} />
        <StatCard
          label="Success Rate (24h)"
          value={successRate != null ? `${successRate}%` : '—'}
          sub={`${success24} / ${total24}`}
        />
        <StatCard label="Avg Duration" value={fmt(avgDuration)} sub="successful scrapes" />
        <StatCard label="Max Duration" value={fmt(maxDuration)} sub="successful scrapes" />
        <StatCard label="Retailers tracked" value={retailers.length} sub={`${retailers.filter(r => r.enabled).length} enabled`} />
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {tabBtn('overview', 'By Product')}
        {tabBtn('retailers', 'By Retailer')}
        {tabBtn('log', 'Recent Log')}
      </div>

      {tab === 'overview' && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', minWidth: 520, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--surface2)', fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
                <th style={{ padding: '10px 14px', textAlign: 'left' }}>Product</th>
                <th style={{ padding: '10px 14px', textAlign: 'center' }}>Retailers</th>
                <th style={{ padding: '10px 14px', textAlign: 'center' }}>Last run</th>
                <th style={{ padding: '10px 14px', textAlign: 'center' }}>Status</th>
                <th style={{ padding: '10px 14px', textAlign: 'center' }}>24h checks</th>
                <th style={{ padding: '10px 14px', textAlign: 'center' }}>Success rate</th>
              </tr>
            </thead>
            <tbody>
              {productStats.length === 0 && (
                <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>No products</td></tr>
              )}
              {productStats.map((p, i) => (
                <tr key={p.id} style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 500 }}>{p.name}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    {p.enabledCount}/{p.retailerCount}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                    {timeAgo(p.lastRun)}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                    {p.lastStatus ? <StatusBadge status={p.lastStatus} /> : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'center', color: 'var(--text-muted)' }}>{p.total24}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                    {p.rate24 != null
                      ? <span style={{ color: p.rate24 >= 80 ? 'var(--success)' : p.rate24 >= 50 ? 'var(--warning)' : 'var(--danger)', fontWeight: 600 }}>{p.rate24}%</span>
                      : <span style={{ color: 'var(--text-muted)' }}>—</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'retailers' && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', minWidth: 680, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--surface2)', fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
                <th style={{ padding: '10px 14px', textAlign: 'left' }}>Retailer</th>
                <th style={{ padding: '10px 14px', textAlign: 'left' }}>Product</th>
                <th style={{ padding: '10px 14px', textAlign: 'center' }}>Last run</th>
                <th style={{ padding: '10px 14px', textAlign: 'center' }}>Last status</th>
                <th style={{ padding: '10px 14px', textAlign: 'center' }}>Last duration</th>
                <th style={{ padding: '10px 14px', textAlign: 'center' }}>Avg (24h)</th>
                <th style={{ padding: '10px 14px', textAlign: 'center' }}>24h rate</th>
                <th style={{ padding: '10px 14px', textAlign: 'center' }}>Consec. fail</th>
              </tr>
            </thead>
            <tbody>
              {retailers.length === 0 && (
                <tr><td colSpan={8} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>No retailers</td></tr>
              )}
              {retailers.map((r, i) => {
                const s = retailerStats[r.id]
                const product = products.find(p => p.id === r.product)
                const rate = s.total24 ? Math.round((s.success24 / s.total24) * 100) : null
                return (
                  <tr key={r.id} style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none', opacity: r.enabled ? 1 : 0.5 }}>
                    <td style={{ padding: '10px 14px' }}>
                      <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 500 }}>{r.name}</a>
                      {!r.enabled && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--text-muted)', background: 'var(--surface2)', borderRadius: 4, padding: '1px 5px' }}>disabled</span>}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 12 }}>{product?.name ?? '—'}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>{timeAgo(s.lastRun)}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      {s.lastStatus ? <StatusBadge status={s.lastStatus} /> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>{fmt(s.lastDuration)}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>{fmt(s.avgDuration)}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      {rate != null
                        ? <span style={{ color: rate >= 80 ? 'var(--success)' : rate >= 50 ? 'var(--warning)' : 'var(--danger)', fontWeight: 600 }}>{rate}%</span>
                        : <span style={{ color: 'var(--text-muted)' }}>—</span>
                      }
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      {s.consecFail > 0
                        ? <span style={{ color: 'var(--danger)', fontWeight: 600 }}>{s.consecFail}</span>
                        : <span style={{ color: 'var(--text-muted)' }}>0</span>
                      }
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'log' && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', minWidth: 580, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--surface2)', fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
                <th style={{ padding: '10px 14px', textAlign: 'left' }}>Time</th>
                <th style={{ padding: '10px 14px', textAlign: 'left' }}>Retailer</th>
                <th style={{ padding: '10px 14px', textAlign: 'left' }}>Product</th>
                <th style={{ padding: '10px 14px', textAlign: 'center' }}>Status</th>
                <th style={{ padding: '10px 14px', textAlign: 'center' }}>Duration</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>Price</th>
                <th style={{ padding: '10px 14px', textAlign: 'left' }}>Error</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>No logs yet — logs appear after the first scrape run</td></tr>
              )}
              {logs.slice(0, 200).map((l, i) => {
                const retailer = retailers.find(r => r.id === l.retailer)
                const product = products.find(p => p.id === l.product)
                return (
                  <tr key={l.id} style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                    <td style={{ padding: '8px 14px', color: 'var(--text-muted)', fontSize: 11, whiteSpace: 'nowrap' }}>
                      {new Date(l.created).toLocaleString('en-AU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                    <td style={{ padding: '8px 14px', fontSize: 12, fontWeight: 500 }}>{retailer?.name ?? l.retailer?.slice(0, 8) ?? '—'}</td>
                    <td style={{ padding: '8px 14px', fontSize: 12, color: 'var(--text-muted)' }}>{product?.name ?? '—'}</td>
                    <td style={{ padding: '8px 14px', textAlign: 'center' }}><StatusBadge status={l.status} /></td>
                    <td style={{ padding: '8px 14px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>{fmt(l.duration_ms)}</td>
                    <td style={{ padding: '8px 14px', textAlign: 'right', fontSize: 12, fontWeight: 500 }}>
                      {l.price != null ? `$${l.price.toFixed(2)}` : '—'}
                    </td>
                    <td style={{ padding: '8px 14px', fontSize: 11, color: 'var(--danger)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.error_reason}>
                      {l.error_reason || ''}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {logs.length > 200 && (
            <div style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 12, borderTop: '1px solid var(--border)' }}>
              Showing 200 of {logs.length} entries
            </div>
          )}
        </div>
      )}
    </div>
  )
}
