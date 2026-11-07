<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import Sortable from 'sortablejs'
import api from '@/services/api'
import { useAppStore, useDataStore } from '@/stores'
import { useLiveStore } from '@/stores/live'
import { shortDate, formatAmount, parseNumber, planCoverage } from '@/utils/format'
import TripDialog from '@/components/TripDialog.vue'

const appStore = useAppStore()
const data = useDataStore()
const live = useLiveStore()

const list = ref(null)          // { trip, items, freeItems, reminders }
const loading = ref(true)
const tab = ref('pantry')
const openDone = ref(new Set())   // Läden, deren gekaufte Artikel aufgeklappt sind
const storeToggle = ref(new Map()) // Läden, die von Hand auf- oder zugeklappt wurden (sonst: fertig = zu)
const tripDialog = ref(false)
const finishDialog = ref(false)

const sheet = ref(false)
const selected = ref(null)
const amountInput = ref('')
const unitInput = ref('')

const quickText = ref(null)
const quickSearch = ref('')     // getippter Text (das Modell der Combobox setzt sich erst beim Bestätigen)
const quickValue = computed(() => (quickSearch.value || quickText.value || '').trim())
const quickTarget = ref('trip')  // 'trip' oder storeId (Merkliste)
const recent = ref(new Set())    // gerade abgehakt: noch kurz an Ort und Stelle sichtbar lassen

const trip = computed(() => list.value?.trip ?? null)
const coverage = computed(() => planCoverage(trip.value))
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

// Einkaufen: nach Laden und Abschnitt (Lauf-Reihenfolge); nur was gekauft werden muss
const toBuy = item => item.state === 'open' || item.state === 'in_cart'
const storeInfo = id => {
  const i = data.stores.findIndex(s => s.id === id)
  return i < 0 ? null : { ...data.stores[i], sort: i }
}
const shopStores = computed(() => {
  const stores = new Map()
  const storeEntry = store => {
    const key = store?.id ?? 'none'
    if (!stores.has(key)) stores.set(key, { key, id: store?.id ?? null, name: store?.name ?? 'Ohne Laden', color: store?.color, sort: store?.sort ?? 99, sections: new Map(), reminders: [] })
    return stores.get(key)
  }
  const sectionEntry = (store, section) => {
    const key = section?.id ?? 'none'
    if (!store.sections.has(key)) store.sections.set(key, { key: `${store.key}/${key}`, storeId: store.id, sectionId: section?.id ?? null, name: section?.name ?? '', sort: section?.sort ?? 99, items: [] })
    return store.sections.get(key)
  }
  for (const item of nowItems.value.filter(toBuy)) {
    sectionEntry(storeEntry(item.store ? storeInfo(item.store.id) ?? item.store : null), item.section).items.push(item)
  }
  for (const free of list.value?.freeItems ?? []) {
    if (free.state === 'have' || free.state === 'skip') continue
    const store = storeInfo(free.storeId)
    const index = store?.sections.findIndex(sec => sec.id === free.sectionId) ?? -1
    const section = index >= 0 ? { ...store.sections[index], sort: index } : null
    sectionEntry(storeEntry(store), section).items.push({ ...free, isFree: true, name: free.text, key: free.id })
  }
  for (const reminder of list.value?.reminders ?? []) storeEntry(storeInfo(reminder.storeId)).reminders.push(reminder)

  return [...stores.values()].sort((a, b) => a.sort - b.sort).map(store => {
    const sections = [...store.sections.values()].sort((a, b) => a.sort - b.sort).map(sec => ({
      ...sec,
      // abgehakt: noch kurz an Ort und Stelle, dann unter „im Wagen“ (nicht erst nach unten springen)
      visible: sec.items.sort(byName).filter(i => i.state !== 'in_cart' || recent.value.has(i.key)),
    }))
    const all = sections.flatMap(sec => sec.items)
    const done = all.filter(i => i.state === 'in_cart' && !recent.value.has(i.key))
    const open = all.filter(i => i.state !== 'in_cart').length + store.reminders.filter(r => r.state === 'open').length
    const total = all.length + store.reminders.length
    const finished = open === 0 && total > 0
    const collapsed = storeToggle.value.has(store.key) ? storeToggle.value.get(store.key) : finished
    return { ...store, sections, done, open, total, finished, collapsed, doneOpen: openDone.value.has(store.key) }
  })
})
function toggleStore(store) {
  const next = new Map(storeToggle.value)
  next.set(store.key, !store.collapsed)
  storeToggle.value = next
}
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

// Ein Laden ist fertig → automatisch zuklappen (eigene Entscheidung zurücksetzen)
watch(() => shopStores.value.map(st => `${st.key}:${st.finished}`).join(), (now, before) => {
  if (!before) return
  const was = new Set(before.split(',').filter(x => x.endsWith(':true')).map(x => x.split(':')[0]))
  const next = new Map(storeToggle.value)
  for (const st of shopStores.value) if (st.finished && !was.has(st.key)) next.delete(st.key)
  storeToggle.value = next
})

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

// Heute woanders kaufen (Produkte, nur diese Runde) bzw. einsortieren (freie Artikel)
const placeDialog = ref(false)
const placeItem = ref(null)
function openPlace(item) {
  sheet.value = false
  placeItem.value = item
  placeDialog.value = true
}
async function moveItem(item, storeId, sectionId) {
  placeDialog.value = false
  try {
    if (item.isFree) {
      await api.updateFreeItem(item.id, { storeId, sectionId })
    } else {
      // zurück an den normalen Platz = Übersteuerung entfernen
      const home = storeId === item.homeStoreId && (sectionId ?? null) === (item.homeSectionId ?? null)
      await api.setTripItem(trip.value.id, item.productId, item.part, home ? { storeId: null } : { storeId, sectionId })
    }
    const store = storeInfo(storeId)
    appStore.showSnackbar(store ? `${item.name} → ${store.name}` : `${item.name} ohne Laden`)
    await load()
  } catch (e) { appStore.showError(e) }
}
const placeLabel = (storeId, sectionId) => {
  const store = storeInfo(storeId)
  if (!store) return 'Ohne Laden'
  const section = store.sections.find(sec => sec.id === sectionId)
  return section ? `${store.name} › ${section.name}` : store.name
}

// Ziehen (lange drücken) zwischen sichtbaren Abschnitten
const itemByKey = key => nowItems.value.find(i => i.key === key)
  ?? (list.value?.freeItems ?? []).map(f => ({ ...f, isFree: true, name: f.text, key: f.id })).find(f => f.key === key)
let sortables = []
function setupDrag() {
  sortables.forEach(x => x.destroy())
  sortables = [...document.querySelectorAll('.einkauf .rows[data-drop]')].map(el => Sortable.create(el, {
    // forceFallback: Zeiger-Ereignisse statt nativem Drag & Drop – zuverlässiger auf dem iPhone
    group: 'shop', sort: false, delay: 350, delayOnTouchOnly: true, touchStartThreshold: 6, animation: 150,
    forceFallback: true, fallbackTolerance: 4, fallbackOnBody: true, scroll: true, bubbleScroll: true,
    draggable: '.row[data-key]', ghostClass: 'row-ghost', chosenClass: 'row-chosen',
    onEnd(evt) {
      // DOM gehört Vue: Element zurücklegen, dann über die Daten verschieben
      if (evt.from !== evt.to) evt.from.insertBefore(evt.item, evt.from.children[evt.oldIndex] ?? null)
      if (evt.from === evt.to) return
      const item = itemByKey(evt.item.dataset.key)
      if (item) moveItem(item, evt.to.dataset.store || null, evt.to.dataset.section || null)
    },
  }))
}
watch([shopStores, tab], () => nextTick(() => { if (tab.value === 'shopping') setupDrag() }), { flush: 'post' })
onBeforeUnmount(() => sortables.forEach(x => x.destroy()))

// Läden stehen am Produkt (Liste liefert die Namen mit)
const fallbackName = item => item.fallbackStoreName
const preferredName = item => item.preferredStoreName

// Schnelleingabe: exakter Produktname wird zugeordnet, sonst freier Artikel
const productNames = computed(() => data.products.map(p => p.name))
async function quickAdd() {
  const text = quickValue.value
  if (!text) return
  try {
    if (quickTarget.value === 'trip') await api.addTripFreeItem(trip.value.id, text)
    else await api.addReminder(quickTarget.value, text)
    quickText.value = null
    quickSearch.value = ''
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
  appStore.showSnackbar('Gerichte aus dem Plan geholt')
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
          <template v-if="coverage">Gerichte bis {{ shortDate(coverage) }} drauf</template>
          <template v-else>Noch keine Gerichte drauf</template>
        </div>
      </div>
      <v-btn variant="tonal" size="small" prepend-icon="mdi-calendar-arrow-right" class="mr-1" @click="tripDialog = true">Aus Plan holen</v-btn>
      <v-menu>
        <template #activator="{ props }"><v-btn icon="mdi-dots-vertical" variant="text" v-bind="props" aria-label="Mehr" /></template>
        <v-list density="compact">
          <v-list-item prepend-icon="mdi-check-all" title="Einkauf fertig" @click="finishDialog = true" />
        </v-list>
      </v-menu>
    </div>

    <v-btn-toggle v-model="tab" mandatory color="primary" variant="outlined" density="comfortable" class="w-100 mb-3 phase-toggle">
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
      <p class="text-caption text-medium-emphasis mb-2 px-1">Antippen = im Wagen · lange drücken und ziehen = heute woanders</p>
      <section v-for="store in shopStores" :key="store.key" class="store-card" :class="{ finished: store.finished }">
        <button class="store-head" @click="toggleStore(store)">
          <span class="store-dot" :style="{ background: store.color ?? 'rgba(var(--v-theme-on-surface), 0.3)' }" />
          <span class="store-name">{{ store.name }}</span>
          <v-icon v-if="store.finished" icon="mdi-check-circle" color="success" size="18" class="ml-2" />
          <v-spacer />
          <span class="store-count">{{ store.total - store.open }}/{{ store.total }}</span>
          <v-icon :icon="store.collapsed ? 'mdi-chevron-down' : 'mdi-chevron-up'" size="20" class="ml-1 text-medium-emphasis" />
        </button>
        <div class="store-progress"><div :style="{ width: `${store.total ? (100 * (store.total - store.open)) / store.total : 0}%`, background: store.color ?? 'rgb(var(--v-theme-primary))' }" /></div>

        <div v-if="!store.collapsed" class="store-body">
          <template v-for="section in store.sections" :key="section.key">
            <div v-if="section.name && section.visible.length" class="section-name">{{ section.name }}</div>
            <div class="rows" data-drop :data-store="section.storeId ?? ''" :data-section="section.sectionId ?? ''">
              <div v-for="item in section.visible" :key="item.key" :data-key="item.key" class="row" :class="{ checked: item.state === 'in_cart' }" @click="tapShop(item)">
                <span class="check"><v-icon :icon="item.state === 'in_cart' ? 'mdi-check-circle' : 'mdi-circle-outline'" :color="item.state === 'in_cart' ? 'primary' : undefined" size="24" /></span>
                <div class="row-main">
                  <div class="row-name">{{ item.name }}<span v-if="item.isNew" class="tag">neu</span></div>
                  <div v-if="item.movedToday" class="row-sub">heute hier · sonst {{ placeLabel(item.homeStoreId, item.homeSectionId) }}</div>
                  <div v-else-if="item.useFallback" class="row-sub">statt {{ preferredName(item) }}</div>
                </div>
                <span class="row-amount">{{ item.display }}</span>
                <button class="row-more" aria-label="Details" @click.stop="openSheet(item)"><v-icon icon="mdi-dots-horizontal" size="20" /></button>
              </div>
            </div>
          </template>

          <template v-if="store.reminders.length">
            <div class="section-name">Bei Gelegenheit</div>
            <div v-for="r in store.reminders" :key="r.id" class="row" :class="{ checked: r.state !== 'open' }" @click="setFree(r, r.state === 'open' ? 'in_cart' : 'open')">
              <span class="check"><v-icon :icon="r.state === 'open' ? 'mdi-bookmark-outline' : 'mdi-bookmark-check'" :color="r.state === 'open' ? undefined : 'primary'" size="22" /></span>
              <div class="row-main"><div class="row-name">{{ r.text }}</div></div>
              <span class="row-amount">{{ r.display }}</span>
              <button class="row-more" aria-label="Entfernen" @click.stop="deleteFree(r)"><v-icon icon="mdi-close" size="18" /></button>
            </div>
          </template>

          <template v-if="store.done.length">
            <button class="in-cart" @click="toggleDone(store.key)">
              <v-icon :icon="store.doneOpen ? 'mdi-chevron-up' : 'mdi-cart-check'" size="18" class="mr-2" />{{ store.done.length }} im Wagen
            </button>
            <div v-if="store.doneOpen">
              <div v-for="item in store.done" :key="item.key" class="row checked" @click="tapShop(item)">
                <span class="check"><v-icon icon="mdi-check-circle" color="primary" size="24" /></span>
                <div class="row-main"><div class="row-name">{{ item.name }}</div></div>
                <span class="row-amount">{{ item.display }}</span>
              </div>
            </div>
          </template>
        </div>
      </section>

      <section v-if="laterItems.length" class="store-card later">
        <div class="store-head static">
          <v-icon icon="mdi-clock-outline" size="18" class="mr-2 text-medium-emphasis" />
          <span class="store-name">Später kaufen</span>
        </div>
        <div class="store-body">
          <div v-for="item in laterItems" :key="item.key" class="row" :class="{ checked: item.state !== 'open' }" @click="tapShop(item)">
            <span class="check"><v-icon :icon="item.state === 'in_cart' ? 'mdi-check-circle' : 'mdi-circle-outline'" size="24" /></span>
            <div class="row-main">
              <div class="row-name">{{ item.name }}</div>
              <div class="row-sub">ab {{ shortDate(item.buyFrom) }} · {{ item.store?.name }}</div>
            </div>
            <span class="row-amount">{{ item.display }}</span>
          </div>
        </div>
      </section>

      <div v-if="!openCount && !laterItems.length" class="text-center pa-6">
        <v-icon icon="mdi-party-popper" size="48" color="primary" class="mb-2" />
        <p>Alles erledigt!</p>
      </div>
      <v-btn v-if="inCartCount" block color="primary" variant="flat" size="large" prepend-icon="mdi-check-all" class="mb-3 finish-btn" @click="finishDialog = true">
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

    <!-- Schnelleingabe: standardmäßig auf die Einkaufsliste; Merkliste nur über das Lesezeichen -->
    <div class="quick-add">
      <div v-if="quickTarget !== 'trip'" class="mb-1 ml-2">
        <v-chip size="small" color="orange-darken-2" variant="flat" prepend-icon="mdi-bookmark" closable @click:close="quickTarget = 'trip'">{{ quickTargetLabel }}</v-chip>
      </div>
      <div class="quick-bar" :class="{ reminder: quickTarget !== 'trip' }">
        <v-combobox v-model="quickText" v-model:search="quickSearch" :items="(quickSearch ?? '').trim().length >= 2 ? productNames : []" :placeholder="quickTarget === 'trip' ? 'Artikel hinzufügen …' : 'Für die Merkliste …'"
          menu-icon="" variant="plain" density="compact" hide-details hide-no-data class="quick-input" @keydown.enter="quickAdd" />
        <v-menu location="top end">
          <template #activator="{ props }">
            <v-btn v-bind="props" :icon="quickTarget === 'trip' ? 'mdi-bookmark-outline' : 'mdi-bookmark'" size="small" variant="text"
              :color="quickTarget === 'trip' ? undefined : 'orange-darken-2'" class="text-medium-emphasis" aria-label="Ziel wählen" />
          </template>
          <v-list density="compact">
            <v-list-subheader>Hinzufügen zu</v-list-subheader>
            <v-list-item v-for="t in quickTargets" :key="t.value" :title="t.title" :subtitle="t.subtitle" :active="quickTarget === t.value"
              :prepend-icon="t.value === 'trip' ? 'mdi-cart-outline' : 'mdi-bookmark-outline'" @click="quickTarget = t.value" />
          </v-list>
        </v-menu>
        <v-btn icon="mdi-arrow-up" size="small" color="primary" variant="flat" :disabled="!quickValue" class="send-btn" aria-label="Hinzufügen" @click="quickAdd" />
      </div>
    </div>

    <!-- Details zu einem Artikel -->
    <v-bottom-sheet v-model="sheet">
      <div v-if="selected" class="sheet">
        <div class="sheet-handle" />
        <div class="sheet-head">
          <div class="flex-grow-1 min-w-0">
            <div class="sheet-title">{{ selected.name }}</div>
            <div class="sheet-place">
              <span class="store-dot mr-1" :style="{ background: storeInfo(selected.isFree ? selected.storeId : selected.store?.id)?.color ?? 'rgba(var(--v-theme-on-surface), 0.25)' }" />
              {{ selected.isFree ? placeLabel(selected.storeId, selected.sectionId) : placeLabel(selected.store?.id, selected.section?.id) }}
            </div>
          </div>
          <span v-if="selected.display" class="sheet-amount">{{ selected.display }}</span>
        </div>

        <template v-if="!selected.isFree">
          <div class="sheet-block">
            <div class="sheet-label">Gebraucht für</div>
            <div v-for="(s, i) in selected.sources" :key="i" class="source">{{ sourceLabel(s) }}</div>
            <div v-if="selected.override" class="source text-medium-emphasis">Angepasst – laut Plan {{ selected.needed.map(n => formatAmount(n.amount, n.unit, data.units)).join(' + ') }}</div>
            <div v-if="selected.updatedBy" class="source text-medium-emphasis">Zuletzt geändert von {{ selected.updatedBy }}</div>
          </div>
          <div class="sheet-block d-flex align-center ga-2">
            <v-text-field v-model="amountInput" placeholder="Menge" inputmode="decimal" density="compact" hide-details style="max-width: 100px" />
            <v-select v-model="unitInput" :items="data.units" item-title="singular" item-value="code" density="compact" hide-details style="max-width: 130px" />
            <v-btn variant="tonal" color="primary" @click="saveAmount">Setzen</v-btn>
            <v-btn v-if="selected.override" variant="text" size="small" @click="sheetAction({ amount: null })">Plan</v-btn>
          </div>
        </template>

        <div class="sheet-actions">
          <template v-if="!selected.isFree">
            <button class="action" @click="openPlace(selected)">
              <v-icon icon="mdi-swap-horizontal" /><span>Heute woanders kaufen …<small>nur für diesen Einkauf</small></span>
            </button>
            <button v-if="selected.movedToday" class="action" @click="sheet = false; moveItem(selected, selected.homeStoreId, selected.homeSectionId)">
              <v-icon icon="mdi-undo-variant" /><span>Zurück zu {{ placeLabel(selected.homeStoreId, selected.homeSectionId) }}</span>
            </button>
            <button v-if="selected.hasFallback && !selected.useFallback && !selected.movedToday" class="action" @click="sheetAction({ useFallback: true })">
              <v-icon icon="mdi-store-alert-outline" /><span>Gibt's hier nicht → {{ fallbackName(selected) }}</span>
            </button>
            <button v-if="selected.useFallback" class="action" @click="sheetAction({ useFallback: false })">
              <v-icon icon="mdi-store-outline" /><span>Doch bei {{ preferredName(selected) }}</span>
            </button>
            <div class="action-sep" />
            <button v-if="selected.state !== 'have'" class="action" @click="sheetAction({ state: 'have' })">
              <v-icon icon="mdi-home-variant-outline" /><span>Haben wir noch</span>
            </button>
            <button v-if="selected.state !== 'open'" class="action" @click="sheetAction({ state: 'open' })">
              <v-icon icon="mdi-cart-arrow-down" /><span>Doch kaufen</span>
            </button>
            <button v-if="selected.state !== 'skip'" class="action danger" @click="sheetAction({ state: 'skip' })">
              <v-icon icon="mdi-cancel" /><span>Brauche ich nicht<small>nur für diesen Einkauf</small></span>
            </button>
          </template>
          <template v-else>
            <button class="action" @click="openPlace(selected)">
              <v-icon icon="mdi-store-marker-outline" /><span>Einsortieren …<small>Laden und Abschnitt wählen</small></span>
            </button>
            <div class="action-sep" />
            <button class="action danger" @click="deleteFree(selected)">
              <v-icon icon="mdi-delete-outline" /><span>Von der Liste entfernen</span>
            </button>
          </template>
        </div>
      </div>
    </v-bottom-sheet>

    <TripDialog v-model="tripDialog" :trip="trip" @saved="onTripSaved" />

    <!-- Laden und Abschnitt wählen -->
    <v-dialog v-model="placeDialog" max-width="440" scrollable>
      <v-card v-if="placeItem" :title="placeItem.isFree ? `${placeItem.name} einsortieren` : `${placeItem.name} heute kaufen bei …`">
        <v-card-text class="pt-1">
          <div v-for="st in data.stores" :key="st.id" class="mb-3">
            <div class="d-flex align-center mb-1">
              <span class="store-dot mr-2" :style="{ background: st.color }" /><span class="font-weight-medium">{{ st.name }}</span>
            </div>
            <div class="d-flex flex-wrap ga-2">
              <v-chip v-for="sec in st.sections" :key="sec.id" size="small" variant="outlined" @click="moveItem(placeItem, st.id, sec.id)">{{ sec.name }}</v-chip>
            </div>
          </div>
          <v-chip v-if="placeItem.isFree && placeItem.storeId" size="small" variant="text" prepend-icon="mdi-close" @click="moveItem(placeItem, null, null)">Ohne Laden</v-chip>
        </v-card-text>
        <v-card-actions><v-spacer /><v-btn variant="text" @click="placeDialog = false">Abbrechen</v-btn></v-card-actions>
      </v-card>
    </v-dialog>

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

/* Einkaufen: eine Karte pro Laden, fertige Läden klappen zu */
.store-card { background: rgb(var(--v-theme-surface)); border-radius: 16px; margin-bottom: 12px; overflow: hidden;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04), 0 4px 16px rgba(37, 99, 235, 0.05); }
.store-card.finished { opacity: 0.75; }
.store-head { display: flex; align-items: center; width: 100%; padding: 14px 16px 12px; background: none; border: 0; font: inherit; color: inherit; cursor: pointer; text-align: left; }
.store-head.static { cursor: default; }
.store-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; display: inline-block; }
.store-name { font-size: 1.05rem; font-weight: 600; margin-left: 10px; }
.store-count { font-size: 0.85rem; font-variant-numeric: tabular-nums; color: rgba(var(--v-theme-on-surface), 0.55); }
.store-progress { height: 3px; margin: 0 16px; background: rgba(var(--v-theme-on-surface), 0.06); border-radius: 2px; overflow: hidden; }
.store-progress > div { height: 100%; transition: width 0.3s ease; }
.store-body { padding: 4px 0 8px; }
.section-name { font-size: 0.7rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(var(--v-theme-on-surface), 0.45); padding: 12px 16px 2px; }
.rows { min-height: 6px; }
.row { display: flex; align-items: center; gap: 12px; padding: 9px 8px 9px 14px; min-height: 52px; cursor: pointer; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; transition: background 0.15s; }
.row:active { background: rgba(var(--v-theme-primary), 0.05); }
.check { display: flex; color: rgba(var(--v-theme-on-surface), 0.35); }
.row-main { flex: 1; min-width: 0; }
.row-name { font-size: 1rem; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row-sub { font-size: 0.78rem; color: rgb(var(--v-theme-warning)); margin-top: 1px; }
.row-amount { font-size: 0.9rem; color: rgba(var(--v-theme-on-surface), 0.55); white-space: nowrap; font-variant-numeric: tabular-nums; }
.row-more { display: flex; padding: 6px; border: 0; background: none; border-radius: 50%; color: rgba(var(--v-theme-on-surface), 0.35); cursor: pointer; }
.row.checked .row-name { text-decoration: line-through; color: rgba(var(--v-theme-on-surface), 0.4); }
.row.checked .row-amount { opacity: 0.5; }
.tag { font-size: 0.65rem; font-weight: 600; color: rgb(var(--v-theme-primary)); background: rgba(var(--v-theme-primary), 0.1); border-radius: 6px; padding: 1px 6px; margin-left: 8px; vertical-align: 2px; }
.row-ghost { opacity: 0.3; }
.row-chosen { background: rgba(var(--v-theme-primary), 0.08); box-shadow: 0 4px 16px rgba(15, 23, 42, 0.15); }
.in-cart { display: flex; align-items: center; margin: 6px 16px 2px; padding: 6px 10px; border: 0; border-radius: 8px; background: rgba(var(--v-theme-on-surface), 0.04); font: inherit; font-size: 0.85rem; color: rgba(var(--v-theme-on-surface), 0.6); cursor: pointer; }
/* Detail-Sheet: oben rund, unten bis an den Rand (mit Platz für die Home-Leiste) */
.sheet { background: rgb(var(--v-theme-surface)); border-radius: 22px 22px 0 0; padding: 8px 0 calc(12px + env(safe-area-inset-bottom)); max-height: 85vh; overflow-y: auto; }
.sheet-handle { width: 40px; height: 5px; border-radius: 3px; background: rgba(var(--v-theme-on-surface), 0.15); margin: 0 auto 10px; }
.sheet-head { display: flex; align-items: flex-start; gap: 12px; padding: 4px 20px 12px; }
.sheet-title { font-size: 1.3rem; font-weight: 600; line-height: 1.25; }
.sheet-place { display: flex; align-items: center; font-size: 0.85rem; color: rgba(var(--v-theme-on-surface), 0.55); margin-top: 3px; }
.sheet-amount { font-size: 1.05rem; font-weight: 600; color: rgb(var(--v-theme-primary)); background: rgba(var(--v-theme-primary), 0.08); border-radius: 10px; padding: 4px 10px; white-space: nowrap; }
.sheet-block { margin: 0 16px 10px; padding: 10px 12px; border-radius: 14px; background: rgba(var(--v-theme-on-surface), 0.035); }
.sheet-label { font-size: 0.7rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(var(--v-theme-on-surface), 0.45); margin-bottom: 4px; }
.source { font-size: 0.875rem; line-height: 1.45; }
.sheet-actions { padding: 2px 8px 0; }
.action { display: flex; align-items: center; gap: 16px; width: 100%; padding: 12px; border: 0; border-radius: 12px; background: none; font: inherit; font-size: 1rem; color: inherit; text-align: left; cursor: pointer; }
.action:active { background: rgba(var(--v-theme-on-surface), 0.05); }
.action .v-icon { color: rgba(var(--v-theme-on-surface), 0.55); }
.action span { display: flex; flex-direction: column; }
.action small { font-size: 0.75rem; color: rgba(var(--v-theme-on-surface), 0.5); }
.action.danger, .action.danger .v-icon { color: rgb(var(--v-theme-error)); }
.action-sep { height: 1px; margin: 4px 12px; background: rgba(var(--v-theme-on-surface), 0.07); }
.finish-btn { border-radius: 14px !important; letter-spacing: 0; text-transform: none; }
.phase-toggle { gap: 8px; border: 0 !important; }
.phase-toggle .v-btn { border: 1px solid rgba(var(--v-theme-primary), 0.35) !important; border-radius: 10px !important; }
.quick-add {
  position: fixed; left: 12px; right: 12px; z-index: 5;
  bottom: calc(68px + env(safe-area-inset-bottom));
  max-width: 876px; margin: 0 auto;
}
.quick-bar {
  display: flex; align-items: center; gap: 2px; padding: 4px 5px 4px 18px; border-radius: 28px;
  background: rgba(255, 255, 255, 0.96); backdrop-filter: blur(12px);
  border: 1px solid rgba(var(--v-theme-primary), 0.18);
  box-shadow: 0 6px 24px rgba(37, 99, 235, 0.14), 0 1px 3px rgba(15, 23, 42, 0.08);
}
.quick-bar.reminder { border-color: rgba(234, 88, 12, 0.45); }
.quick-input { flex-grow: 1; min-width: 0; }
.send-btn { border-radius: 50% !important; }
.quick-input :deep(.v-field__input) { padding-top: 6px; padding-bottom: 6px; min-height: 40px; font-size: 16px; }
@media (min-width: 960px) { .quick-add { bottom: 16px; left: 72px; } }
</style>
