<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/services/api'
import { useAppStore, useDataStore } from '@/stores'
import { useLiveStore } from '@/stores/live'
import { addDays, today, mondayOf, longDate, shortDate, formatNumber, planCoverage } from '@/utils/format'
import MealDialog from '@/components/MealDialog.vue'
import TripDialog from '@/components/TripDialog.vue'

const router = useRouter()
const appStore = useAppStore()
const data = useDataStore()
const live = useLiveStore()

const from = ref(mondayOf(today()))
const to = ref(addDays(mondayOf(today()), 13))
const meals = ref([])
const trip = ref(null)
const loading = ref(false)

const dialog = ref(false)
const editMeal = ref(null)
const newDate = ref(null)
const newSlot = ref(null)
const newLabel = ref(null)
const tripDialog = ref(false)

const days = computed(() => {
  const result = []
  for (let d = from.value; d <= to.value; d = addDays(d, 1)) result.push(d)
  return result
})
const mealsBySlot = computed(() => {
  const map = new Map()
  for (const m of meals.value) {
    const key = `${m.date}/${m.slotId}`
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(m)
  }
  return map
})
const coverage = computed(() => planCoverage(trip.value))
const inTrip = date => !!coverage.value && date >= today() && date <= coverage.value
// Ausnahme markieren statt jedes Gericht: im Zeitraum der Liste, aber nicht drauf
const missingFromList = (m, date) => inTrip(date) && m.kind === 'dish' && m.dishKind !== 'takeaway' && !m.tripId && m.status !== 'prepared'
// Zeilen eines Tages: feste Mahlzeiten immer, optionale (Snacks/eigene) nur, wenn belegt.
// Mahlzeiten mit eigenem Namen bekommen eine eigene Zeile an der Position ihres Slots.
function rowsFor(date) {
  const rows = []
  for (const slot of data.slots) {
    const meals = mealsBySlot.value.get(`${date}/${slot.id}`) ?? []
    const labels = [...new Set(meals.map(m => m.label ?? null))]
    if (!slot.optional && !labels.includes(null)) labels.unshift(null)
    for (const label of labels) {
      rows.push({ key: `${slot.id}/${label ?? ''}`, slotId: slot.id, label, name: label ?? slot.name, meals: meals.filter(m => (m.label ?? null) === label) })
    }
  }
  return rows
}
const snackSlots = computed(() => data.slots.filter(s => s.optional && s.id.startsWith('snack')))
const positions = computed(() => [
  { value: 'early', title: 'Vor dem Frühstück' },
  { value: 'snack-morning', title: 'Zwischen Frühstück und Mittagessen' },
  { value: 'snack-afternoon', title: 'Zwischen Mittag- und Abendessen' },
  { value: 'snack-evening', title: 'Nach dem Abendessen' },
].filter(p => data.slots.some(s => s.id === p.value)))

// Eigene Mahlzeit: Name + Position abfragen, dann wie gewohnt anlegen
const customDialog = ref(false)
const customDate = ref(null)
const customName = ref('')
const customPosition = ref('snack-afternoon')
function addCustom(date) {
  customDate.value = date
  customName.value = ''
  customPosition.value = 'snack-afternoon'
  customDialog.value = true
}
function confirmCustom() {
  if (!customName.value.trim()) return
  customDialog.value = false
  addMeal(customDate.value, customPosition.value, customName.value.trim())
}

async function load() {
  loading.value = true
  try {
    const [m, t] = await Promise.all([api.meals(from.value, to.value), api.currentTrip()])
    meals.value = m
    trip.value = t?.trip ?? null
  } catch (e) {
    appStore.showError(e)
  } finally {
    loading.value = false
  }
}

function addMeal(date, slotId, label = null) {
  editMeal.value = null
  newDate.value = date
  newSlot.value = slotId
  newLabel.value = label
  dialog.value = true
}
function openMeal(meal) {
  editMeal.value = meal
  dialog.value = true
}
function earlier() { from.value = addDays(from.value, -7); load() }
function later() { to.value = addDays(to.value, 7); load() }

// klare Symbole statt langer Namen (Name als Tooltip und im leeren Feld)
const SLOT_ICONS = {
  early: 'mdi-weather-sunset-up', breakfast: 'mdi-coffee-outline', 'snack-morning': 'mdi-food-apple-outline',
  lunch: 'mdi-white-balance-sunny', 'snack-afternoon': 'mdi-cookie-outline', dinner: 'mdi-weather-night', 'snack-evening': 'mdi-popcorn',
}
const slotIcon = slotId => SLOT_ICONS[slotId] ?? 'mdi-silverware-variant'
const slotName = slotId => data.slots.find(s => s.id === slotId)?.name ?? ''

function mealLabel(m) {
  if (m.kind === 'dish') return m.dishName
  if (m.kind === 'leftovers') return m.text ? `Reste: ${m.text}` : 'Reste'
  return m.text
}

watch(() => [live.version.meals, live.version.trips], load)
onMounted(async () => {
  await load()
  await nextTick()
  document.getElementById(`day-${today()}`)?.scrollIntoView({ block: 'start' })
})
</script>

<template>
  <div>
    <v-card class="mb-4 trip-banner">
      <v-card-text class="d-flex align-center py-2">
        <v-icon icon="mdi-cart-outline" class="mr-3" />
        <div class="flex-grow-1 text-body-2">
          <template v-if="coverage">Gerichte bis {{ shortDate(coverage) }} auf der Einkaufsliste</template>
          <template v-else>Noch keine Gerichte auf der Einkaufsliste</template>
        </div>
        <v-btn size="small" variant="text" @click="router.push('/einkauf')">Zur Liste</v-btn>
        <v-btn size="small" variant="flat" color="primary" @click="tripDialog = true">Aus Plan holen</v-btn>
      </v-card-text>
    </v-card>

    <div class="text-center mb-2">
      <v-btn variant="text" size="small" prepend-icon="mdi-chevron-up" @click="earlier">Frühere Tage</v-btn>
    </div>

    <v-card v-for="date in days" :id="`day-${date}`" :key="date" class="mb-4 day" :class="{ today: date === today(), past: date < today(), 'in-trip': inTrip(date) }">
      <div class="day-header px-4 pt-3 pb-2 d-flex align-baseline">
        <span class="text-subtitle-1 font-weight-medium">{{ longDate(date) }}</span>
        <span v-if="['Heute', 'Morgen', 'Gestern'].includes(longDate(date))" class="text-body-2 text-medium-emphasis ml-2">{{ shortDate(date) }}</span>
        <v-spacer />
        <v-icon v-if="inTrip(date)" icon="mdi-cart-check" size="small" color="primary" title="Gerichte auf der Einkaufsliste" />
      </div>
      <div v-for="row in rowsFor(date)" :key="row.key" class="slot-row">
        <div class="slot-icon" :title="row.name"><v-icon :icon="slotIcon(row.slotId)" size="20" /></div>
        <div class="slot-meals">
          <div v-if="row.label" class="row-label">{{ row.label }}</div>
          <div v-for="m in row.meals" :key="m.id" class="meal" :class="{ prepared: m.status === 'prepared', other: m.kind !== 'dish' }" @click="openMeal(m)">
            <v-icon v-if="m.status === 'prepared'" icon="mdi-check-circle" size="16" color="primary" class="mr-1" title="zubereitet" />
            <span class="meal-name">{{ mealLabel(m) }}</span>
            <v-icon v-if="m.dishKind === 'takeaway'" icon="mdi-moped-outline" size="16" class="ml-1 text-medium-emphasis" title="bestellt" />
            <v-icon v-if="missingFromList(m, date)" icon="mdi-cart-remove" size="16" color="warning" class="ml-1" title="nicht auf der Einkaufsliste" />
            <span v-if="m.kind === 'dish' && m.dishKind !== 'takeaway'" class="servings">{{ formatNumber(m.servings) }} P.</span>
          </div>
          <div v-if="!row.meals.length" class="meal empty" @click="addMeal(date, row.slotId, row.label)">
            <v-icon icon="mdi-plus" size="16" class="mr-1" />{{ row.label ?? slotName(row.slotId) }}
          </div>
        </div>
        <div class="slot-add">
          <v-btn v-if="row.meals.length" icon="mdi-plus" size="x-small" variant="text" class="add-btn" :aria-label="`${row.name} hinzufügen`" @click="addMeal(date, row.slotId, row.label)" />
        </div>
      </div>
      <div class="px-2 pb-2">
        <v-menu>
          <template #activator="{ props }">
            <v-btn v-bind="props" variant="text" size="small" prepend-icon="mdi-plus" class="text-medium-emphasis text-none">Weitere Mahlzeit</v-btn>
          </template>
          <v-list density="compact">
            <v-list-item v-for="slot in snackSlots" :key="slot.id" :title="slot.name" @click="addMeal(date, slot.id)" />
            <v-divider />
            <v-list-item prepend-icon="mdi-pencil-outline" title="Eigene Mahlzeit…" @click="addCustom(date)" />
          </v-list>
        </v-menu>
      </div>
    </v-card>

    <div class="text-center mb-4">
      <v-btn variant="text" size="small" prepend-icon="mdi-chevron-down" @click="later">Weitere Tage</v-btn>
    </div>

    <MealDialog v-model="dialog" :meal="editMeal" :date="newDate" :slot-id="newSlot" :label="newLabel" @saved="load" />

    <v-dialog v-model="customDialog" max-width="420">
      <v-card title="Eigene Mahlzeit">
        <v-card-text>
          <v-text-field v-model="customName" label="Name" placeholder="z.B. Kaffee & Kuchen" autofocus @keydown.enter="confirmCustom" />
          <v-select v-model="customPosition" :items="positions" label="Wann?" />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="customDialog = false">Abbrechen</v-btn>
          <v-btn color="primary" variant="flat" :disabled="!customName.trim()" @click="confirmCustom">Weiter</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
    <TripDialog v-model="tripDialog" @saved="router.push('/einkauf')" />
  </div>
</template>

<style scoped>
.day { scroll-margin-top: 72px; }
.trip-banner { background: linear-gradient(120deg, rgba(37, 99, 235, 0.10), rgba(79, 70, 229, 0.10)); box-shadow: none !important; }
.day.today { border-left: 4px solid rgb(var(--v-theme-primary)); }
.day.past { opacity: 0.7; }
.slot-row { display: grid; grid-template-columns: 36px 1fr 32px; align-items: start; padding: 0 8px 0 14px; }
.slot-row + .slot-row { border-top: 1px solid rgba(var(--v-theme-on-surface), 0.05); }
/* Symbol und Plus auf der Mittellinie der ersten Mahlzeit: 3px Abstand + 32px Zeile */
.slot-icon, .slot-add { height: 38px; display: flex; align-items: center; }
.slot-icon { color: rgba(var(--v-theme-on-surface), 0.4); }
.slot-add { justify-content: flex-end; }
.row-label { font-size: 0.72rem; color: rgba(var(--v-theme-on-surface), 0.5); padding: 4px 0 0; }
.slot-meals { min-width: 0; padding: 3px 0; }
.meal { display: flex; align-items: center; padding: 5px 6px; margin-left: -6px; cursor: pointer; border-radius: 8px; min-height: 32px; }
.meal:hover { background: rgba(var(--v-theme-primary), 0.05); }
.meal-name { flex-grow: 1; min-width: 0; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.meal.prepared .meal-name { color: rgba(var(--v-theme-on-surface), 0.5); font-weight: 400; }
.meal.other .meal-name { font-style: italic; font-weight: 400; }
.meal.empty { color: rgba(var(--v-theme-on-surface), 0.35); font-size: 0.875rem; }
.servings { margin-left: 12px; white-space: nowrap; font-size: 0.8rem; color: rgba(var(--v-theme-on-surface), 0.45); }
.add-btn { color: rgba(var(--v-theme-on-surface), 0.4); }
</style>
