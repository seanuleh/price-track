// Minimal PocketBase admin client (no SDK dependency — just fetch)
const PB_URL = process.env.POCKETBASE_URL || 'http://localhost:8090'
const ADMIN_EMAIL    = process.env.POCKETBASE_ADMIN_EMAIL
const ADMIN_PASSWORD = process.env.POCKETBASE_ADMIN_PASSWORD

let _token = null
let _tokenExpiry = 0

async function getToken() {
  if (_token && Date.now() < _tokenExpiry) return _token

  const res = await fetch(`${PB_URL}/api/admins/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  })
  if (!res.ok) throw new Error(`PB admin auth failed: ${res.status}`)
  const data = await res.json()
  _token = data.token
  _tokenExpiry = Date.now() + 55 * 60 * 1000  // 55 min
  return _token
}

export async function pbGet(path, params = {}) {
  const token = await getToken()
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(`${PB_URL}/api/${path}${qs ? '?' + qs : ''}`, {
    headers: { Authorization: token },
  })
  if (!res.ok) throw new Error(`PB GET ${path}: ${res.status}`)
  return res.json()
}

export async function pbPost(path, body) {
  const token = await getToken()
  const res = await fetch(`${PB_URL}/api/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`PB POST ${path}: ${JSON.stringify(data)}`)
  return data
}

export async function pbPatch(path, body) {
  const token = await getToken()
  const res = await fetch(`${PB_URL}/api/${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`PB PATCH ${path}: ${JSON.stringify(data)}`)
  return data
}

// Get all items from a collection (handles pagination)
export async function pbList(collection, filter = '') {
  const token = await getToken()
  let page = 1
  const items = []
  while (true) {
    const params = new URLSearchParams({ page, perPage: 200, ...(filter ? { filter } : {}) })
    const res = await fetch(`${PB_URL}/api/collections/${collection}/records?${params}`, {
      headers: { Authorization: token },
    })
    if (!res.ok) throw new Error(`PB list ${collection}: ${res.status}`)
    const data = await res.json()
    items.push(...data.items)
    if (page >= data.totalPages) break
    page++
  }
  return items
}

export async function pbCreate(collection, body) {
  const token = await getToken()
  const res = await fetch(`${PB_URL}/api/collections/${collection}/records`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`PB create ${collection}: ${JSON.stringify(data)}`)
  return data
}

export async function pbUpdate(collection, id, body) {
  const token = await getToken()
  const res = await fetch(`${PB_URL}/api/collections/${collection}/records/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`PB update ${collection}/${id}: ${JSON.stringify(data)}`)
  return data
}
