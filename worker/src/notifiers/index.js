import { pushbullet } from './pushbullet.js'
import { webhook }    from './webhook.js'
import { email }      from './email.js'

/**
 * Notifier registry — add new providers here.
 * Each notifier must implement: async send(config, notification) => void
 */
const NOTIFIERS = {
  pushbullet,
  webhook,
  email,
}

/**
 * Send a notification through a channel.
 * @param {object} channel - PocketBase notification_channels record
 * @param {object} notification - { title, body, product, retailer, price, previousPrice }
 */
export async function sendNotification(channel, notification) {
  const notifier = NOTIFIERS[channel.type]
  if (!notifier) throw new Error(`Unknown notifier type: ${channel.type}`)
  await notifier(channel.config, notification)
}

export { NOTIFIERS }
