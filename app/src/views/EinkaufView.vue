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
const openDone = ref(new Set())   // Abschnitte, deren gekaufte Artikel aufgeklappt sind
const tripDialog = ref(false)
const finishDialog = ref(false)

const sheet = ref(false)
const selected = ref(null)
const amountInput = ref('')
const unitInput = ref('')

const quickText = ref(null)
const quickTarget = ref('trip')  // 'trip' oder storeId (Merkliste)
const recent = ref(new Set())    // gerade abgehakt: noch kurz an Ort und Stelle sichtbar lassen

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
      .map(s => ({ ...s, items: s.items.sort(byName) }))
      .map(s => {
        const key = `${store.id ?? 'none'}/${s.name}`
        const done = s.items.filter(i => i.state === 'in_cart' && !recent.value.has(i.key))
        return { ...s, key, done, visible: s.items.filter(i => i.state !== 'in_cart' || recent.value.has(i.key)), doneOpen: openDone.value.has(key) }
      })
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

function toggleDone(key) {
  const next = new Set(openDone.value)
  if (next.has(key)) next.delete(key); else next.add(key)
  openDone.value = next
}

function tapPantry(item) {
  setItem(item, { state: item.state === 'open' ? 'have' : 'open' })
}
function tapShop(item) {
  if (item.state !== 'in_cart') {
    recent.value = new Set(recent.value).add(item.key)
    setTimeout(() => { const next = new Set(recent.value); next.delete(item.key); recent.value = next }, 500)
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
  { title: 'Einkaufsliste', subtitle: 'bleibt drauf, bis es gekauft ist', value: 'trip' },
  ...data.stores.map(s => ({ title: `Merkliste ${s.name}`, subtitle: 'bleibt stehen, bis es erledigt ist', value: s.id })),
])
const quickTargetLabel = computed(() => quickTarget.value === 'trip'
  ? 'Einkaufsliste'
  : `Merkliste ${data.stores.find(s => s.id === quickTarget.value)?.name ?? ''}`)

// „Einkauf fertig“: was im Wagen ist, verschwindet; Offenes bleibt auf der Liste
const inCartCount = computed(() => (list.value?.items.filter(i => i.state === 'in_cart').length ?? 0)
  + (list.value?.freeItems.filter(f => f.state === 'in_cart').length ?? 0))
const remainingCount = computed(() => (list.value?.items.filter(i => i.state === 'open').length ?? 0)
  + (list.value?.freeItems.filter(f => f.state === 'open').length ?? 0))
async function finishTrip() {
  finishDialog.value = false
  try {
    list.value = await api.finishTrip()
    tab.value = 'pantry'
    openDone.value = new Set()
    appStore.showSnackbar('Einkauf fertig')
  } catch (e) { appStore.showError(e) }
}

function onTripSaved(result) {
  list.value = result
  tab.value = 'pantry'
  appStore.showSnackbar('Plan übernommen')
}

const sourceLabel = s => s.type === 'manual'
  ? `von Hand${s.by ? ` (${s.by})` : ''}: ${s.amount != null ? formatAmount(s.amount, s.unit, data.units) : ''}`
  : `${shortDate(s.date)} ${s.slotName}: ${s.dishName}${s.viaDish ? ` (${s.viaDish})` : ''} – ${formatAmount(s.amount, s.unit, data.units)}${s.isNew ? ' · neu' : ''}${s.mealId ? '' : ' · Mahlzeit gelöscht'}`
</script>

<template>
  <div v-if="loading" class="text-center pa-8"><v-progress-circular indeterminate color="primary" /></div>

  <div v-else-if="trip" class="einkauf">
    <div class="d-flex align-center mb-2">
      <div class="flex-grow-1">
        <div class="text-subtitle-1 font-weight-medium">Einkaufsliste</div>
        <div class="text-caption text-medium-emphasis">
          <template v-if="trip.planTakenAt">Plan bis {{ shortDate(trip.coversTo) }} übernommen</template>
          <template v-else>Plan noch nicht übernommen</template>
        </div>
      </div>
      <v-btn variant="tonal" size="small" prepend-icon="mdi-calendar-arrow-right" class="mr-1" @click="tripDialog = true">Plan übernehmen</v-btn>
      <v-menu>
        <template #activator="{ props }"><v-btn icon="mdi-dots-vertical" variant="text" v-bind="props" aria-label="Mehr" /></template>
        <v-list density="compact">
          <v-list-item prepend-icon="mdi-check-all" title="Einkauf fertig" @click="finishDialog = true" />
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

      <div v-if="!pantryGroups.length && !staples.length" class="text-center text-medium-emphasis pa-6">Aus dem Plan steht gerade nichts auf der Liste.</div>
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
          <div v-if="section.visible.length || section.done.length" class="section-name text-caption text-medium-emphasis px-4 pt-2">{{ section.name }}</div>
          <v-list density="compact" class="py-0">
            <v-list-item v-for="item in section.visible" :key="item.key" :class="{ done: item.state === 'in_cart' }" @click="tapShop(item)">
              <template #prepend>
                <v-icon :icon="item.state === 'in_cart' ? 'mdi-checkbox-marked-circle' : 'mdi-checkbox-blank-circle-outline'" :color="item.state === 'in_cart' ? 'primary' : undefined" />
              </template>
              <v-list-item-title>{{ item.name }}<v-chip v-if="item.isNew" size="x-small" color="primary" variant="tonal" class="ml-2">neu</v-chip></v-list-item-title>
              <v-list-item-subtitle v-if="item.useFallback">statt {{ preferredName(item) }}</v-list-item-subtitle>
              <template #append>
                <span class="text-body-2 text-medium-emphasis mr-1">{{ item.display }}</span>
                <v-btn icon="mdi-dots-horizontal" size="small" variant="text" @click.stop="openSheet(item)" />
              </template>
            </v-list-item>
          </v-list>
          <template v-if="section.done.length">
            <v-list v-if="section.doneOpen" density="compact" class="py-0">
              <v-list-item v-for="item in section.done" :key="item.key" class="done" @click="tapShop(item)">
                <template #prepend><v-icon icon="mdi-checkbox-marked-circle" color="primary" /></template>
                <v-list-item-title>{{ item.name }}</v-list-item-title>
                <template #append><span class="text-body-2 text-medium-emphasis">{{ item.display }}</span></template>
              </v-list-item>
            </v-list>
            <v-btn variant="text" size="small" class="ml-2 text-medium-emphasis" :prepend-icon="section.doneOpen ? 'mdi-chevron-up' : 'mdi-cart-check'" @click="toggleDone(section.key)">
              {{ section.done.length }} im Wagen
            </v-btn>
          </template>
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
        <p>Alles erledigt!</p>
      </div>
      <v-btn v-if="inCartCount" block color="primary" variant="tonal" prepend-icon="mdi-check-all" class="mb-3" @click="finishDialog = true">
        Einkauf fertig
      </v-btn>
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

    <!-- Schnelleingabe: Ziel sichtbar als Chip, ein Knopf zum Hinzufügen -->
    <v-card class="quick-add" elevation="6">
      <div class="px-3 pt-2">
        <v-menu>
          <template #activator="{ props }">
            <v-chip v-bind="props" size="small" variant="tonal" :color="quickTarget === 'trip' ? 'primary' : 'orange-darken-2'"
              :prepend-icon="quickTarget === 'trip' ? 'mdi-cart-outline' : 'mdi-bookmark-outline'" append-icon="mdi-menu-down">
              {{ quickTargetLabel }}
            </v-chip>
          </template>
          <v-list density="compact">
            <v-list-item v-for="t in quickTargets" :key="t.value" :title="t.title" :subtitle="t.subtitle" :active="quickTarget === t.value" @click="quickTarget = t.value" />
          </v-list>
        </v-menu>
      </div>
      <div class="d-flex align-center pa-2 pt-1 ga-2">
        <v-combobox v-model="quickText" :items="productNames" placeholder="Artikel, z.B. 2 Trone" persistent-placeholder menu-icon=""
          density="compact" hide-details hide-no-data class="flex-grow-1" @keydown.enter="quickAdd" />
        <v-btn color="primary" icon="mdi-plus" size="small" aria-label="Hinzufügen" @click="quickAdd" />
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

    <TripDialog v-model="tripDialog" :trip="trip" @saved="onTripSaved" />

    <v-dialog v-model="finishDialog" max-width="400">
      <v-card title="Einkauf fertig?">
        <v-card-text class="text-body-2">
          <p v-if="inCartCount">{{ inCartCount === 1 ? '1 Artikel im Wagen wird' : `${inCartCount} Artikel im Wagen werden` }} von der Liste genommen,
            ebenso, was als vorrätig oder „nicht nötig“ markiert ist.</p>
          <p v-else>Es ist noch nichts im Wagen.</p>
          <p v-if="remainingCount" class="mt-2">{{ remainingCount === 1 ? '1 offener Artikel bleibt' : `${remainingCount} offene Artikel bleiben` }} auf der Liste.</p>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="finishDialog = false">Abbrechen</v-btn>
          <v-btn color="primary" variant="flat" @click="finishTrip">Einkauf fertig</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.einkauf { padding-bottom: 110px; }
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
