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
  deleteMeal: id => del(`/api/meals/${id}`),

  tripSuggestion: () => get('/api/trips/suggestion'),
  currentTrip: () => get('/api/trips/current'),
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

  /** Live-Sync: ruft onChange({ scope, by, deviceId }) bei jeder Änderung auf einem Gerät auf. */
  subscribe(onChange) {
    if (!token) return () => {}
    const source = new EventSource(`${API_URL}/api/events?token=${encodeURIComponent(token)}`)
    source.addEventListener('change', e => onChange(JSON.parse(e.data)))
    return () => source.close()
  },
}
