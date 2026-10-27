const API_URL = import.meta.env.VITE_API_URL || ''
const TOKEN_KEY = 'schompf.token'

export class ApiError extends Error {
  constructor(message, status, details = []) {
    super(message)
    this.status = status
    this.details = details
  }
}

function readToken() {
  try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
}

let token = readToken()
let onUnauthorized = () => {}

export function setToken(value) {
  token = value
  try {
    if (value) localStorage.setItem(TOKEN_KEY, value)
    else localStorage.removeItem(TOKEN_KEY)
  } catch { /* privater Modus */ }
}

export const hasToken = () => !!token
export const setUnauthorizedHandler = fn => { onUnauthorized = fn }

async function request(method, path, body) {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (response.status === 401) {
    onUnauthorized()
    throw new ApiError('Nicht angemeldet', 401)
  }
  if (response.status === 204) return null
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new ApiError(data?.error || `Fehler ${response.status}`, response.status, data?.details ?? [])
  return data
}

const get = path => request('GET', path)
const post = (path, body) => request('POST', path, body ?? {})
const put = (path, body) => request('PUT', path, body ?? {})
const del = path => request('DELETE', path)

export default {
  // Anmeldung
  pair: (code, deviceName) => post('/api/auth/pair', { code, deviceName }),
  me: () => get('/api/auth/me'),

  structure: () => get('/api/structure'),

  products: () => get('/api/products'),
  createProduct: data => post('/api/products', data),
  updateProduct: (id, data) => put(`/api/products/${id}`, data),
  deleteProduct: id => del(`/api/products/${id}`),

  dishes: () => get('/api/dishes'),
  dish: id => get(`/api/dishes/${id}`),
  dishChanges: id => get(`/api/dishes/${id}/changes`),
  createDish: data => post('/api/dishes', data),
  updateDish: (id, data) => put(`/api/dishes/${id}`, data),
  deleteDish: id => del(`/api/dishes/${id}`),

  meals: (from, to) => get(`/api/meals?from=${from}&to=${to}`),
  createMeal: data => post('/api/meals', data),
  updateMeal: (id, data) => put(`/api/meals/${id}`, data),
  deleteMeal: (id, syncTrip = false) => del(`/api/meals/${id}${syncTrip ? '?syncTrip=1' : ''}`),
  previewMeal: body => post('/api/meals/preview', body),
  mealOpenNeeds: id => get(`/api/meals/${id}/open-needs`),

  persons: () => get('/api/persons'),
  devices: () => get('/api/devices'),
  deleteDevice: id => del(`/api/devices/${id}`),
  createPairingCode: personId => post('/api/auth/codes', { personId }),

  tripSuggestion: () => get('/api/trips/suggestion'),
  currentTrip: () => get('/api/trips/current'),
  takeOverPlan: to => post('/api/trips/current/plan', { to }),
  finishTrip: () => post('/api/trips/current/finish', {}),
  createTrip: data => post('/api/trips', data),
  updateTrip: (id, data) => put(`/api/trips/${id}`, data),
  setTripItem: (tripId, productId, part, data) => put(`/api/trips/${tripId}/items/${productId}/${part}`, data),
  addTripFreeItem: (tripId, text) => post(`/api/trips/${tripId}/free-items`, { text }),
  addReminder: (storeId, text) => post('/api/free-items', { storeId, text }),
  updateFreeItem: (id, data) => put(`/api/free-items/${id}`, data),
  deleteFreeItem: id => del(`/api/free-items/${id}`),

  feedback: (params = {}) => get(`/api/feedback?${new URLSearchParams(params)}`),
  addFeedback: (text, dishId = null) => post('/api/feedback', { text, dishId }),
  updateFeedback: (id, data) => put(`/api/feedback/${id}`, data),

  pushConfig: () => get('/api/push/config'),
  pushSubscribe: subscription => post('/api/push/subscribe', { subscription }),
  pushUnsubscribe: () => del('/api/push/subscribe'),
  pushSettings: settings => put('/api/push/settings', settings),
  pushTest: () => post('/api/push/test'),

  /**
   * Live-Sync: ruft onChange({ scope, by, deviceId }) bei jeder Änderung auf einem Gerät auf.
   * Server-Sent Events per fetch statt EventSource, damit das Token im Header steht und nicht in der URL
   * (sonst landet es in Proxy-Logs). Verbindet sich nach Abbruch selbst neu, wie EventSource.
   */
  subscribe(onChange) {
    if (!token) return () => {}
    let controller = null
    let retryTimer = null
    let stopped = false
    let delay = 1000

    async function connect() {
      controller = new AbortController()
      try {
        const response = await fetch(`${API_URL}/api/events`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
          signal: controller.signal,
          cache: 'no-store',
        })
        if (response.status === 401) { onUnauthorized(); return }
        if (!response.ok || !response.body) throw new Error(`Status ${response.status}`)
        delay = 1000
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
        let buffer = ''
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += value.replace(/\r\n/g, '\n')
          let end
          while ((end = buffer.indexOf('\n\n')) >= 0) {
            dispatch(buffer.slice(0, end))
            buffer = buffer.slice(end + 2)
          }
        }
      } catch (e) {
        if (stopped) return
      }
      if (stopped) return
      retryTimer = setTimeout(connect, delay)
      delay = Math.min(delay * 2, 30000)
    }

    function dispatch(block) {
      let event = 'message'
      const data = []
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''))
      }
      if (event === 'change' && data.length) {
        try { onChange(JSON.parse(data.join('\n'))) } catch { /* kaputtes Ereignis überspringen */ }
      }
    }

    connect()
    return () => {
      stopped = true
      clearTimeout(retryTimer)
      controller?.abort()
    }
  },
}
