import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import pb from './pb.js'
import './index.css'

// The cfAuth sidecar writes the auth token directly into the `pocketbase_auth`
// localStorage key. A direct write does NOT fire authStore.onChange, so the
// realtime client may open its SSE connection unauthenticated — the server then
// applies each collection's viewRule (user = @request.auth.id) and silently
// drops every event, so the UI never receives worker updates (e.g. last_checked
// after a scrape). Re-save the persisted auth through the SDK so onChange fires
// and realtime re-submits all subscriptions WITH the Authorization header.
try {
  const raw = localStorage.getItem('pocketbase_auth')
  if (raw) {
    const { token, model } = JSON.parse(raw)
    if (token && (!pb.authStore.isValid || pb.authStore.token !== token)) {
      pb.authStore.save(token, model)
    }
  }
} catch (e) {
  console.warn('[auth] Failed to rehydrate authStore from localStorage:', e.message)
}

// If the sidecar rewrites the token later (e.g. token refresh), pick it up so
// realtime re-auths. `storage` fires cross-tab; harmless no-op if unchanged.
window.addEventListener('storage', (e) => {
  if (e.key !== 'pocketbase_auth' || !e.newValue) return
  try {
    const { token, model } = JSON.parse(e.newValue)
    if (token && pb.authStore.token !== token) pb.authStore.save(token, model)
  } catch {}
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
