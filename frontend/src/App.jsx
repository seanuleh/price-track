import { useState, useEffect, useCallback } from 'react'
import Products from './pages/Products.jsx'
import Alerts from './pages/Alerts.jsx'
import Settings from './pages/Settings.jsx'
import pb from './pb.js'

function parseHash() {
  const hash = window.location.hash.slice(1) || 'products'
  const [page, ...rest] = hash.split('/')
  return { page, productId: rest[0] || null }
}

const IconProducts = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2.5 8.5L12 3l9.5 5.5v7L12 21l-9.5-5.5z"/>
    <path d="M12 3v18M2.5 8.5l9.5 5.5 9.5-5.5"/>
  </svg>
)

const IconAlerts = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
  </svg>
)

const IconSettings = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
)

const PAGES = [
  { id: 'products', label: 'Products', Icon: IconProducts },
  { id: 'alerts',   label: 'Alerts',   Icon: IconAlerts   },
  { id: 'settings', label: 'Settings', Icon: IconSettings },
]

export default function App() {
  const initial = parseHash()
  const [page, setPageState] = useState(initial.page)
  const [productId, setProductId] = useState(initial.productId)
  const [showDebug, setShowDebug] = useState(false)

  const setPage = useCallback((p) => {
    setPageState(p)
    setProductId(null)
    window.location.hash = p
  }, [])

  const handleProductSelect = useCallback((id) => {
    setProductId(id)
    window.location.hash = id ? `products/${id}` : 'products'
  }, [])

  useEffect(() => {
    const onHashChange = () => {
      const { page: p, productId: pid } = parseHash()
      setPageState(p)
      setProductId(pid)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  return (
    <div className="layout">
      <nav className="sidebar">
        <div className="sidebar-logo" onClick={() => setShowDebug(true)}>Price<span>Track</span></div>
        {PAGES.map(p => (
          <button
            key={p.id}
            className={`nav-item${page === p.id ? ' active' : ''}`}
            onClick={() => setPage(p.id)}
          >
            <span className="nav-icon"><p.Icon /></span>
            {p.label}
          </button>
        ))}
      </nav>
      <main className="main">
        {page === 'products' && <Products selectedProductId={productId} onProductSelect={handleProductSelect} />}
        {page === 'alerts'   && <Alerts />}
        {page === 'settings' && <Settings />}
      </main>
      {showDebug && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',zIndex:200,padding:16,overflowY:'auto',whiteSpace:'pre-wrap',wordBreak:'break-all',fontSize:12,color:'#fff'}}>
          <button onClick={() => setShowDebug(false)} style={{marginBottom:12,background:'red',color:'#fff',border:'none',padding:'6px 12px',borderRadius:6}}>Close</button>
          {JSON.stringify(JSON.parse(localStorage.getItem('pocketbase_auth') || 'null'), null, 2)}
          {'\n\n--- pb.authStore ---\n'}
          token: {pb.authStore.token ? pb.authStore.token.slice(0,40)+'...' : 'null'}
          {'\nmodel: '}{JSON.stringify(pb.authStore.model, null, 2)}
        </div>
      )}
      <nav className="bottom-nav">
        {PAGES.map(p => (
          <button
            key={p.id}
            className={`bottom-nav-item${page === p.id ? ' active' : ''}`}
            onClick={() => setPage(p.id)}
            onDoubleClick={p.id === 'products' ? () => setShowDebug(true) : undefined}
          >
            <p.Icon />
            <span>{p.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
