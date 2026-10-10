<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/services/api'
import { useAppStore, useDataStore } from '@/stores'
import { parseNumber, formatNumber } from '@/utils/format'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const data = useDataStore()

const isNew = computed(() => route.params.id === 'neu')
const form = ref(null)
const changes = ref([])
const busy = ref(false)
const confirmDelete = ref(false)

const kinds = [
  { value: 'cook', title: 'Kochen' },
  { value: 'buy', title: 'Fertig kaufen' },
  { value: 'takeaway', title: 'Holen / Bestellen' },
]
const otherDishes = computed(() => data.dishes.filter(d => d.id !== form.value?.id).map(d => ({ title: d.name, value: d.id })))
const productItems = computed(() => data.products.map(p => p.name))

onMounted(async () => {
  await data.load()
  if (isNew.value) {
    form.value = { name: '', kind: 'cook', status: 'draft', servings: 2, categories: [], sourceUrl: '', takeawayWhere: '', recipe: '', ingredients: [], components: [], preparations: [] }
    return
  }
  const dish = await api.dish(route.params.id)
  form.value = {
    ...dish,
    servings: dish.servings,
    ingredients: dish.ingredients.map(i => ({ productName: i.productName, amount: i.amount == null ? '' : formatNumber(i.amount), unit: i.unit, optional: i.optional })),
    components: dish.components.map(c => ({ dishId: c.dishId, factor: formatNumber(c.factor), optional: c.optional })),
    preparations: dish.preparations.map(p => ({ text: p.text, leadHours: formatNumber(p.leadHours) })),
  }
  changes.value = await api.dishChanges(dish.id)
})

function addIngredient() { form.value.ingredients.push({ productName: '', amount: '', unit: 'Stück', optional: false }) }
function addComponent() { form.value.components.push({ dishId: null, factor: '1', optional: true }) }
function addPreparation() { form.value.preparations.push({ text: '', leadHours: '12' }) }

function onProductChosen(ing) {
  const product = data.products.find(p => p.name === ing.productName)
  if (product && (!ing.unit || ing.unit === 'Stück')) ing.unit = product.unit
}

async function save() {
  busy.value = true
  const f = form.value
  const body = {
    name: f.name, kind: f.kind, status: f.status, servings: parseNumber(f.servings),
    categories: f.categories, sourceUrl: f.sourceUrl || null, takeawayWhere: f.takeawayWhere || null, recipe: f.recipe || null,
    ingredients: f.kind === 'takeaway' ? [] : f.ingredients.filter(i => i.productName)
      .map(i => ({ productName: i.productName, amount: parseNumber(i.amount), unit: i.unit, optional: i.optional })),
    components: f.components.filter(c => c.dishId).map(c => ({ dishId: c.dishId, factor: parseNumber(c.factor), optional: c.optional })),
    preparations: f.preparations.filter(p => p.text).map(p => ({ text: p.text, leadHours: parseNumber(p.leadHours) })),
  }
  try {
    const saved = isNew.value ? await api.createDish(body) : await api.updateDish(f.id, body)
    await data.reloadDishes()
    appStore.showSnackbar('Gespeichert')
    router.replace(`/gericht/${saved.id}`)
  } catch (e) {
    appStore.showError(e)
  } finally {
    busy.value = false
  }
}

async function remove() {
  try {
    await api.deleteDish(form.value.id)
    await data.reloadDishes()
    router.replace('/verwaltung/gerichte')
  } catch (e) {
    appStore.showError(e)
  }
}
</script>

<template>
  <div v-if="form">
    <v-card class="mb-3">
      <v-card-text>
        <v-text-field v-model="form.name" label="Name" />
        <div class="d-flex ga-3 flex-wrap">
          <v-select v-model="form.kind" :items="kinds" label="Art" style="min-width: 180px" />
          <v-select v-model="form.status" :items="[{ value: 'active', title: 'Aktiv' }, { value: 'draft', title: 'Entwurf' }]" label="Status" style="min-width: 140px" />
          <v-text-field v-if="form.kind !== 'takeaway'" v-model="form.servings" label="Übliche Portionen" inputmode="decimal" style="max-width: 160px" />
        </div>
        <v-combobox v-model="form.categories" :items="data.categories" label="Kategorien" multiple chips closable-chips />
        <v-text-field v-if="form.kind === 'takeaway'" v-model="form.takeawayWhere" label="Wo holen/bestellen?" />
        <v-text-field v-model="form.sourceUrl" label="Quelle (Link)" />
      </v-card-text>
    </v-card>

    <v-card v-if="form.kind !== 'takeaway'" class="mb-3">
      <v-card-title class="text-subtitle-1">Zutaten <span class="text-caption text-medium-emphasis">(pro Portion)</span></v-card-title>
      <v-card-text>
        <div v-for="(ing, i) in form.ingredients" :key="i" class="ingredient mb-3">
          <v-autocomplete v-model="ing.productName" :items="productItems" placeholder="Produkt" density="compact" hide-details class="mb-1" @update:model-value="onProductChosen(ing)" />
          <div class="d-flex align-center ga-2">
            <v-text-field v-model="ing.amount" placeholder="Menge" inputmode="decimal" density="compact" hide-details style="max-width: 100px" />
            <v-select v-model="ing.unit" :items="data.units" item-title="singular" item-value="code" density="compact" hide-details style="max-width: 140px" />
            <v-spacer />
            <v-btn :icon="ing.optional ? 'mdi-help-circle' : 'mdi-help-circle-outline'" size="small" variant="text" :color="ing.optional ? 'primary' : undefined" title="optional" @click="ing.optional = !ing.optional" />
            <v-btn icon="mdi-close" size="small" variant="text" @click="form.ingredients.splice(i, 1)" />
          </div>
        </div>
        <p class="text-caption text-medium-emphasis">Menge leer = nach Bedarf. <v-icon icon="mdi-help-circle" size="x-small" /> = optional. Neue Produkte zuerst unter „Produkte“ anlegen.</p>
        <v-btn variant="tonal" size="small" prepend-icon="mdi-plus" class="mt-2" @click="addIngredient">Zutat</v-btn>
      </v-card-text>
    </v-card>

    <v-card class="mb-3">
      <v-card-title class="text-subtitle-1">Bestandteile & Beilagen</v-card-title>
      <v-card-text>
        <div v-for="(c, i) in form.components" :key="i" class="d-flex align-center ga-2 mb-1">
          <v-autocomplete v-model="c.dishId" :items="otherDishes" placeholder="Gericht" density="compact" hide-details class="flex-grow-1" />
          <v-text-field v-model="c.factor" prefix="×" inputmode="decimal" density="compact" hide-details style="max-width: 80px" />
          <v-select v-model="c.optional" :items="[{ value: false, title: 'immer' }, { value: true, title: 'wählbar' }]" density="compact" hide-details style="max-width: 120px" />
          <v-btn icon="mdi-close" size="small" variant="text" @click="form.components.splice(i, 1)" />
        </div>
        <p class="text-caption text-medium-emphasis">„immer“ = fester Bestandteil, „wählbar“ = Beilage, die man beim Planen auswählt.</p>
        <v-btn variant="tonal" size="small" prepend-icon="mdi-plus" class="mt-2" @click="addComponent">Bestandteil/Beilage</v-btn>
      </v-card-text>
    </v-card>

    <v-card v-if="form.kind !== 'takeaway'" class="mb-3">
      <v-card-title class="text-subtitle-1">Vorbereitungen</v-card-title>
      <v-card-text>
        <div v-for="(p, i) in form.preparations" :key="i" class="d-flex align-center ga-2 mb-1">
          <v-text-field v-model="p.text" placeholder="z.B. Kichererbsen einweichen" density="compact" hide-details class="flex-grow-1" />
          <v-text-field v-model="p.leadHours" suffix="h vorher" inputmode="decimal" density="compact" hide-details style="max-width: 130px" />
          <v-btn icon="mdi-close" size="small" variant="text" @click="form.preparations.splice(i, 1)" />
        </div>
        <v-btn variant="tonal" size="small" prepend-icon="mdi-plus" class="mt-2" @click="addPreparation">Vorbereitung</v-btn>
      </v-card-text>
    </v-card>

    <v-card v-if="form.kind !== 'takeaway'" class="mb-3">
      <v-card-title class="text-subtitle-1">Rezept</v-card-title>
      <v-card-text>
        <v-textarea v-model="form.recipe" auto-grow rows="6" placeholder="1. …&#10;2. …" hide-details />
        <p class="text-caption text-medium-emphasis mt-1">Mengen im Text: {Zutat} oder {Zutat, 0.5} für die Hälfte.</p>
      </v-card-text>
    </v-card>

    <div class="d-flex ga-2 mb-4">
      <v-btn v-if="!isNew && !confirmDelete" color="error" variant="text" @click="confirmDelete = true">Löschen</v-btn>
      <v-btn v-if="confirmDelete" color="error" variant="flat" @click="remove">Wirklich löschen</v-btn>
      <v-spacer />
      <v-btn variant="text" @click="router.back()">Abbrechen</v-btn>
      <v-btn color="primary" :loading="busy" @click="save">Speichern</v-btn>
    </div>

    <v-card v-if="changes.length" variant="outlined" class="mb-4">
      <v-card-title class="text-subtitle-2">Verlauf</v-card-title>
      <v-card-text>
        <div v-for="(c, i) in changes" :key="i" class="text-caption mb-1">
          <strong>{{ new Date(c.at).toLocaleDateString('de-DE') }}</strong> {{ c.person ?? c.source }}: {{ c.summary }}
        </div>
      </v-card-text>
    </v-card>
  </div>
</template>

<style scoped>
.ingredient { border-left: 3px solid rgba(var(--v-theme-primary), 0.3); padding-left: 8px; }
</style>
