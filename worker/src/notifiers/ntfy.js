/**
 * ntfy notifier — publishes to a self-hosted ntfy server.
 * config: { server?: string, topic: string, token?: string, priority?: string }
 *
 * Defaults to the LAN-internal origin (http://ntfy:2586 on the `pirate` docker
 * network), which bypasses Cloudflare and so needs no client certificate.
 */
const DEFAULT_SERVER = process.env.NTFY_SERVER || 'http://ntfy:2586'

export async function ntfy(config, notification) {
  const { topic, token } = config
  if (!topic) throw new Error('ntfy: topic is required')

  const server = (config.server || DEFAULT_SERVER).replace(/\/+$/, '')
  const { title, body, click } = formatMessage(notification)

  const headers = { 'Content-Type': 'text/plain; charset=utf-8' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (title) headers['X-Title'] = sanitizeHeader(title)
  if (click) headers['X-Click'] = click
  headers['X-Tags'] = notification.previousPrice != null && notification.price < notification.previousPrice
    ? 'chart_with_downwards_trend,moneybag'
    : 'bell'
  if (config.priority) headers['X-Priority'] = String(config.priority)

  const res = await fetch(`${server}/${encodeURIComponent(topic)}`, {
    method: 'POST',
    headers,
    body,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`ntfy error ${res.status}: ${text.slice(0, 200) || 'unknown'}`)
  }
}

/** ntfy headers are latin-1 / single-line — strip anything that would break them. */
function sanitizeHeader(s) {
  return s.replace(/[\r\n]+/g, ' ').trim()
}

function formatMessage({ title: t, body: b, product, retailer, retailer_url, product_url, price, previousPrice }) {
  const title = t || `Price Alert: ${product}`
  let body = b || ''

  if (!body) {
    if (previousPrice != null) {
      const diff = price - previousPrice
      const arrow = diff < 0 ? '↓' : '↑'
      const change = Math.abs(diff).toFixed(2)
      body = `${product} is now $${price.toFixed(2)} at ${retailer} (${arrow} $${change} from $${previousPrice.toFixed(2)})`
    } else {
      body = `${product} is now $${price.toFixed(2)} at ${retailer}`
    }
  }

  return { title, body, click: retailer_url || product_url }
}
