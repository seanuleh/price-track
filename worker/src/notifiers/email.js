/**
 * Email notifier — stub implementation.
 * Extend this to use Resend, SendGrid, Nodemailer, etc.
 * config: { address: string }
 */
export async function email(config, notification) {
  const { address } = config
  if (!address) throw new Error('Email: address is required')

  // TODO: plug in your preferred email provider
  // Example with Resend:
  //
  // const res = await fetch('https://api.resend.com/emails', {
  //   method: 'POST',
  //   headers: {
  //     Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
  //     'Content-Type': 'application/json',
  //   },
  //   body: JSON.stringify({
  //     from: 'price-track@yourdomain.com',
  //     to: [address],
  //     subject: `Price Alert: ${notification.product}`,
  //     text: `${notification.product} is now $${notification.price} at ${notification.retailer}`,
  //   }),
  // })
  // if (!res.ok) throw new Error(`Resend error: ${res.status}`)

  console.warn(`[email notifier] stub — would send to ${address}:`, notification)
}
