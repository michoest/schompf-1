<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/services/api'
import { useAppStore, useSessionStore } from '@/stores'
import { useLiveStore } from '@/stores/live'
import { APP_VERSION, BUILD_TIME, updateState, forceUpdate } from '@/utils/update'
import FeedbackDialog from '@/components/FeedbackDialog.vue'

const router = useRouter()
const appStore = useAppStore()
const session = useSessionStore()
const live = useLiveStore()

const generalNav = [
  { title: 'Benachrichtigungen', subtitle: 'Erinnerungen auf diesem Gerät', icon: 'mdi-bell-outline', to: '/einstellungen/benachrichtigungen' },
  { title: 'Anmerkungen', subtitle: 'Was euch an Gerichten aufgefallen ist', icon: 'mdi-message-text-outline', to: '/verwaltung/anmerkungen' },
]
const adminNav = [
  { title: 'Gerichte', icon: 'mdi-book-open-variant', to: '/verwaltung/gerichte' },
  { title: 'Produkte', icon: 'mdi-food-apple-outline', to: '/verwaltung/produkte' },
  { title: 'Läden & Warengruppen', icon: 'mdi-store-outline', to: '/verwaltung/laeden' },
]
const feedbackDialog = ref(false)

const fmt = iso => (iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '–')
function ago(iso) {
  if (!iso) return 'noch nie aktiv'
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60000)
  if (minutes < 15) return 'gerade aktiv'
  if (minutes < 60) return `vor ${minutes} Min. aktiv`
  if (minutes < 24 * 60) return `vor ${Math.round(minutes / 60)} Std. aktiv`
  const days = Math.round(minutes / (24 * 60))
  return days === 1 ? 'gestern aktiv' : `vor ${days} Tagen aktiv`
}
const deviceIcon = name => /iphone/i.test(name) ? 'mdi-cellphone'
  : /ipad/i.test(name) ? 'mdi-tablet'
  : /mac|laptop|computer/i.test(name) ? 'mdi-laptop'
  : /kairos|claude/i.test(name) ? 'mdi-connection' : 'mdi-devices'

// Geräte
const devices = ref([])
const persons = ref([])
const otherDevices = computed(() => devices.value.filter(d => !d.current))
async function loadDevices() {
  try {
    [devices.value, persons.value] = await Promise.all([api.devices(), api.persons()])
  } catch (e) { appStore.showError(e) }
}
onMounted(loadDevices)

const confirmRevoke = ref(null)
async function revoke(device) {
  confirmRevoke.value = null
  try {
    await api.deleteDevice(device.id)
    appStore.showSnackbar(`${device.person} – ${device.name} abgemeldet`)
    await loadDevices()
  } catch (e) { appStore.showError(e) }
}

// Neues Gerät anmelden: Einmal-Code für eine Person
const pairDialog = ref(false)
const pairPerson = ref(null)
const pairing = ref(null)   // { code, person, expiresAt }
const pairBusy = ref(false)
function openPairing() {
  pairPerson.value = session.person?.id ?? null
  pairing.value = null
  pairDialog.value = true
}
async function createCode() {
  pairBusy.value = true
  try {
    pairing.value = await api.createPairingCode(pairPerson.value)
  } catch (e) { appStore.showError(e) } finally { pairBusy.value = false }
}
async function copyCode() {
  try {
    await navigator.clipboard.writeText(pairing.value.code)
    appStore.showSnackbar('Code kopiert')
  } catch { /* nicht verfügbar */ }
}
const appUrl = location.host

const confirmLogout = ref(false)
function logout() {
  live.stop()
  session.logout()
  router.push('/login')
}
</script>

<template>
  <div class="einstellungen">
    <!-- Version + Neu laden -->
    <v-card class="pa-4 mb-2">
      <div class="d-flex align-center ga-3">
        <v-icon icon="mdi-cellphone-check" class="text-medium-emphasis" />
        <div class="flex-grow-1 text-body-2">
          Version <b>{{ APP_VERSION }}</b>
          <div class="text-caption text-medium-emphasis">{{ BUILD_TIME ? `gebaut ${fmt(BUILD_TIME)}` : '' }}</div>
        </div>
        <v-btn color="primary" variant="tonal" prepend-icon="mdi-refresh" :loading="updateState !== 'idle'" @click="forceUpdate">Neu laden</v-btn>
      </div>
    </v-card>

    <div class="section-title">Konto</div>
    <v-card>
      <v-list-item class="py-3">
        <template #prepend>
          <v-avatar color="primary" variant="tonal" class="mr-1">{{ session.person?.name?.[0] ?? '?' }}</v-avatar>
        </template>
        <v-list-item-title class="text-body-1 font-weight-medium">{{ session.person?.name ?? '…' }}</v-list-item-title>
        <v-list-item-subtitle>Dieses Gerät: {{ session.device?.name ?? '…' }}</v-list-item-subtitle>
        <template #append>
          <v-btn variant="text" color="error" prepend-icon="mdi-logout" @click="confirmLogout = true">Abmelden</v-btn>
        </template>
      </v-list-item>
    </v-card>

    <div class="section-title">Allgemein</div>
    <v-card>
      <v-list class="py-0">
        <v-list-item v-for="item in generalNav" :key="item.to" :to="item.to" :prepend-icon="item.icon" :title="item.title" :subtitle="item.subtitle" append-icon="mdi-chevron-right" />
        <v-list-item prepend-icon="mdi-message-plus-outline" title="Feedback geben" subtitle="Idee, Fehler, Wunsch" @click="feedbackDialog = true" />
      </v-list>
    </v-card>

    <div class="section-title">Verwaltung</div>
    <v-card>
      <v-list class="py-0">
        <v-list-item v-for="item in adminNav" :key="item.to" :to="item.to" :prepend-icon="item.icon" :title="item.title" append-icon="mdi-chevron-right" />
      </v-list>
    </v-card>

    <div class="section-title">Geräte</div>
    <v-card>
      <v-list class="py-0">
        <v-list-item v-for="d in devices" :key="d.id" :prepend-icon="deviceIcon(d.name)">
          <v-list-item-title>{{ d.person }} – {{ d.name }}</v-list-item-title>
          <v-list-item-subtitle>{{ d.current ? 'dieses Gerät' : ago(d.last_seen_at) }}</v-list-item-subtitle>
          <template #append>
            <v-chip v-if="d.current" size="x-small" color="primary" variant="tonal">du</v-chip>
            <v-btn v-else icon="mdi-close" size="small" variant="text" aria-label="Abmelden" @click="confirmRevoke = d" />
          </template>
        </v-list-item>
      </v-list>
      <div class="pa-3 pt-1">
        <v-btn block variant="tonal" color="primary" prepend-icon="mdi-cellphone-link" @click="openPairing">Neues Gerät anmelden</v-btn>
      </div>
    </v-card>
    <p v-if="otherDevices.length" class="text-caption text-medium-emphasis mt-2 px-1">
      Abmelden wirkt sofort: Das Gerät braucht danach einen neuen Code.
    </p>

    <!-- Neues Gerät -->
    <v-dialog v-model="pairDialog" max-width="420">
      <v-card title="Neues Gerät anmelden">
        <v-card-text>
          <template v-if="!pairing">
            <p class="text-body-2 mb-3">Für wen ist das Gerät?</p>
            <div class="d-flex ga-2 flex-wrap">
              <v-chip v-for="p in persons" :key="p.id" :color="pairPerson === p.id ? 'primary' : undefined" :variant="pairPerson === p.id ? 'flat' : 'outlined'"
                :prepend-icon="pairPerson === p.id ? 'mdi-check' : undefined" @click="pairPerson = p.id">{{ p.name }}</v-chip>
            </div>
          </template>
          <template v-else>
            <div class="text-body-2 mb-2">Code für {{ pairing.person.name }}:</div>
            <div class="code-box" @click="copyCode">{{ pairing.code }}</div>
            <div class="text-caption text-medium-emphasis text-center mt-1">gültig bis {{ fmt(pairing.expiresAt) }} · einmal verwendbar</div>
            <ol class="text-body-2 steps mt-4">
              <li>Auf dem iPhone in <b>Safari</b> {{ appUrl }} öffnen.</li>
              <li>Teilen → <b>Zum Home-Bildschirm</b>.</li>
              <li>Schompf <b>vom Home-Bildschirm</b> öffnen und dort den Code eingeben – nicht im Safari-Tab, sonst ist er verbraucht und die App kennt ihn nicht.</li>
            </ol>
          </template>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <template v-if="!pairing">
            <v-btn variant="text" @click="pairDialog = false">Abbrechen</v-btn>
            <v-btn color="primary" variant="flat" :disabled="!pairPerson" :loading="pairBusy" @click="createCode">Code erzeugen</v-btn>
          </template>
          <template v-else>
            <v-btn variant="text" prepend-icon="mdi-content-copy" @click="copyCode">Kopieren</v-btn>
            <v-btn color="primary" variant="flat" @click="pairDialog = false; loadDevices()">Fertig</v-btn>
          </template>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog :model-value="!!confirmRevoke" max-width="380" @update:model-value="confirmRevoke = null">
      <v-card v-if="confirmRevoke" :title="`${confirmRevoke.person} – ${confirmRevoke.name} abmelden?`">
        <v-card-text class="text-body-2">Das Gerät braucht danach einen neuen Code.</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="confirmRevoke = null">Abbrechen</v-btn>
          <v-btn color="error" variant="flat" @click="revoke(confirmRevoke)">Abmelden</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="confirmLogout" max-width="380">
      <v-card title="Auf diesem Gerät abmelden?">
        <v-card-text class="text-body-2">Zum erneuten Anmelden braucht ihr einen neuen Code.</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="confirmLogout = false">Abbrechen</v-btn>
          <v-btn color="error" variant="flat" @click="logout">Abmelden</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <FeedbackDialog v-model="feedbackDialog" />
  </div>
</template>

<style scoped>
.einstellungen { max-width: 640px; margin: 0 auto; }
.section-title { font-size: .72rem; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: rgba(var(--v-theme-on-surface), .55); margin: 20px 4px 8px; }
.code-box {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 2rem; font-weight: 600; letter-spacing: .25em;
  text-align: center; padding: 14px; border-radius: 12px; background: rgba(var(--v-theme-primary), .08); color: rgb(var(--v-theme-primary)); cursor: pointer;
}
.steps { padding-left: 1.2em; }
.steps li { margin-bottom: 6px; line-height: 1.4; }
</style>
