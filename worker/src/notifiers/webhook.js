import { createHmac } from 'crypto'

/**
 * Webhook notifier — sends a POST request with JSON payload.
 * config: { url: string, secret?: string }
 */
export async function webhook(config, notification) {
  const { url, secret } = config
  if (!url) throw new Error('Webhook: url is required')

  const payload = JSON.stringify({
    event: 'price_alert',
    timestamp: new Date().toISOString(),
    ...notification,
  })

  const headers = { 'Content-Type': 'application/json' }

  if (secret) {
    const sig = createHmac('sha256', secret).update(payload).digest('hex')
    headers['X-Price-Track-Signature'] = `sha256=${sig}`
  }

  const res = await fetch(url, { method: 'POST', headers, body: payload })

  if (!res.ok) {
    throw new Error(`Webhook returned ${res.status}`)
  }
}
