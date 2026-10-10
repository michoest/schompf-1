<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/services/api'
import { useAppStore, useDataStore } from '@/stores'
import { useLiveStore } from '@/stores/live'
import { addDays, today, mondayOf, longDate, shortDate, formatNumber } from '@/utils/format'
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
const inTrip = date => trip.value && date >= trip.value.coversFrom && date <= trip.value.coversTo

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

function addMeal(date, slotId) {
  editMeal.value = null
  newDate.value = date
  newSlot.value = slotId
  dialog.value = true
}
function openMeal(meal) {
  editMeal.value = meal
  dialog.value = true
}
function earlier() { from.value = addDays(from.value, -7); load() }
function later() { to.value = addDays(to.value, 7); load() }

function mealLabel(m) {
  if (m.kind === 'dish') return m.dishName
  if (m.kind === 'leftovers') return m.text ? `Reste: ${m.text}` : 'Reste'
  return m.text
}
function mealIcon(m) {
  if (m.kind === 'leftovers') return 'mdi-recycle'
  if (m.kind === 'text') return 'mdi-text-short'
  if (m.dishKind === 'takeaway') return 'mdi-moped-outline'
  return null
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
    <v-card class="mb-3" variant="tonal" color="primary">
      <v-card-text class="d-flex align-center py-2">
        <v-icon icon="mdi-cart-outline" class="mr-3" />
        <div class="flex-grow-1 text-body-2">
          <template v-if="trip">Einkauf {{ shortDate(trip.date) }} · für {{ shortDate(trip.coversFrom) }} – {{ shortDate(trip.coversTo) }}</template>
          <template v-else>Kein offener Einkauf</template>
        </div>
        <v-btn v-if="trip" size="small" variant="text" @click="router.push('/einkauf')">Zur Liste</v-btn>
        <v-btn size="small" variant="flat" color="primary" @click="tripDialog = true">{{ trip ? 'Neuer Einkauf' : 'Einkauf erstellen' }}</v-btn>
      </v-card-text>
    </v-card>

    <div class="text-center mb-2">
      <v-btn variant="text" size="small" prepend-icon="mdi-chevron-up" @click="earlier">Frühere Tage</v-btn>
    </div>

    <v-card v-for="date in days" :id="`day-${date}`" :key="date" class="mb-3 day" :class="{ today: date === today(), past: date < today(), 'in-trip': inTrip(date) }">
      <div class="day-header px-4 pt-3 pb-1 d-flex align-center">
        <span class="text-subtitle-1 font-weight-medium">{{ longDate(date) }}</span>
        <span v-if="['Heute', 'Morgen', 'Gestern'].includes(longDate(date))" class="text-caption text-medium-emphasis ml-2">{{ shortDate(date) }}</span>
      </div>
      <div v-for="slot in data.slots" :key="slot.id" class="slot d-flex align-start px-4 py-1">
        <div class="slot-name text-caption text-medium-emphasis">{{ slot.name }}</div>
        <div class="flex-grow-1 d-flex flex-wrap ga-1">
          <v-chip v-for="m in mealsBySlot.get(`${date}/${slot.id}`) ?? []" :key="m.id" size="small" label
            :variant="m.status === 'prepared' ? 'tonal' : 'flat'" :color="m.status === 'prepared' ? undefined : 'primary'"
            :prepend-icon="m.status === 'prepared' ? 'mdi-check' : mealIcon(m)" @click="openMeal(m)">
            {{ mealLabel(m) }}<span v-if="m.kind === 'dish' && m.servings !== 2 && m.dishKind !== 'takeaway'" class="ml-1 opacity-70">×{{ formatNumber(m.servings) }}</span>
          </v-chip>
          <v-btn icon="mdi-plus" size="x-small" variant="text" density="comfortable" @click="addMeal(date, slot.id)" />
        </div>
      </div>
      <div class="pb-2" />
    </v-card>

    <div class="text-center mb-4">
      <v-btn variant="text" size="small" prepend-icon="mdi-chevron-down" @click="later">Weitere Tage</v-btn>
    </div>

    <MealDialog v-model="dialog" :meal="editMeal" :date="newDate" :slot-id="newSlot" @saved="load" />
    <TripDialog v-model="tripDialog" @saved="router.push('/einkauf')" />
  </div>
</template>

<style scoped>
.day { scroll-margin-top: 72px; }
.day.today { border-left: 4px solid rgb(var(--v-theme-primary)); }
.day.past { opacity: 0.7; }
.day.in-trip .day-header::after { content: '🛒'; margin-left: auto; font-size: 0.9rem; }
.slot-name { width: 88px; flex-shrink: 0; padding-top: 4px; }
</style>
