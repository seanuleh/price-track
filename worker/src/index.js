import express from 'express'
import { startScheduler, checkRetailer, runCheckAll } from './scheduler.js'
import { scrapePrice, detectPriceSelector, fetchProductMeta, findAustralianRetailers, findAustralianRetailersStream } from './scraper.js'
import { sendNotification } from './notifiers/index.js'
import { pbList, pbUpdate } from './pb.js'

const app = express()
app.use(express.json())

// Simple auth check — verify the PocketBase token is present
// (The PB token is passed from the frontend via Authorization header)
// For API calls from the frontend, we just ensure the request has some auth
function requireAuth(req, res, next) {
  const auth = req.headers.authorization
  if (!auth) return res.status(401).json({ error: 'Unauthorized' })
  next()
}

/**
 * POST /api/price-track/scrape
 * Manually trigger a price scrape for a retailer.
 * Body: { retailer_id }
 */
app.post('/api/price-track/scrape', requireAuth, async (req, res) => {
  const { retailer_id } = req.body
  if (!retailer_id) return res.status(400).json({ error: 'retailer_id required' })

  try {
    const retailers = await pbList('retailers', `id="${retailer_id}"`)
    if (!retailers.length) return res.status(404).json({ error: 'Retailer not found' })

    await checkRetailer(retailers[0])
    res.json({ ok: true })
  } catch (e) {
    console.error('[api] scrape error:', e.message)
    res.status(500).json({ error: e.message })
  }
})

/**
 * POST /api/price-track/detect-selector
 * Use Claude to detect the CSS selector for a price on a page.
 * Body: { url }
 */
app.post('/api/price-track/detect-selector', requireAuth, async (req, res) => {
  const { url } = req.body
  if (!url) return res.status(400).json({ error: 'url required' })

  try {
    const selector = await detectPriceSelector(url)
    res.json({ selector })
  } catch (e) {
    console.error('[api] detect-selector error:', e.message)
    res.status(500).json({ error: e.message })
  }
})

/**
 * POST /api/price-track/fetch-meta
 * Use Claude to fetch product metadata from a URL or search query.
 * Body: { url?, query? }
 */
app.post('/api/price-track/fetch-meta', requireAuth, async (req, res) => {
  const { url, query } = req.body
  if (!url && !query) return res.status(400).json({ error: 'url or query required' })

  try {
    const meta = await fetchProductMeta(url, query)
    res.json(meta)
  } catch (e) {
    console.error('[api] fetch-meta error:', e.message)
    res.status(500).json({ error: e.message })
  }
})

/**
 * POST /api/price-track/find-retailers
 * Use Claude with web search to find Australian retailers for a product.
 * Body: { product_name, brand?, model?, url? }
 */
app.post('/api/price-track/find-retailers', requireAuth, async (req, res) => {
  const { product_name, brand, model, url, existing } = req.body
  if (!product_name) return res.status(400).json({ error: 'product_name required' })

  try {
    const retailers = await findAustralianRetailers({ product_name, brand, model, url, existing })
    res.json({ retailers })
  } catch (e) {
    console.error('[api] find-retailers error:', e.message)
    res.status(500).json({ error: e.message })
  }
})

/**
 * GET /api/price-track/find-retailers-stream
 * SSE endpoint — streams Claude status updates, then emits final retailers JSON.
 * Query params: product_name, brand?, model?, url?, existing (JSON array)
 */
app.get('/api/price-track/find-retailers-stream', requireAuth, async (req, res) => {
  const { product_name, brand, model, url } = req.query
  if (!product_name) return res.status(400).json({ error: 'product_name required' })

  let existing = []
  try { existing = JSON.parse(req.query.existing || '[]') } catch { /* ignore */ }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)

  try {
    const retailers = await findAustralianRetailersStream(
      { product_name, brand, model, url, existing },
      msg => send('status', { message: msg })
    )
    send('done', { retailers })
  } catch (e) {
    send('error', { message: e.message })
  } finally {
    res.end()
  }
})

/**
 * POST /api/price-track/test-notification
 * Send a test notification through a channel.
 * Body: { channel_id }
 */
app.post('/api/price-track/test-notification', requireAuth, async (req, res) => {
  const { channel_id } = req.body
  if (!channel_id) return res.status(400).json({ error: 'channel_id required' })

  try {
    const channels = await pbList('notification_channels', `id="${channel_id}"`)
    if (!channels.length) return res.status(404).json({ error: 'Channel not found' })

    await sendNotification(channels[0], {
      product: 'Test Product',
      retailer: 'Test Retailer',
      price: 99.99,
      previousPrice: 129.99,
      currency: 'AUD',
      condition: 'below',
      target_price: 100,
      title: '🧪 Price Track — Test Notification',
      body: 'Your notification channel is working correctly!',
    })

    res.json({ ok: true })
  } catch (e) {
    console.error('[api] test-notification error:', e.message)
    res.status(500).json({ error: e.message })
  }
})

/**
 * POST /api/price-track/check-all
 * Manually trigger a full check run.
 */
app.post('/api/price-track/check-all', requireAuth, async (req, res) => {
  runCheckAll().catch(e => console.error('[api] check-all error:', e.message))
  res.json({ ok: true, message: 'Check run started' })
})

/**
 * GET /api/price-track/health
 */
app.get('/api/price-track/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() })
})

const PORT = process.env.PORT || 3500
app.listen(PORT, () => {
  console.log(`[worker] API server listening on :${PORT}`)
})

// Start the scheduler
startScheduler()
