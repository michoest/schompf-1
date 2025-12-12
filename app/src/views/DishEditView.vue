<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDishesStore, useProductsStore, useAppStore } from '@/stores'

const route = useRoute()
const router = useRouter()
const dishesStore = useDishesStore()
const productsStore = useProductsStore()
const appStore = useAppStore()

const dish = ref(null)
const loading = ref(true)
const saving = ref(false)

// Form fields
const name = ref('')
const recipeUrl = ref('')
const defaultServings = ref(2)
const ingredients = ref([])

// New ingredient form
const showIngredientDialog = ref(false)
const editingIngredient = ref(null)
const ingredientForm = ref({
  productName: '',
  amount: 1,
  unit: '',
  optional: false
})

const commonUnits = ['g', 'kg', 'ml', 'l', 'Stück', 'EL', 'TL', 'Bund', 'Packung', 'Dose']

// Computed
const hasChanges = computed(() => {
  if (!dish.value) return false
  return (
    name.value !== dish.value.name ||
    recipeUrl.value !== (dish.value.recipeUrl || '') ||
    defaultServings.value !== dish.value.defaultServings ||
    JSON.stringify(ingredients.value) !== JSON.stringify(dish.value.ingredients)
  )
})

const isNew = computed(() => route.params.id === 'neu')

// Load dish
async function loadDish() {
  loading.value = true
  try {
    if (isNew.value) {
      dish.value = {
        name: '',
        recipeUrl: '',
        defaultServings: 2,
        ingredients: [],
        type: 'dish'
      }
    } else {
      dish.value = await dishesStore.fetchDish(route.params.id)
    }
    
    // Populate form
    name.value = dish.value.name
    recipeUrl.value = dish.value.recipeUrl || ''
    defaultServings.value = dish.value.defaultServings
    ingredients.value = [...(dish.value.ingredients || [])]
  } catch (error) {
    appStore.showSnackbar('Fehler beim Laden', 'error')
    router.push('/gerichte')
  } finally {
    loading.value = false
  }
}

// Save dish
async function saveDish() {
  if (!name.value.trim()) {
    appStore.showSnackbar('Name ist erforderlich', 'error')
    return
  }
  
  saving.value = true
  try {
    const data = {
      name: name.value.trim(),
      recipeUrl: recipeUrl.value || null,
      defaultServings: defaultServings.value,
      ingredients: ingredients.value
    }
    
    if (isNew.value) {
      const newDish = await dishesStore.createDish(data)
      appStore.showSnackbar('Gericht erstellt')
      router.replace(`/gerichte/${newDish.id}`)
    } else {
      await dishesStore.updateDish(dish.value.id, data)
      appStore.showSnackbar('Änderungen gespeichert')
      await loadDish()
    }
  } catch (error) {
    appStore.showSnackbar('Fehler beim Speichern', 'error')
  } finally {
    saving.value = false
  }
}

// Ingredient management
function openIngredientDialog(ingredient = null) {
  if (ingredient) {
    editingIngredient.value = ingredient
    ingredientForm.value = { ...ingredient }
  } else {
    editingIngredient.value = null
    ingredientForm.value = {
      productName: '',
      amount: 1,
      unit: '',
      optional: false
    }
  }
  showIngredientDialog.value = true
}

function saveIngredient() {
  if (!ingredientForm.value.productName.trim()) {
    appStore.showSnackbar('Name ist erforderlich', 'error')
    return
  }
  
  const ingredient = {
    id: editingIngredient.value?.id || crypto.randomUUID(),
    productName: ingredientForm.value.productName.trim(),
    amount: parseFloat(ingredientForm.value.amount) || 0,
    unit: ingredientForm.value.unit,
    optional: ingredientForm.value.optional,
    productId: null // Would be set when linking to product DB
  }
  
  if (editingIngredient.value) {
    const idx = ingredients.value.findIndex(i => i.id === editingIngredient.value.id)
    if (idx !== -1) {
      ingredients.value[idx] = ingredient
    }
  } else {
    ingredients.value.push(ingredient)
  }
  
  showIngredientDialog.value = false
}

function deleteIngredient(ingredient) {
  ingredients.value = ingredients.value.filter(i => i.id !== ingredient.id)
}

function goBack() {
  if (hasChanges.value) {
    if (!confirm('Änderungen verwerfen?')) return
  }
  router.push('/gerichte')
}

onMounted(() => {
  loadDish()
  productsStore.fetchProducts()
})

// Watch for route changes
watch(() => route.params.id, loadDish)
</script>

<template>
  <div class="dish-edit-view">
    <!-- Header -->
    <div class="d-flex align-center mb-4">
      <v-btn
        icon="mdi-arrow-left"
        variant="text"
        @click="goBack"
      />
      <h1 class="text-h5 font-weight-bold ml-2">
        {{ isNew ? 'Neues Gericht' : name || 'Gericht bearbeiten' }}
      </h1>
      <v-spacer />
      <v-btn
        color="primary"
        :loading="saving"
        :disabled="!hasChanges && !isNew"
        @click="saveDish"
      >
        <v-icon start icon="mdi-content-save" />
        Speichern
      </v-btn>
    </div>

    <v-card v-if="!loading" variant="flat" color="surface">
      <v-card-text>
        <!-- Basic info -->
        <div class="text-subtitle-1 font-weight-medium mb-3">Grunddaten</div>
        
        <v-row>
          <v-col cols="12" md="6">
            <v-text-field
              v-model="name"
              label="Name"
              required
            />
          </v-col>
          <v-col cols="12" md="6">
            <v-text-field
              v-model="recipeUrl"
              label="Rezept-Link"
              type="url"
              prepend-inner-icon="mdi-link"
            />
          </v-col>
          <v-col cols="12" md="4">
            <v-text-field
              v-model.number="defaultServings"
              label="Standard-Portionen"
              type="number"
              min="1"
              max="20"
            />
          </v-col>
        </v-row>

        <v-divider class="my-6" />

        <!-- Ingredients -->
        <div class="d-flex align-center justify-space-between mb-3">
          <div class="text-subtitle-1 font-weight-medium">
            Zutaten ({{ ingredients.length }})
          </div>
          <v-btn
            variant="tonal"
            color="primary"
            size="small"
            @click="openIngredientDialog()"
          >
            <v-icon start icon="mdi-plus" />
            Zutat hinzufügen
          </v-btn>
        </div>

        <v-list v-if="ingredients.length > 0" density="compact">
          <v-list-item
            v-for="ing in ingredients"
            :key="ing.id"
            :title="ing.productName"
            :subtitle="`${ing.amount} ${ing.unit}${ing.optional ? ' (optional)' : ''}`"
          >
            <template #prepend>
              <v-icon icon="mdi-circle-small" />
            </template>
            
            <template #append>
              <v-btn
                icon="mdi-pencil"
                variant="text"
                size="small"
                @click="openIngredientDialog(ing)"
              />
              <v-btn
                icon="mdi-delete"
                variant="text"
                size="small"
                color="error"
                @click="deleteIngredient(ing)"
              />
            </template>
          </v-list-item>
        </v-list>

        <v-alert
          v-else
          type="info"
          variant="tonal"
          class="mt-2"
        >
          Noch keine Zutaten hinzugefügt
        </v-alert>
      </v-card-text>
    </v-card>

    <!-- Loading state -->
    <v-card v-else variant="flat" color="surface">
      <v-card-text class="text-center pa-8">
        <v-progress-circular indeterminate color="primary" />
      </v-card-text>
    </v-card>

    <!-- Ingredient dialog -->
    <v-dialog v-model="showIngredientDialog" max-width="400">
      <v-card>
        <v-card-title>
          {{ editingIngredient ? 'Zutat bearbeiten' : 'Zutat hinzufügen' }}
        </v-card-title>
        <v-card-text>
          <v-text-field
            v-model="ingredientForm.productName"
            label="Name"
            autofocus
            class="mb-3"
          />
          
          <v-row>
            <v-col cols="6">
              <v-text-field
                v-model.number="ingredientForm.amount"
                label="Menge"
                type="number"
                min="0"
                step="0.1"
              />
            </v-col>
            <v-col cols="6">
              <v-combobox
                v-model="ingredientForm.unit"
                :items="commonUnits"
                label="Einheit"
              />
            </v-col>
          </v-row>
          
          <v-checkbox
            v-model="ingredientForm.optional"
            label="Optional"
            hide-details
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showIngredientDialog = false">
            Abbrechen
          </v-btn>
          <v-btn color="primary" @click="saveIngredient">
            {{ editingIngredient ? 'Speichern' : 'Hinzufügen' }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
</style>
