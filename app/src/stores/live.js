import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '@/services/api'
import { useSessionStore, useDataStore } from '@/stores'

/**
 * Live-Sync: hält die Event-Verbindung und zählt Änderungen pro Bereich.
 * Ansichten beobachten `version[scope]` und laden dann neu.
 */
export const useLiveStore = defineStore('live', () => {
  const version = ref({ meals: 0, trips: 0, 'free-items': 0, dishes: 0, products: 0 })
  const lastChange = ref(null)
  let unsubscribe = null
  let retryTimer = null

  function bump(scope) {
    version.value = { ...version.value, [scope]: (version.value[scope] ?? 0) + 1 }
  }

  function start() {
    stop()
    const session = useSessionStore()
    const data = useDataStore()
    unsubscribe = api.subscribe(event => {
      if (event.deviceId === session.deviceId) return
      lastChange.value = event
      if (event.scope === 'dishes') data.reloadDishes()
      if (event.scope === 'products') data.reloadProducts()
      bump(event.scope)
    })
  }

  function stop() {
    unsubscribe?.()
    unsubscribe = null
    clearTimeout(retryTimer)
  }

  // Nach dem Aufwachen (App wieder im Vordergrund) neu verbinden und alles auffrischen
  function resume() {
    start()
    for (const scope of Object.keys(version.value)) bump(scope)
  }

  return { version, lastChange, start, stop, resume }
})
