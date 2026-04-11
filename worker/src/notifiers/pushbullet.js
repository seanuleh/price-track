/**
 * Pushbullet notifier
 * config: { api_key: string }
 */
export async function pushbullet(config, notification) {
  const { api_key } = config
  if (!api_key) throw new Error('Pushbullet: api_key is required')

  const { title, body } = formatMessage(notification)

  const res = await fetch('https://api.pushbullet.com/v2/pushes', {
    method: 'POST',
    headers: {
      'Access-Token': api_key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'note', title, body }),
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(`Pushbullet error ${res.status}: ${data.error?.message || 'unknown'}`)
  }
}

function formatMessage({ title: t, body: b, product, retailer, price, previousPrice }) {
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

  return { title, body }
}
