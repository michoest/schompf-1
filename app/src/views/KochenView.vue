<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/services/api'
import { useAppStore, useDataStore } from '@/stores'
import { useLiveStore } from '@/stores/live'
import { today, addDays, longDate, shortDate, formatNumber, includedOptionalIds } from '@/utils/format'

const router = useRouter()
const appStore = useAppStore()
const data = useDataStore()
const live = useLiveStore()

const meals = ref([])
const days = computed(() => [today(), addDays(today(), 1)])

async function load() {
  try {
    meals.value = await api.meals(today(), addDays(today(), 1))
  } catch (e) { appStore.showError(e) }
}
watch(() => live.version.meals, load)
onMounted(load)

const mealsFor = (date, slotId) => meals.value.filter(m => m.date === date && m.slotId === slotId)

function label(m) {
  if (m.kind === 'dish') return m.dishName
  if (m.kind === 'leftovers') return m.text ? `Reste: ${m.text}` : 'Reste'
  return m.text
}

function open(m) {
  if (m.kind !== 'dish') return
  const query = { servings: m.servings }
  if (m.components.length) query.beilagen = m.components.map(c => c.dishId).join(',')
  const dish = data.dishById.get(m.dishId)
  const included = includedOptionalIds(dish, m)
  const without = (dish?.ingredients ?? []).filter(i => i.optional && !included.includes(i.id)).map(i => i.id)
  if (without.length) query.ohne = without.join(',')
  router.push({ path: `/gericht/${m.dishId}`, query })
}

// Zubereitet: stehen noch offene Zutaten auf der Einkaufsliste, nachfragen, ob sie weg sollen
const pending = ref(null)   // { meal, needs }
async function togglePrepared(m) {
  try {
    if (m.status !== 'prepared') {
      const needs = await api.mealOpenNeeds(m.id)
      if (needs.length) { pending.value = { meal: m, needs }; return }
    }
    await setPrepared(m, m.status !== 'prepared', false)
  } catch (e) { appStore.showError(e) }
}
async function setPrepared(m, prepared, releaseNeeds) {
  pending.value = null
  try {
    await api.updateMeal(m.id, { status: prepared ? 'prepared' : 'planned', releaseNeeds })
    await load()
  } catch (e) { appStore.showError(e) }
}
</script>

<template>
  <div>
    <div v-for="(date, index) in days" :key="date" class="mb-4">
      <div class="d-flex align-baseline mb-2" :class="{ 'text-medium-emphasis': index > 0 }">
        <span class="text-h6">{{ longDate(date) }}</span>
        <span class="text-body-2 text-medium-emphasis ml-2">{{ shortDate(date) }}</span>
      </div>
      <template v-for="slot in data.slots" :key="slot.id">
        <v-card v-for="m in mealsFor(date, slot.id)" :key="m.id" class="mb-2" :class="{ prepared: m.status === 'prepared' }" @click="open(m)">
          <v-card-text class="d-flex align-center py-3">
            <div class="flex-grow-1">
              <div class="text-caption text-medium-emphasis">{{ slot.name }}</div>
              <div :class="index === 0 ? 'text-h6' : 'text-subtitle-1'">{{ label(m) }}</div>
              <div v-if="m.components.length" class="text-caption">mit {{ m.components.map(c => c.dishName).join(', ') }}</div>
              <div v-if="m.kind === 'dish' && m.dishKind !== 'takeaway'" class="text-caption text-medium-emphasis d-flex align-center ga-3 mt-1">
                <span><v-icon icon="mdi-silverware-fork-knife" size="x-small" class="mr-1" />{{ formatNumber(m.servings) }}</span>
                <span v-if="data.dishById.get(m.dishId)?.totalMinutes"><v-icon icon="mdi-clock-outline" size="x-small" class="mr-1" />{{ data.dishById.get(m.dishId).totalMinutes }} Min.</span>
              </div>
            </div>
            <v-btn :icon="m.status === 'prepared' ? 'mdi-check-circle' : 'mdi-check-circle-outline'" :color="m.status === 'prepared' ? 'primary' : undefined"
              variant="text" @click.stop="togglePrepared(m)" />
          </v-card-text>
        </v-card>
      </template>
      <p v-if="!meals.some(m => m.date === date)" class="text-body-2 text-medium-emphasis">
        Noch nichts geplant. <a href="#" @click.prevent="router.push('/plan')">Zum Plan</a>
      </p>
    </div>

    <v-dialog :model-value="!!pending" max-width="400" @update:model-value="pending = null">
      <v-card v-if="pending" :title="`${label(pending.meal)} zubereitet`">
        <v-card-text class="text-body-2">
          Noch auf der Einkaufsliste:
          <div v-for="n in pending.needs" :key="n.productId + n.part" class="mt-1">{{ n.display }} {{ n.name }}</div>
          <p class="mt-3">Von der Liste nehmen?</p>
        </v-card-text>
        <v-card-actions>
          <v-btn variant="text" @click="setPrepared(pending.meal, true, false)">Stehen lassen</v-btn>
          <v-spacer />
          <v-btn color="primary" variant="flat" @click="setPrepared(pending.meal, true, true)">Entfernen</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.prepared { opacity: 0.6; }
</style>
