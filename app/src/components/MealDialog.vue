<script setup>
import { ref, computed, watch } from 'vue'
import api from '@/services/api'
import { useAppStore, useDataStore } from '@/stores'
import { formatAmount, formatNumber, shortDate, includedOptionalIds } from '@/utils/format'

const props = defineProps({
  modelValue: Boolean,
  meal: { type: Object, default: null },   // bestehende Mahlzeit oder null
  date: { type: String, default: null },
  slotId: { type: String, default: null },
})
const emit = defineEmits(['update:modelValue', 'saved'])

const appStore = useAppStore()
const data = useDataStore()

const kind = ref('dish')
const search = ref('')
const category = ref(null)
const dishId = ref(null)
const servings = ref(2)
const chosen = ref([])          // gewählte optionale Beilagen (dishIds)
const included = ref([])        // optionale Zutaten, die dabei sind (ingredientIds)
const text = ref('')
const date = ref(null)
const slotId = ref(null)
const status = ref('planned')
const busy = ref(false)
const confirmDelete = ref(false)

const open = computed({ get: () => props.modelValue, set: v => emit('update:modelValue', v) })
const dish = computed(() => data.dishById.get(dishId.value) ?? null)
const fixedComponents = computed(() => dish.value?.components.filter(c => !c.optional) ?? [])
const optionalComponents = computed(() => dish.value?.components.filter(c => c.optional) ?? [])
const optionalIngredients = computed(() => dish.value?.ingredients.filter(i => i.optional) ?? [])

const filteredDishes = computed(() => {
  const q = search.value.trim().toLowerCase()
  return data.activeDishes
    .filter(d => !category.value || d.categories.includes(category.value))
    .filter(d => !q || d.name.toLowerCase().includes(q))
})

watch(open, isOpen => {
  if (!isOpen) return
  const m = props.meal
  kind.value = m?.kind ?? 'dish'
  dishId.value = m?.dishId ?? null
  servings.value = m?.servings ?? 2
  chosen.value = (m?.components ?? []).map(c => c.dishId)
  included.value = includedOptionalIds(data.dishById.get(m?.dishId), m)
  text.value = m?.text ?? ''
  date.value = m?.date ?? props.date
  slotId.value = m?.slotId ?? props.slotId
  status.value = m?.status ?? 'planned'
  search.value = ''
  category.value = null
  confirmDelete.value = false
})

function chooseDish(d) {
  dishId.value = d.id
  servings.value = props.meal?.dishId === d.id ? props.meal.servings : d.servings
  chosen.value = []
  included.value = includedOptionalIds(d, null)
}

// list ist im Template schon ausgepackt (reaktives Array), daher direkt ändern
function toggle(list, id) {
  const i = list.indexOf(id)
  if (i >= 0) list.splice(i, 1)
  else list.push(id)
}

const canSave = computed(() => {
  if (kind.value === 'dish') return !!dishId.value && servings.value > 0
  if (kind.value === 'text') return text.value.trim().length > 0
  return true
})

function payload() {
  const base = { date: date.value, slotId: slotId.value, kind: kind.value, status: status.value }
  if (kind.value === 'dish') {
    const factorOf = id => optionalComponents.value.find(c => c.dishId === id)?.factor ?? 1
    return {
      ...base, dishId: dishId.value, servings: servings.value,
      components: chosen.value.filter(id => optionalComponents.value.some(c => c.dishId === id)).map(id => ({ dishId: id, factor: factorOf(id) })),
      ingredientChoices: optionalIngredients.value.map(i => ({ ingredientId: i.id, included: included.value.includes(i.id) })),
    }
  }
  return { ...base, text: text.value.trim() || null }
}

async function save(extra = {}) {
  busy.value = true
  try {
    const body = { ...payload(), ...extra }
    const saved = props.meal ? await api.updateMeal(props.meal.id, body) : await api.createMeal(body)
    emit('saved', saved)
    open.value = false
  } catch (e) {
    appStore.showError(e)
  } finally {
    busy.value = false
  }
}

async function remove() {
  busy.value = true
  try {
    await api.deleteMeal(props.meal.id)
    emit('saved', null)
    open.value = false
  } catch (e) {
    appStore.showError(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <v-dialog v-model="open" max-width="560" scrollable :fullscreen="$vuetify.display.xs">
    <v-card>
      <v-toolbar color="primary" density="comfortable">
        <v-btn icon="mdi-close" @click="open = false" />
        <v-toolbar-title class="text-body-1">
          {{ meal ? 'Mahlzeit' : 'Neue Mahlzeit' }}
          <span class="text-caption ml-1">{{ shortDate(date ?? '') }} · {{ data.slots.find(s => s.id === slotId)?.name }}</span>
        </v-toolbar-title>
        <v-btn :disabled="!canSave" :loading="busy" variant="text" @click="save()">Speichern</v-btn>
      </v-toolbar>

      <v-card-text class="pt-4">
        <v-btn-toggle v-model="kind" mandatory color="primary" variant="outlined" divided density="comfortable" class="mb-4 w-100">
          <v-btn value="dish" class="flex-grow-1">Gericht</v-btn>
          <v-btn value="leftovers" class="flex-grow-1">Reste</v-btn>
          <v-btn value="text" class="flex-grow-1">Freitext</v-btn>
        </v-btn-toggle>

        <!-- Gericht -->
        <template v-if="kind === 'dish'">
          <template v-if="!dish">
            <v-text-field v-model="search" placeholder="Gericht suchen" prepend-inner-icon="mdi-magnify" clearable hide-details autofocus class="mb-2" />
            <div class="chips mb-2">
              <v-chip v-for="c in data.categories" :key="c" size="small" :color="category === c ? 'primary' : undefined"
                :variant="category === c ? 'flat' : 'outlined'" @click="category = category === c ? null : c">{{ c }}</v-chip>
            </div>
            <v-list density="compact" class="dish-list">
              <v-list-item v-for="d in filteredDishes" :key="d.id" :title="d.name" :subtitle="d.categories.join(', ')" @click="chooseDish(d)">
                <template #append>
                  <v-icon v-if="d.kind === 'takeaway'" icon="mdi-moped-outline" size="small" />
                  <v-icon v-else-if="d.kind === 'buy'" icon="mdi-package-variant-closed" size="small" />
                </template>
              </v-list-item>
              <v-list-item v-if="!filteredDishes.length" title="Nichts gefunden" subtitle="Freitext nehmen oder Gericht in der Verwaltung anlegen" />
            </v-list>
          </template>

          <template v-else>
            <div class="d-flex align-center mb-3">
              <div class="flex-grow-1">
                <div class="text-h6">{{ dish.name }}</div>
                <div class="text-caption text-medium-emphasis">{{ dish.categories.join(', ') }}</div>
              </div>
              <v-btn variant="text" size="small" @click="dishId = null">Ändern</v-btn>
            </div>

            <template v-if="dish.kind !== 'takeaway'">
              <div class="d-flex align-center mb-4">
                <span class="mr-4">Portionen</span>
                <v-btn icon="mdi-minus" size="small" variant="tonal" :disabled="servings <= 0.5" @click="servings = Math.max(0.5, servings - (servings > 1 ? 1 : 0.5))" />
                <span class="text-h6 mx-4 servings">{{ formatNumber(servings) }}</span>
                <v-btn icon="mdi-plus" size="small" variant="tonal" @click="servings = servings < 1 ? 1 : servings + 1" />
              </div>
            </template>

            <div v-if="fixedComponents.length" class="mb-3 text-body-2">
              <span class="text-medium-emphasis">Immer dabei:</span> {{ fixedComponents.map(c => c.dishName).join(', ') }}
            </div>

            <div v-if="optionalComponents.length" class="mb-4">
              <div class="text-subtitle-2 mb-1">Beilagen</div>
              <div class="chips">
                <v-chip v-for="c in optionalComponents" :key="c.dishId" :color="chosen.includes(c.dishId) ? 'primary' : undefined"
                  :variant="chosen.includes(c.dishId) ? 'flat' : 'outlined'" :prepend-icon="chosen.includes(c.dishId) ? 'mdi-check' : undefined"
                  @click="toggle(chosen, c.dishId)">{{ c.dishName }}</v-chip>
              </div>
            </div>

            <div v-if="optionalIngredients.length" class="mb-4">
              <div class="text-subtitle-2 mb-1">Optionale Zutaten</div>
              <div class="chips">
                <v-chip v-for="i in optionalIngredients" :key="i.id" :color="included.includes(i.id) ? 'primary' : undefined"
                  :variant="included.includes(i.id) ? 'flat' : 'outlined'" :prepend-icon="included.includes(i.id) ? 'mdi-check' : undefined"
                  @click="toggle(included, i.id)">
                  {{ i.productName }}<span v-if="i.amount" class="ml-1 text-caption">{{ formatAmount(i.amount * servings, i.unit, data.units) }}</span>
                </v-chip>
              </div>
            </div>
          </template>
        </template>

        <!-- Reste / Freitext -->
        <v-text-field v-if="kind === 'leftovers'" v-model="text" label="Welche Reste? (optional)" placeholder="z.B. Sagne" />
        <v-text-field v-if="kind === 'text'" v-model="text" label="Was gibt es?" placeholder="z.B. Holschompf, Mamaschompf" autofocus />

        <!-- Termin -->
        <v-divider class="my-3" />
        <div class="d-flex ga-3">
          <v-text-field v-model="date" type="date" label="Tag" hide-details density="comfortable" />
          <v-select v-model="slotId" :items="data.slots" item-title="name" item-value="id" label="Mahlzeit" hide-details density="comfortable" />
        </div>
      </v-card-text>

      <v-card-actions v-if="meal" class="px-4 pb-4">
        <v-btn v-if="!confirmDelete" color="error" variant="text" prepend-icon="mdi-delete-outline" @click="confirmDelete = true">Löschen</v-btn>
        <v-btn v-else color="error" variant="flat" :loading="busy" @click="remove">Wirklich löschen</v-btn>
        <v-spacer />
        <v-btn v-if="status === 'planned'" variant="tonal" prepend-icon="mdi-check" :loading="busy" @click="save({ status: 'prepared' })">Zubereitet</v-btn>
        <v-btn v-else variant="text" :loading="busy" @click="save({ status: 'planned' })">Doch nicht zubereitet</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.dish-list { max-height: 50vh; overflow-y: auto; }
.servings { min-width: 2.5em; text-align: center; }
</style>
