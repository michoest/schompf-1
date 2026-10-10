import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api, { setToken, hasToken } from '@/services/api'

export const useAppStore = defineStore('app', () => {
  const snackbar = ref({ show: false, message: '', color: 'success' })

  function showSnackbar(message, color = 'success') {
    snackbar.value = { show: true, message, color }
  }
  function hideSnackbar() {
    snackbar.value.show = false
  }
  /** Fehler aus der API verständlich anzeigen (inkl. Validierungsdetails). */
  function showError(error, fallback = 'Das hat nicht geklappt') {
    const message = error?.details?.length ? error.details.join(' · ') : (error?.message || fallback)
    showSnackbar(message, 'error')
  }

  return { snackbar, showSnackbar, hideSnackbar, showError }
})

export const useSessionStore = defineStore('session', () => {
  const person = ref(null)
  const device = ref(null)
  const loggedIn = ref(hasToken())
  // Eigene Geräte-ID, damit Live-Events des eigenen Geräts nicht doppelt laden
  const deviceId = computed(() => device.value?.id ?? null)

  async function pair(code, deviceName) {
    const result = await api.pair(code, deviceName)
    setToken(result.token)
    person.value = result.person
    device.value = result.device
    loggedIn.value = true
  }

  async function load() {
    if (!hasToken()) return
    const me = await api.me()
    person.value = me.person
    device.value = me.device
  }

  function logout() {
    setToken(null)
    person.value = null
    device.value = null
    loggedIn.value = false
  }

  return { person, device, deviceId, loggedIn, pair, load, logout }
})

/** Selten geänderte Daten: Struktur, Produkte, Gerichte. Einmal laden, bei Live-Events neu. */
export const useDataStore = defineStore('data', () => {
  const structure = ref(null)
  const products = ref([])
  const dishes = ref([])
  const loaded = ref(false)

  const slots = computed(() => structure.value?.mealSlots ?? [])
  const units = computed(() => structure.value?.units ?? [])
  const stores = computed(() => structure.value?.stores ?? [])
  const groups = computed(() => structure.value?.groups ?? [])
  const dishById = computed(() => new Map(dishes.value.map(d => [d.id, d])))
  const activeDishes = computed(() => dishes.value.filter(d => d.status === 'active'))
  const categories = computed(() => [...new Set(dishes.value.flatMap(d => d.categories))].sort((a, b) => a.localeCompare(b)))

  async function load(force = false) {
    if (loaded.value && !force) return
    const [s, p, d] = await Promise.all([api.structure(), api.products(), api.dishes()])
    structure.value = s
    products.value = p
    dishes.value = d
    loaded.value = true
  }
  async function reloadDishes() { dishes.value = await api.dishes() }
  async function reloadProducts() { products.value = await api.products() }

  return { structure, products, dishes, loaded, slots, units, stores, groups, dishById, activeDishes, categories, load, reloadDishes, reloadProducts }
})
