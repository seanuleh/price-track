import { useState, useEffect, useCallback, useRef } from 'react'
import pb from '../pb.js'
import ProductDetail from '../components/ProductDetail.jsx'
import AddProductModal from '../components/AddProductModal.jsx'

export default function Products({ selectedProductId, onProductSelect }) {
  const [products, setProducts]   = useState([])
  const [retailers, setRetailers] = useState([])
  const [history, setHistory]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [showAdd, setShowAdd]     = useState(false)
  const selected = selectedProductId
  const setSelected = onProductSelect
  const unsubRef = useRef([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [prods, rets, hist] = await Promise.all([
        pb.collection('products').getFullList({ sort: '-created' }),
        pb.collection('retailers').getFullList({ sort: 'name' }),
        pb.collection('price_history').getFullList({ sort: '-created', expand: 'retailer' }),
      ])
      setProducts(prods)
      setRetailers(rets)
      setHistory(hist)
    } catch (e) {
      if (e.status === 401) { pb.authStore.clear(); window.location.reload() }
    } finally {
      setLoading(false)
    }
  }, [])

  const loadSilent = useCallback(async () => {
    try {
      const [rets, hist] = await Promise.all([
        pb.collection('retailers').getFullList({ sort: 'name' }),
        pb.collection('price_history').getFullList({ sort: '-created', expand: 'retailer' }),
      ])
      setRetailers(rets)
      setHistory(hist)
    } catch (e) {
      if (e.status === 401) { pb.authStore.clear(); window.location.reload() }
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Realtime subscriptions when a product is selected
  useEffect(() => {
    if (!selected) return

    const unsubs = unsubRef.current
    // Unsubscribe any previous subscriptions
    unsubs.forEach(fn => fn())
    unsubs.length = 0

    pb.collection('retailers').subscribe('*', (e) => {
      if (e.action === 'update') {
        setRetailers(prev => prev.map(r => r.id === e.record.id ? e.record : r))
      } else if (e.action === 'create') {
        setRetailers(prev => [...prev, e.record].sort((a, b) => a.name.localeCompare(b.name)))
      } else if (e.action === 'delete') {
        setRetailers(prev => prev.filter(r => r.id !== e.record.id))
      }
    }).then(unsub => unsubs.push(unsub))

    pb.collection('price_history').subscribe('*', (e) => {
      if (e.action === 'create') {
        setHistory(prev => [e.record, ...prev])
      } else if (e.action === 'delete') {
        setHistory(prev => prev.filter(h => h.id !== e.record.id))
      }
    }).then(unsub => unsubs.push(unsub))

    return () => {
      unsubs.forEach(fn => fn())
      unsubs.length = 0
    }
  }, [selected])

  // Best price per product
  const bestPrice = (productId) => {
    const rets = retailers.filter(r => r.product === productId && r.last_price)
    if (!rets.length) return null
    return Math.min(...rets.map(r => r.last_price))
  }

  const productRetailers = (productId) => retailers.filter(r => r.product === productId)

  const handleProductAdded = (p) => {
    setProducts(prev => [p, ...prev])
    setShowAdd(false)
    setSelected(p.id)
  }

  const handleProductDeleted = (productId) => {
    setProducts(prev => prev.filter(p => p.id !== productId))
    setSelected(null)
  }

  if (loading) return <div className="empty-state"><div className="spinner" /></div>

  if (selected) {
    const product  = products.find(p => p.id === selected)
    const rets     = productRetailers(selected)
    const hist     = history.filter(h => h.product === selected)
    return (
      <ProductDetail
        product={product}
        retailers={rets}
        history={hist}
        onBack={() => setSelected(null)}
        onUpdated={loadSilent}
        onDeleted={handleProductDeleted}
      />
    )
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Products</h1>
        <button className="btn-primary" onClick={() => setShowAdd(true)}>+ Add Product</button>
      </div>

      {products.length === 0 ? (
        <div className="empty-state">
          <p style={{marginBottom: 12}}>No products yet.</p>
          <button className="btn-primary" onClick={() => setShowAdd(true)}>Add your first product</button>
        </div>
      ) : (
        <div className="product-grid">
          {products.map(p => {
            const rets  = productRetailers(p.id)
            const best  = bestPrice(p.id)
            const prices = rets.filter(r => r.last_price).sort((a, b) => a.last_price - b.last_price)
            return (
              <div key={p.id} className="product-card" onClick={() => setSelected(p.id)}>
                <div className="product-card-head">
                  {p.image_url
                    ? <img className="product-card-img" src={p.image_url} alt={p.name} onError={e => e.target.style.display='none'} />
                    : <div className="product-card-img" style={{display:'flex',alignItems:'center',justifyContent:'center',fontSize:28}}>📦</div>
                  }
                  <div className="product-card-info">
                    <div className="product-card-name">{p.name}</div>
                    {p.brand && <div className="product-card-brand">{p.brand}</div>}
                    <div style={{marginTop:6}}>
                      <span className="tag tag-neutral">{rets.length} retailer{rets.length !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                </div>
                {prices.length > 0 && (
                  <div className="product-card-prices">
                    {prices.slice(0, 3).map((r, i) => (
                      <div key={r.id} className="price-row">
                        <span className="price-retailer">{r.name}</span>
                        <span className={`price-value${r.last_price === best ? ' best' : ''}`}>
                          ${r.last_price.toFixed(2)}
                        </span>
                      </div>
                    ))}
                    {prices.length > 3 && (
                      <div className="price-row">
                        <span className="price-retailer">+{prices.length - 3} more</span>
                      </div>
                    )}
                  </div>
                )}
                {prices.length === 0 && (
                  <div style={{color:'var(--text-muted)', fontSize:12, paddingTop:8, borderTop:'1px solid var(--border)'}}>
                    No prices yet — add retailers to track
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showAdd && (
        <AddProductModal onClose={() => setShowAdd(false)} onAdded={handleProductAdded} />
      )}
    </>
  )
}
