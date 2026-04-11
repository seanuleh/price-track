import { chromium as chromiumExtra } from 'playwright-extra'
import { firefox, webkit } from 'playwright'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import { spawn } from 'child_process'

chromiumExtra.use(StealthPlugin())

const CLAUDE_BIN = process.env.CLAUDE_BIN || '/usr/local/bin/claude'
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://ollama:11434'
const VISION_MODEL = process.env.VISION_MODEL || 'qwen2.5vl:7b'

function callClaude(prompt, { tools } = {}) {
  return new Promise((resolve, reject) => {
    const args = ['--print', '--output-format', 'json', '--model', 'claude-sonnet-4-6']
    if (tools && tools.length) args.push('--allowedTools', tools.join(','))
    args.push('-p', prompt)

    const proc = spawn(CLAUDE_BIN, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, HOME: process.env.CLAUDE_HOME || '/root' },
    })

    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', d => { stdout += d })
    proc.stderr.on('data', d => { stderr += d })

    const timer = setTimeout(() => { proc.kill(); reject(new Error('Claude timed out')) }, 120000)

    proc.on('close', code => {
      clearTimeout(timer)
      if (code !== 0) return reject(new Error(`Claude exited ${code}: ${stderr.slice(0, 500)}`))
      try {
        const parsed = JSON.parse(stdout)
        if (parsed.is_error) return reject(new Error(parsed.result))
        resolve(parsed.result)
      } catch {
        reject(new Error(`Claude JSON parse failed: ${stdout.slice(0, 200)}`))
      }
    })
  })
}

// Shared browser instances (lazy init)
let browser = null
async function getBrowser() {
  if (!browser || !browser.isConnected()) {
    browser = await chromiumExtra.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    })
  }
  return browser
}

let firefoxBrowser = null
async function getFirefoxBrowser() {
  if (!firefoxBrowser || !firefoxBrowser.isConnected()) {
    firefoxBrowser = await firefox.launch({ headless: true })
  }
  return firefoxBrowser
}

let webkitBrowser = null
async function getWebkitBrowser() {
  if (!webkitBrowser || !webkitBrowser.isConnected()) {
    webkitBrowser = await webkit.launch({ headless: true })
  }
  return webkitBrowser
}

/**
 * Scrape a price from a URL.
 * If selector is provided, tries it first. Falls back to Claude AI analysis.
 * Returns: { price: number, currency: string, inStock: boolean, selector?: string }
 */
async function scrapeWithBrowser(br, url, { overrideUA = true } = {}) {
  const page = await br.newPage()
  try {
    const headers = { 'Accept-Language': 'en-AU,en;q=0.9' }
    if (overrideUA) headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    await page.setExtraHTTPHeaders(headers)

    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })

    // Fail fast — check for blocks before spending time waiting
    const status = response?.status() || 0
    if (status === 403 || status === 429) {
      throw new Error(`Page blocked by bot protection (HTTP ${status})`)
    }

    // Detect Imperva via response header (reliable — present immediately, before any JS runs)
    const responseHeaders = response?.headers() || {}
    if (responseHeaders['x-iinfo']) {
      throw new Error('Page blocked by bot protection (Imperva)')
    }

    // Detect silent redirects away from the target domain (e.g. redirected to Google)
    const finalUrl = page.url()
    const expectedHost = new URL(url).hostname
    const actualHost = new URL(finalUrl).hostname
    if (!actualHost.includes(expectedHost) && !expectedHost.includes(actualHost)) {
      throw new Error(`Page redirected away from ${expectedHost} to ${actualHost} — likely bot protection`)
    }

    // Detect CAPTCHA/challenge pages before waiting or wasting a vision inference
    const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 500) || '')
    if (/captcha|hcaptcha|i am human|additional security check|imperva|datadome|are you a robot/i.test(bodyText)) {
      throw new Error('Page blocked by CAPTCHA/bot protection')
    }

    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(3000)

    console.log('[scraper] Vision LLM scraping:', url)
    const visionResult = await findPriceWithVision(page, url)
    if (!visionResult) throw new Error('Vision LLM could not find price on page')
    console.log(`[scraper] Vision LLM found price: $${visionResult.price} (${visionResult.currency})`)
    const inStock = await detectInStock(page)
    return { ...visionResult, inStock }
  } finally {
    await page.close()
  }
}

export async function scrapePrice(url, selector = null) {
  try {
    return await scrapeWithBrowser(await getBrowser(), url)
  } catch (e) {
    if (/redirected away|bot protection|ERR_HTTP2_PROTOCOL_ERROR|ERR_CONNECTION_RESET|ERR_CONNECTION_REFUSED/i.test(e.message)) {
      console.warn(`[scraper] Chromium blocked, retrying with Firefox: ${e.message}`)
      try {
        return await scrapeWithBrowser(await getFirefoxBrowser(), url, { overrideUA: false })
      } catch (e2) {
        if (/redirected away|bot protection|ERR_HTTP2_PROTOCOL_ERROR|ERR_CONNECTION_RESET|ERR_CONNECTION_REFUSED/i.test(e2.message)) {
          console.warn(`[scraper] Firefox blocked, retrying with WebKit: ${e2.message}`)
          return await scrapeWithBrowser(await getWebkitBrowser(), url, { overrideUA: false })
        }
        throw e2
      }
    }
    throw e
  }
}

/**
 * Use Claude with web search to find Australian retailers selling a product.
 * Returns an array of { name, url } objects.
 */
export async function findAustralianRetailers({ product_name, brand, model, url, existing = [] }) {
  const query = [brand, product_name, model].filter(Boolean).join(' ')
  const excludeSection = existing.length
    ? `\nDo NOT include any of these already-tracked retailers:\n${existing.map(e => `- ${e.name} (${e.url})`).join('\n')}\n`
    : ''
  const prompt = `Search the web for Australian online retailers that sell the "${query}" product.

${url ? `The manufacturer/official page is: ${url}` : ''}

Find legitimate Australian retailers (not the manufacturer's own store unless they sell directly) that have this specific product listed for sale. Focus on well-known Australian electronics and hi-fi retailers.
${excludeSection}
Return a JSON array of up to 10 retailers in this exact format:
[
  { "name": "Retailer Name", "url": "https://exact-product-page-url.com.au/product/..." }
]

Rules:
- Only include .com.au or Australian retailers (aussie stores)
- Only include retailers where you are confident the product is actually listed
- Use the specific product page URL, not just the retailer homepage
- Do not include the manufacturer's own store (${brand || 'manufacturer'})
- Respond with ONLY valid JSON array, no markdown, no explanation`

  const text = await callClaude(prompt, { tools: ['WebSearch'] })

  // Extract JSON array from response
  const match = text.match(/\[[\s\S]*\]/)
  if (!match) return []

  try {
    const results = JSON.parse(match[0])
    return results.filter(r => r.name && r.url && r.url.startsWith('http'))
  } catch {
    return []
  }
}

/**
 * Like findAustralianRetailers but streams status updates via onStatus(msg) callback.
 * Resolves with the final retailers array.
 */
export function findAustralianRetailersStream({ product_name, brand, model, url, existing = [] }, onStatus) {
  return new Promise((resolve, reject) => {
    const query = [brand, product_name, model].filter(Boolean).join(' ')
    const excludeSection = existing.length
      ? `\nDo NOT include any of these already-tracked retailers:\n${existing.map(e => `- ${e.name} (${e.url})`).join('\n')}\n`
      : ''
    const prompt = `Search the web for Australian online retailers that sell the "${query}" product.

${url ? `The manufacturer/official page is: ${url}` : ''}

Find legitimate Australian retailers (not the manufacturer's own store unless they sell directly) that have this specific product listed for sale. Focus on well-known Australian electronics and hi-fi retailers.
${excludeSection}
Return a JSON array of up to 10 retailers in this exact format:
[
  { "name": "Retailer Name", "url": "https://exact-product-page-url.com.au/product/..." }
]

Rules:
- Only include .com.au or Australian retailers (aussie stores)
- Only include retailers where you are confident the product is actually listed
- Use the specific product page URL, not just the retailer homepage
- Do not include the manufacturer's own store (${brand || 'manufacturer'})
- Respond with ONLY valid JSON array, no markdown, no explanation`

    const args = ['--print', '--verbose', '--output-format', 'stream-json', '--model', 'claude-sonnet-4-6', '--allowedTools', 'WebSearch', '-p', prompt]
    const proc = spawn(CLAUDE_BIN, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, HOME: process.env.CLAUDE_HOME || '/root' },
    })

    let buffer = ''
    let finalResult = ''

    proc.stdout.on('data', chunk => {
      buffer += chunk.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() // keep incomplete last line

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const event = JSON.parse(line)

          if (event.type === 'assistant' && event.message?.content) {
            for (const block of event.message.content) {
              if (block.type === 'thinking' && block.thinking) {
                // Emit first sentence of thinking as status
                const sentence = block.thinking.split(/[.!?]/)[0].trim()
                if (sentence.length > 5) onStatus(sentence)
              } else if (block.type === 'tool_use' && block.name === 'WebSearch' && block.input?.query) {
                onStatus(`Searching: ${block.input.query}`)
              }
            }
          }

          if (event.type === 'user' && event.message?.content) {
            for (const block of event.message.content) {
              if (block.tool_use_result?.results) {
                const count = block.tool_use_result.results.filter(r => typeof r === 'object' && r.content)
                  .flatMap(r => r.content).length
                if (count > 0) onStatus(`Found ${count} result${count !== 1 ? 's' : ''}`)
              }
            }
          }

          if (event.type === 'result') {
            finalResult = event.result || ''
          }
        } catch { /* skip non-JSON lines */ }
      }
    })

    let stderr = ''
    proc.stderr.on('data', d => { stderr += d })

    const timer = setTimeout(() => { proc.kill(); reject(new Error('Claude timed out')) }, 120000)

    proc.on('close', code => {
      clearTimeout(timer)
      if (code !== 0) return reject(new Error(`Claude exited ${code}: ${stderr.slice(0, 500)}`))
      const match = finalResult.match(/\[[\s\S]*\]/)
      if (!match) return resolve([])
      try {
        const results = JSON.parse(match[0])
        resolve(results.filter(r => r.name && r.url && r.url.startsWith('http')))
      } catch {
        resolve([])
      }
    })
  })
}

/**
 * Detect the CSS selector for the price element on a page.
 * Returns a selector string or null.
 */
export async function detectPriceSelector(url) {
  const br = await getBrowser()
  const page = await br.newPage()

  try {
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    })
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(2000)

    const html = await page.content()
    return await findSelectorWithClaude(html, url)
  } finally {
    await page.close()
  }
}

/**
 * Fetch product metadata from a URL or search query using Claude.
 */
export async function fetchProductMeta(url, query) {
  let context = query || ''

  if (url) {
    try {
      const br = await getBrowser()
      const page = await br.newPage()
      await page.setExtraHTTPHeaders({ 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' })
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.waitForTimeout(1500)
      // Extract key meta tags and title
      context = await page.evaluate(() => {
        const get = (sel) => document.querySelector(sel)?.content || document.querySelector(sel)?.textContent || ''
        return [
          document.title,
          get('meta[property="og:title"]'),
          get('meta[name="description"]'),
          get('meta[property="og:description"]'),
          get('meta[property="og:image"]'),
        ].filter(Boolean).join('\n')
      })
      await page.close()
    } catch {
      // Best effort
    }
  }

  const prompt = `Extract product metadata from the following text/HTML context.
Return a JSON object with these fields (use null for missing fields):
{
  "name": "product name",
  "brand": "brand name",
  "model": "model number if available",
  "description": "short 1-2 sentence description",
  "category": "product category",
  "image_url": "image URL if found"
}

Context:
${context.slice(0, 3000)}

URL: ${url || 'none'}

Respond with ONLY valid JSON, no markdown, no explanation.`

  try {
    const text = await callClaude(prompt)
    return JSON.parse(text.trim())
  } catch {
    return { name: query || 'Unknown Product', brand: null, description: null, image_url: null }
  }
}

// ── Internals ──────────────────────────────────────────────────────────────────


async function findPriceWithHeuristics(page) {
  // 1. Shopify: extract from window.ShopifyAnalytics or product JSON script tag
  //    Only applied on confirmed Shopify stores (window.Shopify must exist) to
  //    avoid false positives from non-Shopify sites with JSON data blobs in cents.
  try {
    const shopifyPrice = await page.evaluate(() => {
      if (!window.Shopify) return null  // not a Shopify store — skip entirely
      // Try ShopifyAnalytics
      if (window.ShopifyAnalytics?.meta?.product?.variants) {
        const variants = window.ShopifyAnalytics.meta.product.variants
        if (variants.length > 0 && variants[0].price != null) {
          return variants[0].price / 100 // Shopify prices are in cents
        }
      }
      // Try product JSON script tag (Shopify-only path — safe to assume cents)
      const scripts = document.querySelectorAll('script[type="application/json"]')
      for (const s of scripts) {
        try {
          const data = JSON.parse(s.textContent)
          if (data.price != null && typeof data.price === 'number') {
            return data.price > 1000 ? data.price / 100 : data.price
          }
          if (data.variants?.[0]?.price != null) {
            const p = data.variants[0].price
            return p > 1000 ? p / 100 : p
          }
        } catch {}
      }
      return null
    })
    if (shopifyPrice && shopifyPrice > 0) {
      return { price: shopifyPrice, currency: 'AUD', selector: null }
    }
  } catch {}

  // 2. Try specific CSS selectors (avoid generic .price — too ambiguous)
  const SPECIFIC_SELECTORS = [
    '[itemprop="price"]',
    '[data-product-price]',
    '[data-price]',
    '.product-price__current',
    '.product__price',
    '.price__current',
    '.woocommerce-Price-amount',
    '.price ins .amount',
    '.js-price',
    '.price-value',
    '.product__current-price',
    '.price-box.price-final_price',   // Magento (Selby, etc.)
    '.price-wrapper',                  // Magento inner wrapper
    '.a-price .a-offscreen',
    '#priceblock_ourprice',
    '#priceblock_dealprice',
    '.apexPriceToPay .a-offscreen',
    '[class*="price"][class*="current"]',
    '[class*="current"][class*="price"]',
  ]
  for (const sel of SPECIFIC_SELECTORS) {
    try {
      const text = await page.$eval(sel, el => {
        // Prefer machine-readable content attribute (schema.org / Magento)
        const content = el.getAttribute('content')
        if (content && /^\d[\d.,]*$/.test(content.trim())) return content.trim()
        return el.textContent.trim()
      })
      if (text) {
        const price = parsePrice(text)
        if (price !== null && price > 0) {
          return { price, currency: detectCurrency(text), selector: sel }
        }
      }
    } catch {
      // selector not found, try next
    }
  }

  // 3. Last resort: scan page text for price patterns — take the first match in
  //    main content, skipping header/footer/nav/aside/related-product containers
  try {
    const result = await page.evaluate(() => {
      const priceRe = /(?:A\$|US\$|\$|£|€)\s*[\d,]+(?:\.\d{1,2})?/
      const IGNORE_TAGS = new Set(['HEADER', 'FOOTER', 'NAV', 'ASIDE'])
      const IGNORE_CLS = /related|recommend|sidebar|cross.?sell|upsell|recently.?viewed|you.?may|grid-product/i
      const all = document.querySelectorAll('span, div, p, strong, b, ins, h2, h3')
      const candidates = []
      outer: for (const el of all) {
        let anc = el.parentElement
        while (anc) {
          if (IGNORE_TAGS.has(anc.tagName)) continue outer
          if (typeof anc.className === 'string' && IGNORE_CLS.test(anc.className)) continue outer
          anc = anc.parentElement
        }
        const text = el.childNodes.length === 1 && el.firstChild.nodeType === 3
          ? el.textContent.trim()
          : ''
        // Only treat as a price if the non-price remainder is minimal (not a sentence with a price embedded)
        const remainder = text.replace(priceRe, '').trim()
        if (priceRe.test(text) && text.length < 30 && remainder.length < 5) {
          candidates.push(text)
        }
      }
      return candidates
    })
    if (result && result.length > 0) {
      for (const text of result) {
        const price = parseFloat(text.replace(/[^\d.]/g, ''))
        if (!isNaN(price) && price > 0) {
          return { price, currency: detectCurrency(text) }
        }
      }
    }
  } catch {}

  return null
}

async function findPriceWithVision(page, url) {
  // Use a tall viewport to capture more of the page without a huge full-page image
  await page.setViewportSize({ width: 1280, height: 1600 })
  await page.waitForTimeout(500)

  const screenshot = await page.screenshot({ fullPage: false, type: 'png' })
  const base64 = screenshot.toString('base64')

  const body = {
    model: VISION_MODEL,
    messages: [{
      role: 'user',
      content: `This is a screenshot of a product page. What is the current selling price shown?

Return ONLY a JSON object like: {"price": <number>, "currency": "<CODE>"}

Rules:
- price must be a number (no currency symbol)
- currency is the 3-letter ISO code (AUD, USD, GBP, EUR). Default to AUD for Australian stores.
- If there are multiple prices, use the current/sale price (not RRP or original)
- If NO price is visible in the screenshot, you MUST return {"price": null}
- Do NOT guess or invent a price. Only report what you can actually see.`,
      images: [base64],
    }],
    stream: false,
  }

  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  })

  if (!res.ok) throw new Error(`Ollama returned ${res.status}`)

  const data = await res.json()
  const text = data.message?.content || ''
  console.log('[scraper] Vision LLM raw response:', text.slice(0, 300))

  // Extract JSON from response (may have markdown fences or extra text)
  const match = text.match(/\{[\s\S]*?\}/)
  if (!match) return null

  try {
    const parsed = JSON.parse(match[0])
    if (parsed.price === null || parsed.price === undefined) return null
    return {
      price: parseFloat(parsed.price),
      currency: parsed.currency || 'AUD',
    }
  } catch {
    console.warn('[scraper] Vision LLM JSON parse failed:', match[0].slice(0, 200))
    return null
  }
}

async function findPriceWithClaude(html, url) {
  // Trim HTML to a reasonable size — focus on likely price areas
  const trimmed = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/\s+/g, ' ')
    .slice(0, 15000)

  const prompt = `You are a web scraping assistant. Extract the current selling price from this product page HTML.

URL: ${url}

HTML snippet:
${trimmed}

Return a JSON object:
{
  "price": 99.99,
  "currency": "AUD",
  "selector": ".optional-css-selector-that-works"
}

Rules:
- price must be a number (no currency symbol)
- currency is the 3-letter ISO code (AUD, USD, GBP, etc.)
- selector is optional — only include if you can identify a reliable CSS selector
- If you cannot find a price, return {"price": null}
- Respond with ONLY valid JSON`

  try {
    const text = await callClaude(prompt)
    const data = JSON.parse(text.trim())
    if (data.price === null || data.price === undefined) return null
    return {
      price: parseFloat(data.price),
      currency: data.currency || 'AUD',
      selector: data.selector || null,
    }
  } catch {
    return null
  }
}

async function findSelectorWithClaude(html, url) {
  const trimmed = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/\s+/g, ' ')
    .slice(0, 12000)

  const prompt = `Find the CSS selector for the price element on this product page.

URL: ${url}

HTML:
${trimmed}

Return ONLY a CSS selector string that reliably targets the price element (e.g. ".a-price .a-offscreen").
If you cannot determine a reliable selector, return null.
Respond with ONLY the selector string or null — no explanation, no JSON.`

  try {
    const sel = (await callClaude(prompt)).trim()
    return sel === 'null' || !sel ? null : sel
  } catch {
    return null
  }
}

async function detectInStock(page) {
  // Simple heuristic — look for out-of-stock indicators
  const text = await page.evaluate(() => document.body.innerText.toLowerCase())
  const outOfStockPatterns = ['out of stock', 'sold out', 'unavailable', 'currently unavailable', 'not available']
  return !outOfStockPatterns.some(p => text.includes(p))
}

function parsePrice(text) {
  const cleaned = text.replace(/[^\d.,]/g, '').replace(/,(?=\d{3})/g, '')
  const num = parseFloat(cleaned)
  return isNaN(num) ? null : num
}

function detectCurrency(text) {
  if (text.includes('A$') || text.includes('AUD')) return 'AUD'
  if (text.includes('US$') || text.includes('USD')) return 'USD'
  if (text.includes('£') || text.includes('GBP')) return 'GBP'
  if (text.includes('€') || text.includes('EUR')) return 'EUR'
  return 'AUD'
}
