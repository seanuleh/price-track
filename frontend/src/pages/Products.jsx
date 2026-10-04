import { useState, useEffect, useCallback, useRef } from 'react'
import pb from '../pb.js'
import ProductDetail from '../components/ProductDetail.jsx'
import AddProductModal from '../components/AddProductModal.jsx'
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  SortableContext, arrayMove, useSortable, verticalListSortingStrategy, sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers'
import { CSS } from '@dnd-kit/utilities'

function SortableProductRow({ id, onClick, children }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <div
      ref={setNodeRef}
      className={`product-row${isDragging ? ' dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={onClick}
    >
      <button
        ref={setActivatorNodeRef}
        className="product-row-handle"
        aria-label="Drag to reorder"
        onClick={e => e.stopPropagation()}
        {...attributes}
        {...listeners}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>
      </button>
      {children}
    </div>
  )
}

export default function Products({ selectedProductId, onProductSelect }) {
  const [products, setProducts]         = useState([])
  const [retailers, setRetailers]       = useState([])
  const [history, setHistory]           = useState([])
  const [loading, setLoading]           = useState(true)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [showAdd, setShowAdd]     = useState(false)
  const selected = selectedProductId
  const setSelected = onProductSelect
  const unsubRef = useRef([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [prods, rets] = await Promise.all([
        pb.collection('products').getFullList({ sort: 'sort_order,-created' }),
        pb.collection('retailers').getFullList({ sort: 'name' }),
      ])
      setProducts(prods)
      setRetailers(rets)
    } catch (e) {
      if (e.status === 401) { pb.authStore.clear(); window.location.reload() }
    } finally {
      setLoading(false)
    }
  }, [])

  const loadSilent = useCallback(async () => {
    try {
      const rets = await pb.collection('retailers').getFullList({ sort: 'name' })
      setRetailers(rets)
    } catch (e) {
      if (e.status === 401) { pb.authStore.clear(); window.location.reload() }
    }
  }, [])

  const loadHistory = useCallback(async (productId) => {
    setHistoryLoading(true)
    try {
      const hist = await pb.collection('price_history').getFullList({
        sort: '-created',
        expand: 'retailer',
        filter: `product="${productId}"`,
      })
      setHistory(hist)
    } catch (e) {
      if (e.status === 401) { pb.authStore.clear(); window.location.reload() }
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Load history when a product is selected
  useEffect(() => {
    if (!selected) { setHistory([]); setHistoryLoading(false); return }
    loadHistory(selected)
  }, [selected, loadHistory])

  // Realtime subscriptions when a product is selected
  useEffect(() => {
    if (!selected) return

    const unsubs = unsubRef.current
    // Unsubscribe any previous subscriptions
    unsubs.forEach(fn => fn())
    unsubs.length = 0

    // Catch any updates missed while unsubscribed (navigated away)
    loadSilent()

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
  }, [selected, loadSilent])

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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = async ({ active, over }) => {
    if (!over || active.id === over.id) return
    const from = products.findIndex(p => p.id === active.id)
    const to   = products.findIndex(p => p.id === over.id)
    const reordered = arrayMove(products, from, to).map((p, i) => ({ ...p, sort_order: i + 1 }))
    const changed = reordered.filter(p => products.find(o => o.id === p.id).sort_order !== p.sort_order)
    setProducts(reordered)
    try {
      await Promise.all(changed.map(p => pb.collection('products').update(p.id, { sort_order: p.sort_order })))
    } catch (e) {
      if (e.status === 401) { pb.authStore.clear(); window.location.reload() }
      load()
    }
  }

  const handleProductDeleted = (productId) => {
    setProducts(prev => prev.filter(p => p.id !== productId))
    setSelected(null)
  }

  if (loading) return <div className="empty-state"><div className="spinner" /></div>

  if (selected) {
    const product  = products.find(p => p.id === selected) || null
    if (!product && !loading) return <div className="empty-state"><div className="spinner" /></div>
    const rets     = productRetailers(selected)
    const hist     = history
    return (
      <div key={selected} className="subpage-enter">
        <ProductDetail
          product={product}
          retailers={rets}
          history={hist}
          historyLoading={historyLoading}
          onBack={() => setSelected(null)}
          onUpdated={loadSilent}
          onDeleted={handleProductDeleted}
        />
      </div>
    )
  }

  return (
    <div key="list" className="subpage-enter subpage-enter-back">
      <div className="page-header">
        <h1 className="page-title">Products</h1>
        <button className="btn-primary" onClick={() => setShowAdd(true)}>+ Add Product</button>
      </div>

      {products.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📦</div>
          <p>No products yet.</p>
          <button className="btn-primary" onClick={() => setShowAdd(true)}>Add your first product</button>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis, restrictToParentElement]} onDragEnd={handleDragEnd}>
        <SortableContext items={products.map(p => p.id)} strategy={verticalListSortingStrategy}>
        <div className="product-list">
          {products.map(p => {
            const rets   = productRetailers(p.id)
            const best   = bestPrice(p.id)
            const prices = rets.filter(r => r.last_price).sort((a, b) => a.last_price - b.last_price)
            const cheapest = prices[0]
            const secondCheapest = prices[1]
            const saving = cheapest && secondCheapest ? secondCheapest.last_price - cheapest.last_price : null
            return (
              <SortableProductRow key={p.id} id={p.id} onClick={() => setSelected(p.id)}>
                <div className="product-row-thumb">
                  {p.image_url
                    ? <img src={p.image_url} alt={p.name} onError={e => e.target.style.display='none'} />
                    : <span style={{fontSize:20,opacity:0.25}}>📦</span>
                  }
                </div>
                <div className="product-row-info">
                  <div className="product-row-name">{p.name}</div>
                  <div className="product-row-meta">
                    {p.brand && <span>{p.brand}</span>}
                    {p.brand && rets.length > 0 && <span className="meta-dot">·</span>}
                    {rets.length > 0 && <span>{rets.length} retailer{rets.length !== 1 ? 's' : ''}</span>}
                    {rets.length === 0 && <span style={{fontStyle:'italic'}}>No retailers yet</span>}
                  </div>
                </div>
                <div className="product-row-price">
                  {best != null ? (
                    <>
                      <span className="product-row-best">${best.toFixed(2)}</span>
                      {saving != null && saving > 0.5 && (
                        <span className="product-row-saving">Save ${saving.toFixed(0)}</span>
                      )}
                    </>
                  ) : (
                    <span className="product-row-no-price">—</span>
                  )}
                </div>
                <svg className="product-row-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
              </SortableProductRow>
            )
          })}
        </div>
        </SortableContext>
        </DndContext>
      )}

      {showAdd && (
        <AddProductModal onClose={() => setShowAdd(false)} onAdded={handleProductAdded} />
      )}
    </div>
  )
}
