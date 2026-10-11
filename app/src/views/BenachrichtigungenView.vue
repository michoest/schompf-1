<script setup>
import { ref, computed, onMounted } from 'vue'
import api from '@/services/api'
import { useAppStore } from '@/stores'

const appStore = useAppStore()
const config = ref(null)
const busy = ref(false)
const permission = ref(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported')

const supported = 'serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined'
const isIos = /iPhone|iPad/.test(navigator.userAgent)
const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
const needsInstall = computed(() => isIos && !standalone)

const types = [
  { key: 'plan', title: 'Planung', text: 'Wenn jemand anderes Mahlzeiten plant oder einen Einkauf erstellt' },
  { key: 'prep', title: 'Vorbereitungen', text: 'Z.B. „Kichererbsen einweichen“ rechtzeitig vorher (nachts verschoben auf 21 Uhr am Vorabend)' },
  { key: 'cook', title: 'Kochzeiten', text: 'Zur Mahlzeit (8, 12, 17 Uhr) mit direktem Link zum Rezept' },
  { key: 'buy', title: 'Später kaufen', text: 'Am Tag, ab dem frische Produkte wie Hackleisch gekauft werden sollten' },
]

function keyToBytes(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

async function load() {
  try { config.value = await api.pushConfig() } catch (e) { appStore.showError(e) }
}

async function enable() {
  busy.value = true
  try {
    permission.value = await Notification.requestPermission()
    if (permission.value !== 'granted') {
      appStore.showSnackbar('Benachrichtigungen wurden nicht erlaubt', 'warning')
      return
    }
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(config.value.publicKey) })
    await api.pushSubscribe(subscription.toJSON())
    await load()
    appStore.showSnackbar('Benachrichtigungen sind an')
  } catch (e) {
    appStore.showError(e, 'Einschalten hat nicht geklappt')
  } finally {
    busy.value = false
  }
}

async function disable() {
  busy.value = true
  try {
    const registration = await navigator.serviceWorker.ready
    await (await registration.pushManager.getSubscription())?.unsubscribe()
    await api.pushUnsubscribe()
    await load()
  } catch (e) {
    appStore.showError(e)
  } finally {
    busy.value = false
  }
}

async function setType(key, value) {
  try { config.value.settings = await api.pushSettings({ [key]: value }) } catch (e) { appStore.showError(e) }
}

async function test() {
  try {
    const { sent } = await api.pushTest()
    appStore.showSnackbar(sent ? 'Test-Nachricht ist unterwegs' : 'Für dieses Gerät ist kein Abo aktiv', sent ? 'success' : 'warning')
  } catch (e) { appStore.showError(e) }
}

onMounted(load)
</script>

<template>
  <div v-if="config">
    <v-alert v-if="!config.enabled" type="info" variant="tonal" class="mb-4">Auf dem Server sind Benachrichtigungen noch nicht eingerichtet.</v-alert>
    <v-alert v-else-if="needsInstall" type="info" variant="tonal" class="mb-4">
      Auf dem iPhone funktionieren Benachrichtigungen nur in der installierten App: in Safari auf „Teilen“ → „Zum Home-Bildschirm“, dann Schompf von dort öffnen.
    </v-alert>
    <v-alert v-else-if="!supported" type="warning" variant="tonal" class="mb-4">Dieser Browser unterstützt keine Benachrichtigungen.</v-alert>

    <v-card class="mb-4">
      <v-card-text class="d-flex align-center">
        <v-icon :icon="config.subscribed ? 'mdi-bell-ring-outline' : 'mdi-bell-off-outline'" size="32" :color="config.subscribed ? 'primary' : undefined" class="mr-4" />
        <div class="flex-grow-1">
          <div class="text-subtitle-1">{{ config.subscribed ? 'An auf diesem Gerät' : 'Aus auf diesem Gerät' }}</div>
          <div v-if="permission === 'denied'" class="text-caption text-error">In den Einstellungen des Geräts blockiert.</div>
        </div>
        <v-btn v-if="!config.subscribed" color="primary" :loading="busy" :disabled="!config.enabled || !supported || needsInstall" @click="enable">Einschalten</v-btn>
        <v-btn v-else variant="text" :loading="busy" @click="disable">Ausschalten</v-btn>
      </v-card-text>
    </v-card>

    <v-card class="mb-4">
      <v-list lines="three">
        <v-list-item v-for="t in types" :key="t.key" :title="t.title" :subtitle="t.text">
          <template #append>
            <v-switch :model-value="config.settings[t.key]" color="primary" hide-details density="compact" :disabled="!config.subscribed" @update:model-value="v => setType(t.key, v)" />
          </template>
        </v-list-item>
      </v-list>
    </v-card>

    <v-btn v-if="config.subscribed" variant="tonal" prepend-icon="mdi-bell-check-outline" @click="test">Test-Nachricht senden</v-btn>
    <p class="text-caption text-medium-emphasis mt-4">
      Die Einstellungen gelten pro Gerät. Ob eine Nachricht einen Ton macht, entscheidet das iPhone (Einstellungen → Mitteilungen → Schompf).
    </p>
  </div>
</template>
