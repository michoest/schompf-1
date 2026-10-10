<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import api from '@/services/api'
import { useAppStore, useDataStore } from '@/stores'
import { useLiveStore } from '@/stores/live'
import { shortDate, formatAmount, parseNumber } from '@/utils/format'
import TripDialog from '@/components/TripDialog.vue'

const appStore = useAppStore()
const data = useDataStore()
const live = useLiveStore()

const list = ref(null)          // { trip, items, freeItems, reminders }
const loading = ref(true)
const tab = ref('pantry')
const showDone = ref(false)
const tripDialog = ref(false)
const editTrip = ref(null)

const sheet = ref(false)
const selected = ref(null)
const amountInput = ref('')
const unitInput = ref('')

const quickText = ref(null)
const quickTarget = ref('trip')  // 'trip' oder storeId (Merkliste)
const recent = ref(new Set())    // gerade abgehakt: noch kurz sichtbar lassen

const trip = computed(() => list.value?.trip ?? null)
const nowItems = computed(() => list.value?.items.filter(i => i.part === 'now') ?? [])
const laterItems = computed(() => list.value?.items.filter(i => i.part === 'later') ?? [])
const byName = (a, b) => a.name.localeCompare(b.name)

// Vorrat prüfen: nach Lagerort, Grundvorrat zugeklappt am Ende
const pantryGroups = computed(() => {
  const groups = new Map()
  for (const item of nowItems.value.filter(i => !i.isStaple && i.state !== 'skip')) {
    const key = item.storage?.id ?? 'none'
    if (!groups.has(key)) groups.set(key, { name: item.storage?.name ?? 'Sonstiges', sort: item.storage?.sort ?? 99, items: [] })
    groups.get(key).items.push(item)
  }
  return [...groups.values()].sort((a, b) => a.sort - b.sort).map(g => ({ ...g, items: g.items.sort(byName) }))
})
const staples = computed(() => nowItems.value.filter(i => i.isStaple && i.state !== 'skip').sort(byName))
const missingStaples = computed(() => staples.value.filter(i => i.state === 'open').length)
const skipped = computed(() => nowItems.value.filter(i => i.state === 'skip').sort(byName))

// Einkaufen: nach Laden und Abschnitt; nur was gekauft werden muss
const toBuy = item => item.state === 'open' || item.state === 'in_cart'
const shopStores = computed(() => {
  const stores = new Map()
  const storeEntry = store => {
    const key = store?.id ?? 'none'
    if (!stores.has(key)) stores.set(key, { id: store?.id ?? null, name: store?.name ?? 'Sonstiges', color: store?.color, sort: store?.sort ?? 99, sections: new Map(), reminders: [] })
    return stores.get(key)
  }
  for (const item of nowItems.value.filter(toBuy)) {
    const store = storeEntry(item.store)
    const key = item.section?.id ?? 'none'
    if (!store.sections.has(key)) store.sections.set(key, { name: item.section?.name ?? '', sort: item.section?.sort ?? 99, items: [] })
    store.sections.get(key).items.push(item)
  }
  for (const free of list.value?.freeItems ?? []) {
    if (free.state === 'have' || free.state === 'skip') continue
    const store = storeEntry(null)
    if (!store.sections.has('free')) store.sections.set('free', { name: 'Freie Artikel', sort: 100, items: [] })
    store.sections.get('free').items.push({ ...free, isFree: true, name: free.text, key: free.id })
  }
  for (const reminder of list.value?.reminders ?? []) {
    const store = data.stores.find(s => s.id === reminder.storeId)
    storeEntry(store ? { ...store, sort: data.stores.indexOf(store) } : null).reminders.push(reminder)
  }
  return [...stores.values()].sort((a, b) => a.sort - b.sort).map(store => {
    const sections = [...store.sections.values()].sort((a, b) => a.sort - b.sort)
      .map(s => ({ ...s, items: s.items.sort((a, b) => (a.state === 'in_cart') - (b.state === 'in_cart') || byName(a, b)) }))
      .map(s => ({ ...s, visible: showDone.value ? s.items : s.items.filter(i => i.state !== 'in_cart' || recent.value.has(i.key)) }))
    const open = sections.reduce((n, s) => n + s.items.filter(i => i.state !== 'in_cart').length, 0)
      + store.reminders.filter(r => r.state === 'open').length
    return { ...store, sections, open }
  })
})
const openCount = computed(() => shopStores.value.reduce((n, s) => n + s.open, 0))
const pantryOpen = computed(() => pantryGroups.value.reduce((n, g) => n + g.items.filter(i => i.state === 'open').length, 0))

async function load() {
  try {
    list.value = await api.currentTrip()
    if (list.value && loading.value) tab.value = list.value.trip.phase === 'shopping' ? 'shopping' : 'pantry'
  } catch (e) {
    appStore.showError(e)
  } finally {
    loading.value = false
  }
}

watch(() => [live.version.trips, live.version['free-items'], live.version.meals, live.version.dishes], load)
watch(tab, value => {
  const phase = value === 'shopping' ? 'shopping' : 'pantry'
  if (trip.value && trip.value.phase !== phase && trip.value.phase !== 'done') {
    trip.value.phase = phase
    api.updateTrip(trip.value.id, { phase }).catch(() => {})
  }
})
onMounted(load)

// Eingriffe: sofort lokal anzeigen, dann speichern
async function setItem(item, changes) {
  const before = { ...item }
  Object.assign(item, changes)
  try {
    await api.setTripItem(trip.value.id, item.productId, item.part, changes)
    if ('amount' in changes || 'useFallback' in changes) await load()
  } catch (e) {
    Object.assign(item, before)
    appStore.showError(e)
  }
}

async function setFree(item, state) {
  const before = item.state
  item.state = state
  try {
    await api.updateFreeItem(item.id, { state })
    await load()
  } catch (e) {
    item.state = before
    appStore.showError(e)
  }
}

function tapPantry(item) {
  setItem(item, { state: item.state === 'open' ? 'have' : 'open' })
}
function tapShop(item) {
  if (item.state !== 'in_cart') {
    recent.value = new Set(recent.value).add(item.key)
    setTimeout(() => { const next = new Set(recent.value); next.delete(item.key); recent.value = next }, 900)
  }
  if (item.isFree) return setFree(item, item.state === 'in_cart' ? 'open' : 'in_cart')
  setItem(item, { state: item.state === 'in_cart' ? 'open' : 'in_cart' })
}

function openSheet(item) {
  selected.value = item
  amountInput.value = ''
  unitInput.value = item.override?.unit ?? item.needed?.find(n => n.amount != null)?.unit ?? 'Stück'
  sheet.value = true
}
async function sheetAction(changes) {
  const item = selected.value
  sheet.value = false
  await setItem(item, changes)
}
async function saveAmount() {
  const amount = parseNumber(amountInput.value)
  if (!(amount > 0)) return appStore.showSnackbar('Menge eingeben', 'warning')
  await sheetAction({ amount, unit: unitInput.value })
}
async function deleteFree(item) {
  sheet.value = false
  try {
    await api.deleteFreeItem(item.id)
    await load()
  } catch (e) { appStore.showError(e) }
}

const fallbackName = item => {
  const group = data.groups.find(g => g.id === item.group?.id)
  return data.stores.find(s => s.id === group?.fallbackStoreId)?.name
}
const preferredName = item => {
  const group = data.groups.find(g => g.id === item.group?.id)
  return data.stores.find(s => s.id === group?.preferredStoreId)?.name
}

// Schnelleingabe: exakter Produktname wird zugeordnet, sonst freier Artikel
const productNames = computed(() => data.products.map(p => p.name))
async function quickAdd() {
  const text = (quickText.value ?? '').trim()
  if (!text) return
  try {
    if (quickTarget.value === 'trip') await api.addTripFreeItem(trip.value.id, text)
    else await api.addReminder(quickTarget.value, text)
    quickText.value = null
    appStore.showSnackbar(quickTarget.value === 'trip' ? `${text} hinzugefügt` : `${text} auf die Merkliste`)
    await load()
  } catch (e) { appStore.showError(e) }
}
const quickTargets = computed(() => [
  { title: 'Dieser Einkauf', value: 'trip' },
  ...data.stores.map(s => ({ title: `Bei Gelegenheit: ${s.name}`, value: s.id })),
])

async function finishTrip() {
  try {
    await api.updateTrip(trip.value.id, { phase: 'done' })
    appStore.showSnackbar('Einkauf abgeschlossen')
    await load()
  } catch (e) { appStore.showError(e) }
}

function onTripSaved(result) {
  list.value = result
  tab.value = 'pantry'
}

const sourceLabel = s => s.type === 'manual'
  ? `von Hand${s.by ? ` (${s.by})` : ''}: ${s.amount != null ? formatAmount(s.amount, s.unit, data.units) : ''}`
  : `${shortDate(s.date)} ${s.slotName}: ${s.dishName}${s.viaDish ? ` (${s.viaDish})` : ''} – ${formatAmount(s.amount, s.unit, data.units)}`
</script>

<template>
  <div v-if="loading" class="text-center pa-8"><v-progress-circular indeterminate color="primary" /></div>

  <div v-else-if="!trip" class="text-center pa-8">
    <v-icon icon="mdi-cart-outline" size="64" color="primary" class="mb-4" />
    <p class="text-body-1 mb-4">Gerade gibt es keinen offenen Einkauf.</p>
    <v-btn color="primary" @click="editTrip = null; tripDialog = true">Einkauf erstellen</v-btn>
    <TripDialog v-model="tripDialog" @saved="onTripSaved" />
  </div>

  <div v-else class="einkauf">
    <div class="d-flex align-center mb-2">
      <div class="flex-grow-1">
        <div class="text-subtitle-1 font-weight-medium">Einkauf {{ shortDate(trip.date) }}</div>
        <div class="text-caption text-medium-emphasis">für {{ shortDate(trip.coversFrom) }} – {{ shortDate(trip.coversTo) }}<span v-if="trip.createdBy"> · erstellt von {{ trip.createdBy }}</span></div>
      </div>
      <v-menu>
        <template #activator="{ props }"><v-btn icon="mdi-dots-horizontal" variant="text" v-bind="props" /></template>
        <v-list density="compact">
          <v-list-item prepend-icon="mdi-calendar-edit" title="Zeitraum ändern" @click="editTrip = trip; tripDialog = true" />
          <v-list-item :prepend-icon="showDone ? 'mdi-eye-off-outline' : 'mdi-eye-outline'" :title="showDone ? 'Erledigte ausblenden' : 'Erledigte zeigen'" @click="showDone = !showDone" />
          <v-list-item prepend-icon="mdi-cart-plus" title="Neuer Einkauf" @click="editTrip = null; tripDialog = true" />
          <v-list-item prepend-icon="mdi-check-all" title="Einkauf abschließen" @click="finishTrip" />
        </v-list>
      </v-menu>
    </div>

    <v-btn-toggle v-model="tab" mandatory color="primary" variant="outlined" divided density="comfortable" class="w-100 mb-3">
      <v-btn value="pantry" class="flex-grow-1">Vorrat prüfen<v-badge v-if="pantryOpen" :content="pantryOpen" inline color="primary" /></v-btn>
      <v-btn value="shopping" class="flex-grow-1">Einkaufen<v-badge v-if="openCount" :content="openCount" inline color="primary" /></v-btn>
    </v-btn-toggle>

    <!-- Vorrat prüfen -->
    <template v-if="tab === 'pantry'">
      <p class="text-caption text-medium-emphasis mb-2">Antippen, was noch da ist.</p>
      <v-card v-for="group in pantryGroups" :key="group.name" class="mb-3">
        <v-card-subtitle class="pt-3 font-weight-medium">{{ group.name }}</v-card-subtitle>
        <v-list density="compact" class="py-0">
          <v-list-item v-for="item in group.items" :key="item.key" :class="{ done: item.state !== 'open' }" @click="tapPantry(item)">
            <template #prepend>
              <v-icon :icon="item.state === 'have' ? 'mdi-home-variant' : item.state === 'in_cart' ? 'mdi-cart-check' : 'mdi-circle-outline'" :color="item.state === 'open' ? undefined : 'primary'" />
            </template>
            <v-list-item-title>{{ item.name }}</v-list-item-title>
            <template #append>
              <span class="text-body-2 text-medium-emphasis mr-1">{{ item.display }}</span>
              <v-btn icon="mdi-dots-horizontal" size="small" variant="text" @click.stop="openSheet(item)" />
            </template>
          </v-list-item>
        </v-list>
      </v-card>

      <v-expansion-panels v-if="staples.length" class="mb-3">
        <v-expansion-panel>
          <v-expansion-panel-title>
            Grundvorrat – alles da? ({{ staples.length }})
            <v-chip v-if="missingStaples" size="x-small" color="warning" class="ml-2">{{ missingStaples }} fehlt</v-chip>
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <p class="text-caption text-medium-emphasis mb-1">Nur antippen, was fehlt.</p>
            <v-list density="compact" class="py-0">
              <v-list-item v-for="item in staples" :key="item.key" @click="tapPantry(item)">
                <template #prepend>
                  <v-icon :icon="item.state === 'open' ? 'mdi-cart-arrow-down' : 'mdi-home-variant'" :color="item.state === 'open' ? 'warning' : 'primary'" />
                </template>
                <v-list-item-title>{{ item.name }}</v-list-item-title>
                <template #append><span class="text-caption text-medium-emphasis">{{ item.state === 'open' ? 'kaufen' : 'da' }}</span></template>
              </v-list-item>
            </v-list>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>

      <div v-if="!pantryGroups.length && !staples.length" class="text-center text-medium-emphasis pa-6">Für diesen Zeitraum ist nichts geplant, das eingekauft werden muss.</div>
      <v-btn v-if="pantryGroups.length" block color="primary" variant="tonal" class="mt-2" @click="tab = 'shopping'">Fertig – zum Einkaufen</v-btn>
    </template>

    <!-- Einkaufen -->
    <template v-else>
      <v-card v-for="store in shopStores" :key="store.id ?? 'none'" class="mb-3 store" :style="{ borderTopColor: store.color }">
        <v-card-title class="text-subtitle-1 d-flex align-center pb-0">
          {{ store.name }}
          <v-chip v-if="store.open" size="x-small" class="ml-2">{{ store.open }}</v-chip>
          <v-icon v-else icon="mdi-check-circle" color="primary" size="small" class="ml-2" />
        </v-card-title>
        <template v-for="section in store.sections" :key="section.name">
          <div v-if="section.visible.length" class="section-name text-caption text-medium-emphasis px-4 pt-2">{{ section.name }}</div>
          <v-list density="compact" class="py-0">
            <v-list-item v-for="item in section.visible" :key="item.key" :class="{ done: item.state === 'in_cart' }" @click="tapShop(item)">
              <template #prepend>
                <v-icon :icon="item.state === 'in_cart' ? 'mdi-checkbox-marked-circle' : 'mdi-checkbox-blank-circle-outline'" :color="item.state === 'in_cart' ? 'primary' : undefined" />
              </template>
              <v-list-item-title>{{ item.name }}</v-list-item-title>
              <v-list-item-subtitle v-if="item.useFallback">statt {{ preferredName(item) }}</v-list-item-subtitle>
              <template #append>
                <span class="text-body-2 text-medium-emphasis mr-1">{{ item.display }}</span>
                <v-btn icon="mdi-dots-horizontal" size="small" variant="text" @click.stop="openSheet(item)" />
              </template>
            </v-list-item>
          </v-list>
        </template>
        <template v-if="store.reminders.length">
          <div class="section-name text-caption text-medium-emphasis px-4 pt-2">Bei Gelegenheit</div>
          <v-list density="compact" class="py-0">
            <v-list-item v-for="r in store.reminders" :key="r.id" :class="{ done: r.state !== 'open' }" @click="setFree(r, r.state === 'open' ? 'in_cart' : 'open')">
              <template #prepend><v-icon :icon="r.state === 'open' ? 'mdi-bookmark-outline' : 'mdi-bookmark-check'" :color="r.state === 'open' ? undefined : 'primary'" /></template>
              <v-list-item-title>{{ r.text }}</v-list-item-title>
              <template #append>
                <span class="text-body-2 text-medium-emphasis mr-1">{{ r.display }}</span>
                <v-btn icon="mdi-close" size="small" variant="text" @click.stop="deleteFree(r)" />
              </template>
            </v-list-item>
          </v-list>
        </template>
        <div class="pb-2" />
      </v-card>

      <v-card v-if="laterItems.length" class="mb-3" variant="outlined">
        <v-card-title class="text-subtitle-1 pb-0">Später kaufen</v-card-title>
        <v-list density="compact">
          <v-list-item v-for="item in laterItems" :key="item.key" :class="{ done: item.state !== 'open' }" @click="tapShop(item)">
            <template #prepend><v-icon :icon="item.state === 'in_cart' ? 'mdi-checkbox-marked-circle' : 'mdi-clock-outline'" /></template>
            <v-list-item-title>{{ item.name }}</v-list-item-title>
            <v-list-item-subtitle>ab {{ shortDate(item.buyFrom) }} · {{ item.store?.name }}</v-list-item-subtitle>
            <template #append><span class="text-body-2 text-medium-emphasis">{{ item.display }}</span></template>
          </v-list-item>
        </v-list>
      </v-card>

      <div v-if="!openCount && !laterItems.length" class="text-center pa-6">
        <v-icon icon="mdi-party-popper" size="48" color="primary" class="mb-2" />
        <p class="mb-3">Alles erledigt!</p>
        <v-btn color="primary" variant="tonal" @click="finishTrip">Einkauf abschließen</v-btn>
      </div>
    </template>

    <v-expansion-panels v-if="skipped.length" class="mb-3" variant="accordion">
      <v-expansion-panel :title="`Nicht nötig (${skipped.length})`">
        <v-expansion-panel-text>
          <v-list density="compact" class="py-0">
            <v-list-item v-for="item in skipped" :key="item.key" :title="item.name" :subtitle="item.display" @click="setItem(item, { state: 'open' })">
              <template #append><span class="text-caption">doch kaufen</span></template>
            </v-list-item>
          </v-list>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>

    <!-- Schnelleingabe -->
    <v-card class="quick-add" elevation="6">
      <div class="d-flex align-center pa-2 ga-2">
        <v-combobox v-model="quickText" :items="productNames" placeholder="Artikel, z.B. 2 Trone" persistent-placeholder menu-icon=""
          density="compact" hide-details hide-no-data variant="solo-filled" flat class="flex-grow-1" @keydown.enter="quickAdd" />
        <v-menu>
          <template #activator="{ props }">
            <v-btn v-bind="props" size="small" variant="tonal" :icon="quickTarget === 'trip' ? 'mdi-cart-outline' : 'mdi-bookmark-outline'" />
          </template>
          <v-list density="compact">
            <v-list-item v-for="t in quickTargets" :key="t.value" :title="t.title" :active="quickTarget === t.value" @click="quickTarget = t.value" />
          </v-list>
        </v-menu>
        <v-btn icon="mdi-plus" color="primary" size="small" @click="quickAdd" />
      </div>
    </v-card>

    <!-- Details zu einem Artikel -->
    <v-bottom-sheet v-model="sheet">
      <v-card v-if="selected">
        <v-card-title class="d-flex align-center">
          {{ selected.name }}
          <v-spacer />
          <span class="text-body-1 text-medium-emphasis">{{ selected.display }}</span>
        </v-card-title>
        <v-card-text>
          <template v-if="!selected.isFree">
            <div v-if="selected.override" class="text-caption mb-2">Angepasst; laut Plan: {{ selected.needed.map(n => formatAmount(n.amount, n.unit, data.units)).join(' + ') }}</div>
            <div class="text-caption text-medium-emphasis mb-1">Gebraucht für</div>
            <div v-for="(s, i) in selected.sources" :key="i" class="text-body-2">{{ sourceLabel(s) }}</div>
            <div v-if="selected.updatedBy" class="text-caption text-medium-emphasis mt-2">Zuletzt geändert von {{ selected.updatedBy }}</div>

            <div class="d-flex align-center ga-2 mt-4">
              <v-text-field v-model="amountInput" label="Menge" inputmode="decimal" density="compact" hide-details style="max-width: 110px" />
              <v-select v-model="unitInput" :items="data.units" item-title="singular" item-value="code" density="compact" hide-details style="max-width: 140px" />
              <v-btn variant="tonal" @click="saveAmount">Setzen</v-btn>
              <v-btn v-if="selected.override" variant="text" size="small" @click="sheetAction({ amount: null })">Zurücksetzen</v-btn>
            </div>
          </template>
        </v-card-text>
        <v-list density="comfortable">
          <template v-if="!selected.isFree">
            <v-list-item v-if="selected.hasFallback && !selected.useFallback" prepend-icon="mdi-store-alert-outline"
              :title="`Gibt's hier nicht → ${fallbackName(selected)}`" @click="sheetAction({ useFallback: true })" />
            <v-list-item v-if="selected.useFallback" prepend-icon="mdi-store-outline" :title="`Doch bei ${preferredName(selected)}`" @click="sheetAction({ useFallback: false })" />
            <v-list-item v-if="selected.state !== 'have'" prepend-icon="mdi-home-variant" title="Haben wir noch" @click="sheetAction({ state: 'have' })" />
            <v-list-item v-if="selected.state !== 'skip'" prepend-icon="mdi-cancel" title="Brauche ich nicht" @click="sheetAction({ state: 'skip' })" />
            <v-list-item v-if="selected.state !== 'open'" prepend-icon="mdi-cart-arrow-down" title="Doch kaufen" @click="sheetAction({ state: 'open' })" />
          </template>
          <v-list-item v-else prepend-icon="mdi-delete-outline" title="Entfernen" @click="deleteFree(selected)" />
        </v-list>
      </v-card>
    </v-bottom-sheet>

    <TripDialog v-model="tripDialog" :trip="editTrip" @saved="onTripSaved" />
  </div>
</template>

<style scoped>
.einkauf { padding-bottom: 72px; }
.einkauf :deep(.v-list-item__prepend .v-icon) { margin-right: 0 !important; }
.einkauf :deep(.v-list-item__prepend > .v-icon ~ .v-list-item__spacer) { width: 14px; }
.done { opacity: 0.45; }
.done :deep(.v-list-item-title) { text-decoration: line-through; }
.store { border-top: 4px solid transparent; }
.section-name { text-transform: uppercase; letter-spacing: 0.05em; }
.quick-add {
  position: fixed; left: 12px; right: 12px; z-index: 5;
  bottom: calc(64px + env(safe-area-inset-bottom));
  max-width: 876px; margin: 0 auto;
}
@media (min-width: 960px) { .quick-add { bottom: 16px; left: 72px; } }
</style>
