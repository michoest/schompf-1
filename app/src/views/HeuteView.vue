<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/services/api'
import { useAppStore, useDataStore } from '@/stores'
import { useLiveStore } from '@/stores/live'
import { today, addDays, longDate, formatNumber } from '@/utils/format'

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
  if (m.excludedIngredientIds.length) query.ohne = m.excludedIngredientIds.join(',')
  router.push({ path: `/gericht/${m.dishId}`, query })
}

async function togglePrepared(m) {
  try {
    await api.updateMeal(m.id, { status: m.status === 'prepared' ? 'planned' : 'prepared' })
    await load()
  } catch (e) { appStore.showError(e) }
}
</script>

<template>
  <div>
    <div v-for="(date, index) in days" :key="date" class="mb-4">
      <div class="text-h6 mb-2" :class="{ 'text-medium-emphasis': index > 0 }">{{ longDate(date) }}</div>
      <template v-for="slot in data.slots" :key="slot.id">
        <v-card v-for="m in mealsFor(date, slot.id)" :key="m.id" class="mb-2" :class="{ prepared: m.status === 'prepared' }" @click="open(m)">
          <v-card-text class="d-flex align-center py-3">
            <div class="flex-grow-1">
              <div class="text-caption text-medium-emphasis">{{ slot.name }} · {{ slot.time }}</div>
              <div :class="index === 0 ? 'text-h6' : 'text-subtitle-1'">{{ label(m) }}</div>
              <div v-if="m.components.length" class="text-caption">mit {{ m.components.map(c => c.dishName).join(', ') }}</div>
              <div v-if="m.kind === 'dish' && m.dishKind !== 'takeaway'" class="text-caption text-medium-emphasis">{{ formatNumber(m.servings) }} Portionen</div>
            </div>
            <v-btn :icon="m.status === 'prepared' ? 'mdi-check-circle' : 'mdi-check-circle-outline'" :color="m.status === 'prepared' ? 'primary' : undefined"
              variant="text" @click.stop="togglePrepared(m)" />
            <v-icon v-if="m.kind === 'dish'" icon="mdi-chevron-right" />
          </v-card-text>
        </v-card>
      </template>
      <p v-if="!meals.some(m => m.date === date)" class="text-body-2 text-medium-emphasis">
        Noch nichts geplant. <a href="#" @click.prevent="router.push('/plan')">Zum Plan</a>
      </p>
    </div>
  </div>
</template>

<style scoped>
.prepared { opacity: 0.6; }
</style>
