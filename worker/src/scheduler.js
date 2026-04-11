import { pbList, pbCreate, pbUpdate } from './pb.js'
import { scrapePrice } from './scraper.js'
import { sendNotification } from './notifiers/index.js'

const CHECK_INTERVAL_MINUTES = parseInt(process.env.CHECK_INTERVAL_MINUTES || '60', 10)

let running = false

export async function runCheckAll(productId) {
  if (!productId && running) {
    console.log('[scheduler] Run already in progress — skipping.')
    return
  }
  if (!productId) running = true
  console.log(productId ? `[scheduler] Starting check for product ${productId}...` : '[scheduler] Starting price check run...')

  let retailers
  try {
    const filter = productId ? `enabled=true && product="${productId}"` : 'enabled=true'
    retailers = await pbList('retailers', filter)
  } catch (e) {
    console.error('[scheduler] Failed to fetch retailers:', e.message)
    if (!productId) running = false
    return
  }

  console.log(`[scheduler] Checking ${retailers.length} retailer(s)...`)

  try {
    const CONCURRENCY = 6
    const queue = [...retailers]
    const workers = Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length) {
        const retailer = queue.shift()
        try {
          await checkRetailer(retailer)
        } catch (e) {
          console.error(`[scheduler] Error checking retailer ${retailer.name}:`, e.message)
        }
      }
    })
    await Promise.all(workers)
    console.log('[scheduler] Run complete.')
  } finally {
    if (!productId) running = false
  }
}

export async function checkRetailer(retailer) {
  console.log(`[scheduler] Scraping: ${retailer.name} — ${retailer.url}`)

  await pbUpdate('retailers', retailer.id, { is_scraping: true }).catch(() => {})

  let result
  try {
    result = await scrapePrice(retailer.url, retailer.selector)
  } catch (e) {
    const isBotBlocked = /bot protection|captcha|blocked|403|429/i.test(e.message)
    await pbUpdate('retailers', retailer.id, {
      is_scraping: false,
      ...(isBotBlocked ? { enabled: false } : {}),
    }).catch(() => {})
    if (isBotBlocked) {
      console.warn(`[scheduler]   → Bot protection detected for ${retailer.name} — disabling retailer`)
    }
    throw e
  }

  const { price, currency, inStock, selector: detectedSelector } = result

  console.log(`[scheduler]   → $${price} (${currency}) in_stock=${inStock}`)

  const previousPrice = retailer.last_price || null

  // Persist price history
  await pbCreate('price_history', {
    retailer: retailer.id,
    product:  retailer.product,
    price,
    currency,
    in_stock: inStock,
    user:     retailer.user,
  })

  // Update retailer's last_price, last_checked, and clear is_scraping
  await pbUpdate('retailers', retailer.id, {
    last_price:   price,
    last_checked: new Date().toISOString(),
    is_scraping:  false,
    // Save detected selector for future runs
    ...(detectedSelector && !retailer.selector ? { selector: detectedSelector } : {}),
  })

  // Check alerts for this product
  await evaluateAlerts(retailer, price, previousPrice, currency)
}

async function evaluateAlerts(retailer, price, previousPrice, currency) {
  let alerts
  try {
    alerts = await pbList('alerts', `product="${retailer.product}" && enabled=true`)
  } catch {
    return
  }

  for (const alert of alerts) {
    let triggered = false

    if (alert.condition === 'below' && price <= alert.target_price)       triggered = true
    if (alert.condition === 'above' && price >= alert.target_price)       triggered = true
    if (alert.condition === 'any_change' && previousPrice !== null && price !== previousPrice) triggered = true
    if (alert.condition === 'any_drop'   && previousPrice !== null && price < previousPrice)  triggered = true

    if (!triggered) continue

    console.log(`[scheduler]   → Alert triggered: ${alert.condition} $${alert.target_price}`)

    // Update triggered_at
    await pbUpdate('alerts', alert.id, { triggered_at: new Date().toISOString() }).catch(() => {})

    // Fetch product name
    let productName = retailer.product
    try {
      const products = await pbList('products', `id="${retailer.product}"`)
      if (products[0]) productName = products[0].name
    } catch {}

    // Send to all enabled notification channels for this user
    let channels
    try {
      channels = await pbList('notification_channels', `user="${retailer.user}" && enabled=true`)
    } catch { continue }

    const notification = {
      product:       productName,
      retailer:      retailer.name,
      retailer_url:  retailer.url,
      price,
      previousPrice,
      currency,
      condition:     alert.condition,
      target_price:  alert.target_price,
    }

    for (const channel of channels) {
      try {
        await sendNotification(channel, notification)
        console.log(`[scheduler]   → Notified via ${channel.type}: ${channel.name}`)
      } catch (e) {
        console.error(`[scheduler]   → Notification failed (${channel.type}/${channel.name}):`, e.message)
      }
    }
  }
}

export function startScheduler() {
  const intervalMs = CHECK_INTERVAL_MINUTES * 60 * 1000
  console.log(`[scheduler] Starting — will check every ${CHECK_INTERVAL_MINUTES} minute(s)`)

  setInterval(() => {
    runCheckAll().catch(e => console.error('[scheduler] Run error:', e.message))
  }, intervalMs)
}
