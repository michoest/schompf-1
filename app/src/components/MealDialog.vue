<script setup>
import { ref, computed, watch } from 'vue'
import api from '@/services/api'
import { useAppStore, useDataStore } from '@/stores'
import { formatAmount, formatNumber, shortDate, includedOptionalIds } from '@/utils/format'
import { renderRecipe } from '@/utils/recipe'

const props = defineProps({
  modelValue: Boolean,
  meal: { type: Object, default: null },   // bestehende Mahlzeit oder null
  date: { type: String, default: null },
  slotId: { type: String, default: null },
  label: { type: String, default: null },  // eigener Name der Mahlzeit (z.B. „Kaffee & Kuchen“)
})
const emit = defineEmits(['update:modelValue', 'saved'])

const appStore = useAppStore()
const data = useDataStore()

const kind = ref('dish')
const search = ref('')
const category = ref(null)
const sortBy = ref('name')
const quickOnly = ref(false)
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
const showDetails = ref(null)

// Einkaufsliste: nur mitändern, wenn ausdrücklich gewählt (Vorschau zeigt, was sich ändern würde)
const preview = ref(null)        // { trip, committed, done, delta[] }
const syncTrip = ref(true)
// Zubereitet/Löschen: noch offene Zutaten dieser Mahlzeit auf der Liste (nach Nachfrage entfernen)
const openNeeds = ref([])
const releaseNeeds = ref(true)
const confirmPrepared = ref(false)
let previewTimer = null

const QUICK_MINUTES = 30
// Vorgaben für „Sonstiges“; alles andere über das Freitextfeld
const TEXT_OPTIONS = ['Repmeal', 'Holschompf', 'Schompfen watscheln']
const kinds = [
  { value: 'dish', title: 'Gericht', icon: 'mdi-pot-steam-outline' },
  { value: 'leftovers', title: 'Reste', icon: 'mdi-recycle' },
  { value: 'text', title: 'Sonstiges', icon: 'mdi-room-service-outline' },
]
const label = ref(null)
// Eigener Name: bei neuen eigenen Mahlzeiten und beim Bearbeiten von Mahlzeiten an optionalen Positionen
const labelEditable = computed(() => !!label.value || (isEdit.value && !!data.slots.find(s => s.id === slotId.value)?.optional))
const open = computed({ get: () => props.modelValue, set: v => emit('update:modelValue', v) })
const isEdit = computed(() => !!props.meal)
const dish = computed(() => data.dishById.get(dishId.value) ?? null)
const fixedComponents = computed(() => dish.value?.components.filter(c => !c.optional) ?? [])
const optionalComponents = computed(() => dish.value?.components.filter(c => c.optional) ?? [])
const optionalIngredients = computed(() => dish.value?.ingredients.filter(i => i.optional) ?? [])
const slotName = computed(() => label.value || data.slots.find(s => s.id === (slotId.value ?? props.slotId))?.name)

const filteredDishes = computed(() => {
  const q = search.value.trim().toLowerCase()
  const list = data.activeDishes
    .filter(d => !category.value || d.categories.includes(category.value))
    .filter(d => !quickOnly.value || (d.totalMinutes != null && d.totalMinutes <= QUICK_MINUTES))
    .filter(d => !q || d.name.toLowerCase().includes(q))
  if (sortBy.value === 'time') return [...list].sort((a, b) => (a.totalMinutes ?? 999) - (b.totalMinutes ?? 999) || a.name.localeCompare(b.name))
  return list
})

// Zutaten & Zubereitung zum Nachsehen (für die gewählten Portionen)
const detailIngredients = computed(() => (dish.value?.ingredients ?? [])
  .filter(i => !i.optional || included.value.includes(i.id))
  .map(i => ({ ...i, display: i.amount != null ? formatAmount(i.amount * servings.value, i.unit, data.units) : '' })))
const recipeHtml = computed(() => dish.value?.recipe
  ? renderRecipe(dish.value.recipe, dish.value.ingredients.map(i => (i.optional && !included.value.includes(i.id) ? { ...i, amount: null } : i)), servings.value, data.units)
  : '')

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
  label.value = m?.label ?? props.label
  search.value = ''
  category.value = null
  confirmDelete.value = false
  showDetails.value = null
  preview.value = null
  openNeeds.value = []
  releaseNeeds.value = true
  confirmPrepared.value = false
  syncTrip.value = true
  schedulePreview()
})

const deltaText = computed(() => (preview.value?.delta ?? []).map(d => `${d.display} ${d.name}`).join(', '))
// Kästchen nur, wenn sich an der Liste etwas ändern würde und der Einkauf noch offen ist
const offerSync = computed(() => !!preview.value?.trip && !preview.value.done && (preview.value.delta.length > 0 || (!preview.value.committed && kind.value === 'dish')))

function schedulePreview() {
  clearTimeout(previewTimer)
  previewTimer = setTimeout(async () => {
    if (!open.value || (kind.value === 'dish' && !dishId.value)) { preview.value = null; return }
    try {
      preview.value = await api.previewMeal({ id: props.meal?.id ?? null, ...payload() })
    } catch { preview.value = null }
  }, 250)
}
watch([kind, dishId, servings, chosen, included, date], schedulePreview, { deep: true })

const needsText = computed(() => openNeeds.value.map(n => `${n.display} ${n.name}`.trim()).join(', '))

async function loadOpenNeeds() {
  try { openNeeds.value = await api.mealOpenNeeds(props.meal.id) } catch { openNeeds.value = [] }
}

async function askRemove() {
  confirmPrepared.value = false
  confirmDelete.value = true
  await loadOpenNeeds()
}

// Zubereitet: stehen noch offene Zutaten auf der Liste, erst nachfragen
async function markPrepared() {
  if (!confirmPrepared.value) {
    busy.value = true
    await loadOpenNeeds()
    busy.value = false
    if (openNeeds.value.length) { confirmDelete.value = false; confirmPrepared.value = true; return }
  }
  await save({ status: 'prepared', releaseNeeds: confirmPrepared.value && releaseNeeds.value })
}

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
  const base = { date: date.value, slotId: slotId.value, label: label.value || null, kind: kind.value, status: status.value }
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
    const body = { ...payload(), ...extra, syncTrip: offerSync.value && syncTrip.value }
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
    await api.deleteMeal(props.meal.id, openNeeds.value.length > 0 && releaseNeeds.value)
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
  <v-dialog v-model="open" max-width="600" scrollable :fullscreen="$vuetify.display.xs">
    <v-card class="meal-dialog">
      <v-toolbar color="primary" density="comfortable">
        <v-btn icon="mdi-close" aria-label="Schließen" @click="open = false" />
        <v-toolbar-title class="text-body-1">
          {{ isEdit ? 'Mahlzeit bearbeiten' : 'Neue Mahlzeit' }}
          <span class="text-caption ml-1 opacity-80">{{ shortDate(date ?? '') }} · {{ slotName }}</span>
        </v-toolbar-title>
      </v-toolbar>

      <v-card-text class="pt-5">
        <div class="kind-toggle mb-6">
          <v-btn v-for="k in kinds" :key="k.value" :prepend-icon="k.icon" :color="kind === k.value ? 'primary' : undefined"
            :variant="kind === k.value ? 'flat' : 'tonal'" class="kind-btn" @click="kind = k.value">{{ k.title }}</v-btn>
        </div>
        <v-text-field v-if="labelEditable" v-model="label" label="Name der Mahlzeit" placeholder="z.B. Kaffee & Kuchen" class="mb-2" />

        <!-- Gericht auswählen -->
        <template v-if="kind === 'dish' && !dish">
          <v-text-field v-model="search" placeholder="Gericht suchen" prepend-inner-icon="mdi-magnify" clearable hide-details class="mb-3" />
          <div class="chips mb-2">
            <v-chip size="small" :color="quickOnly ? 'primary' : undefined" :variant="quickOnly ? 'flat' : 'outlined'" prepend-icon="mdi-clock-fast" @click="quickOnly = !quickOnly">schnell</v-chip>
            <v-chip size="small" variant="outlined" :prepend-icon="sortBy === 'time' ? 'mdi-sort-clock-ascending-outline' : 'mdi-sort-alphabetical-ascending'" @click="sortBy = sortBy === 'time' ? 'name' : 'time'">
              {{ sortBy === 'time' ? 'nach Zeit' : 'A–Z' }}
            </v-chip>
            <v-chip v-for="c in data.categories" :key="c" size="small" :color="category === c ? 'primary' : undefined"
              :variant="category === c ? 'flat' : 'outlined'" @click="category = category === c ? null : c">{{ c }}</v-chip>
          </div>
          <v-list density="compact" class="dish-list">
            <v-list-item v-for="d in filteredDishes" :key="d.id" :title="d.name" :subtitle="d.categories.join(', ')" @click="chooseDish(d)">
              <template #append>
                <v-icon v-if="d.kind === 'takeaway'" icon="mdi-moped-outline" size="small" />
                <span v-else-if="d.totalMinutes" class="text-caption text-medium-emphasis">{{ d.totalMinutes }} Min.</span>
              </template>
            </v-list-item>
            <v-list-item v-if="!filteredDishes.length" title="Nichts gefunden" subtitle="„Sonstiges“ nehmen oder das Gericht in der Verwaltung anlegen" />
          </v-list>
        </template>

        <!-- Gewähltes Gericht -->
        <template v-if="kind === 'dish' && dish">
          <div class="d-flex align-start mb-4">
            <div class="flex-grow-1">
              <div class="text-h6">{{ dish.name }}</div>
              <div class="text-caption text-medium-emphasis">
                {{ dish.categories.join(', ') }}<span v-if="dish.totalMinutes"> · ca. {{ dish.totalMinutes }} Min.</span>
              </div>
            </div>
            <v-btn variant="text" size="small" @click="dishId = null">Anderes</v-btn>
          </div>

          <div v-if="dish.kind !== 'takeaway'" class="d-flex align-center mb-5">
            <v-icon icon="mdi-silverware-fork-knife" class="mr-3 text-medium-emphasis" />
            <span class="mr-4">Portionen</span>
            <v-btn icon="mdi-minus" size="small" variant="tonal" :disabled="servings <= 0.5" @click="servings = Math.max(0.5, servings - (servings > 1 ? 1 : 0.5))" />
            <span class="text-h6 mx-4 servings">{{ formatNumber(servings) }}</span>
            <v-btn icon="mdi-plus" size="small" variant="tonal" @click="servings = servings < 1 ? 1 : servings + 1" />
          </div>

          <div v-if="fixedComponents.length" class="mb-4 text-body-2">
            <span class="text-medium-emphasis">Immer dabei:</span> {{ fixedComponents.map(c => c.dishName).join(', ') }}
          </div>

          <div v-if="optionalComponents.length" class="mb-5">
            <div class="text-subtitle-2 mb-2">Beilagen</div>
            <div class="chips">
              <v-chip v-for="c in optionalComponents" :key="c.dishId" :color="chosen.includes(c.dishId) ? 'primary' : undefined"
                :variant="chosen.includes(c.dishId) ? 'flat' : 'outlined'" :prepend-icon="chosen.includes(c.dishId) ? 'mdi-check' : undefined"
                @click="toggle(chosen, c.dishId)">{{ c.dishName }}</v-chip>
            </div>
          </div>

          <div v-if="optionalIngredients.length" class="mb-5">
            <div class="text-subtitle-2 mb-2">Optionale Zutaten</div>
            <div class="chips">
              <v-chip v-for="i in optionalIngredients" :key="i.id" :color="included.includes(i.id) ? 'primary' : undefined"
                :variant="included.includes(i.id) ? 'flat' : 'outlined'" :prepend-icon="included.includes(i.id) ? 'mdi-check' : undefined"
                @click="toggle(included, i.id)">
                {{ i.productName }}<span v-if="i.amount" class="ml-1 text-caption">{{ formatAmount(i.amount * servings, i.unit, data.units) }}</span>
              </v-chip>
            </div>
          </div>

          <v-expansion-panels v-if="dish.kind !== 'takeaway'" v-model="showDetails" variant="accordion" class="mb-2">
            <v-expansion-panel value="details" title="Zutaten & Zubereitung">
              <v-expansion-panel-text>
                <div v-for="ing in detailIngredients" :key="ing.id" class="d-flex py-1 text-body-2">
                  <span class="amount text-medium-emphasis">{{ ing.display }}</span>
                  <span>{{ ing.productName }}</span>
                </div>
                <div v-if="recipeHtml" class="recipe mt-3" v-html="recipeHtml" />
                <div v-else class="text-body-2 text-medium-emphasis mt-3">
                  Noch kein Rezept hinterlegt.
                  <a v-if="dish.sourceUrl" :href="dish.sourceUrl" target="_blank" rel="noopener">Zur Quelle</a>
                </div>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
        </template>

        <!-- Reste / Sonstiges -->
        <v-text-field v-if="kind === 'leftovers'" v-model="text" label="Welche Reste? (optional)" placeholder="z.B. Sagne" />
        <template v-if="kind === 'text'">
          <div class="chips mb-4">
            <v-chip v-for="o in TEXT_OPTIONS" :key="o" :color="text === o ? 'primary' : undefined" :variant="text === o ? 'flat' : 'outlined'"
              :prepend-icon="text === o ? 'mdi-check' : undefined" @click="text = text === o ? '' : o">{{ o }}</v-chip>
          </div>
          <v-text-field v-model="text" label="Oder selbst eingeben" placeholder="z.B. Mamaschompf, Snack" />
        </template>

        <!-- Verschieben: nur beim Bearbeiten -->
        <template v-if="isEdit">
          <v-divider class="my-4" />
          <div class="d-flex ga-3">
            <v-text-field v-model="date" type="date" label="Tag" hide-details density="comfortable" />
            <v-select v-model="slotId" :items="data.slots" item-title="name" item-value="id" label="Mahlzeit" hide-details density="comfortable" />
          </div>
        </template>
      </v-card-text>

      <!-- Einkaufsliste -->
      <div v-if="(confirmDelete || confirmPrepared) && openNeeds.length" class="trip-sync px-4 py-2">
        <div v-if="confirmPrepared" class="text-body-2 pt-1">Noch nicht gekauft: {{ needsText }}</div>
        <v-checkbox v-model="releaseNeeds" hide-details density="compact" color="primary">
          <template #label>
            <span class="text-body-2">Von der Einkaufsliste nehmen
              <span v-if="confirmDelete" class="text-medium-emphasis">({{ needsText }})</span></span>
          </template>
        </v-checkbox>
      </div>
      <div v-else-if="!confirmDelete && !confirmPrepared && offerSync" class="trip-sync px-4 py-2">
        <v-checkbox v-model="syncTrip" hide-details density="compact" color="primary">
          <template #label>
            <span class="text-body-2">
              {{ preview.committed ? 'Einkaufsliste anpassen' : 'Auf die Einkaufsliste' }}
              <span v-if="deltaText" class="text-medium-emphasis">({{ deltaText }})</span>
            </span>
          </template>
        </v-checkbox>
      </div>
      <div v-else-if="!confirmDelete && !confirmPrepared && preview?.committed" class="trip-sync px-4 py-3 text-body-2 text-medium-emphasis">
        <v-icon icon="mdi-cart-check" size="small" class="mr-1" />
        {{ preview.done ? 'Eingekauft' : 'Steht auf der Einkaufsliste' }}
      </div>

      <v-divider />
      <v-card-actions class="actions px-4 py-3">
        <template v-if="isEdit">
          <v-btn v-if="!confirmDelete" icon="mdi-delete-outline" color="error" variant="text" aria-label="Löschen" @click="askRemove" />
          <v-btn v-else color="error" variant="flat" :loading="busy" @click="remove">Löschen</v-btn>
          <v-btn v-if="status === 'planned'" :variant="confirmPrepared ? 'flat' : 'text'" :color="confirmPrepared ? 'primary' : undefined"
            prepend-icon="mdi-check" :loading="busy" @click="markPrepared">Zubereitet</v-btn>
          <v-btn v-else variant="text" :loading="busy" @click="save({ status: 'planned' })">Nicht zubereitet</v-btn>
        </template>
        <v-spacer />
        <v-btn variant="text" @click="open = false">Abbrechen</v-btn>
        <v-btn color="primary" variant="flat" :disabled="!canSave" :loading="busy" @click="save()">Speichern</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.dish-list { max-height: 48vh; overflow-y: auto; }
.servings { min-width: 2.5em; text-align: center; }
.kind-toggle { display: flex; gap: 10px; }
.kind-btn { flex: 1 1 0; height: 46px !important; letter-spacing: 0; text-transform: none; font-size: 0.95rem; }
.amount { min-width: 88px; text-align: right; margin-right: 12px; }
.recipe :deep(ol), .recipe :deep(ul) { padding-left: 1.3em; }
.recipe :deep(li) { margin-bottom: 0.5em; line-height: 1.45; }
.trip-sync { background: rgba(var(--v-theme-primary), 0.05); }
.actions { padding-bottom: calc(12px + env(safe-area-inset-bottom)) !important; }
</style>
