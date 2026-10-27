import { ref } from 'vue'

// App-Version und „Neu laden“ (Einstellungen). Der Service Worker übernimmt neue Versionen sofort (skipWaiting);
// forceUpdate() schaut ausdrücklich nach einer neuen Version, wartet kurz auf sie und lädt dann neu.
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'
export const BUILD_TIME = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : null
export const updateState = ref('idle') // idle | checking | reloading

let registration = null
export function setRegistration(reg) { registration = reg }

const waitFor = (worker, state, ms = 8000) => new Promise(resolve => {
  if (!worker || worker.state === state) return resolve()
  const timer = setTimeout(resolve, ms)
  worker.addEventListener('statechange', () => { if (worker.state === state) { clearTimeout(timer); resolve() } })
})

export async function forceUpdate() {
  updateState.value = 'checking'
  const reg = registration ?? await navigator.serviceWorker?.getRegistration().catch(() => null)
  if (reg) {
    await reg.update().catch(() => {})
    if (reg.installing) await waitFor(reg.installing, 'activated')
  }
  updateState.value = 'reloading'
  location.reload()
}
