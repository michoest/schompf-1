<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  modelValue: Boolean,
  dishes: {
    type: Array,
    default: () => []
  },
  initialDish: {
    type: Object,
    default: null
  },
  initialServings: {
    type: Number,
    default: null
  },
  showCancel: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue', 'select', 'cancel'])

const search = ref('')
const selectedType = ref('all')
const selectedDish = ref(null)
const servings = ref(2)
const showEatingOutDialog = ref(false)
const eatingOutDescription = ref('')

const dishCategories = computed(() => {
  // Get unique categories from all dishes
  const categoriesSet = new Set()
  props.dishes.forEach(dish => {
    if (dish.categories && Array.isArray(dish.categories)) {
      dish.categories.forEach(cat => categoriesSet.add(cat))
    }
  })

  // Convert to sorted array with "Alle" first
  const categories = Array.from(categoriesSet).sort()
  return [
    { value: 'all', title: 'Alle' },
    ...categories.map(cat => ({ value: cat, title: cat }))
  ]
})

const filteredDishes = computed(() => {
  let result = props.dishes

  if (selectedType.value !== 'all') {
    result = result.filter(d => d.categories && d.categories.includes(selectedType.value))
  }

  if (search.value) {
    const searchLower = search.value.toLowerCase()
    result = result.filter(d => d.name.toLowerCase().includes(searchLower))
  }

  // Sort alphabetically by name
  return [...result].sort((a, b) => a.name.localeCompare(b.name))
})

// New functions:
function chooseDish(dish) {
  // For "eating out", show description dialog
  if (dish.type === 'eating_out') {
    showEatingOutDialog.value = true
    eatingOutDescription.value = 'Holschompf'
    return
  }

  selectedDish.value = dish
  servings.value = dish?.defaultServings || 2
}

function confirmEatingOut() {
  emit('select', {
    dish: {
      id: null,
      type: 'eating_out',
      name: eatingOutDescription.value
    },
    servings: 0
  })
  showEatingOutDialog.value = false
  eatingOutDescription.value = ''
  emit('update:modelValue', false)
}

function confirmSelection() {
  emit('select', { dish: selectedDish.value, servings: servings.value })
  emit('update:modelValue', false)
}

function goBack() {
  selectedDish.value = null
}

function close() {
  emit('update:modelValue', false)
}

function cancelSelection() {
  emit('cancel')
  emit('update:modelValue', false)
}

// Reset search when dialog opens
watch(() => props.modelValue, (val) => {
  if (val) {
    search.value = ''
    selectedType.value = 'all'
    selectedDish.value = props.initialDish
    servings.value = props.initialServings || 2
    showEatingOutDialog.value = false
    eatingOutDescription.value = ''
  }
})
</script>

<template>
  <v-dialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" max-width="500"
    scrollable>
    <v-card>
      <v-card-title class="d-flex align-center pa-4 pb-2">
        <span>Gericht wählen</span>
        <v-spacer />
        <v-btn icon="mdi-close" variant="text" size="small" @click="close" />
      </v-card-title>

      <v-card-text class="pa-4 pt-0">
        <!-- Step 1: Choose dish -->
        <template v-if="!selectedDish">
          <!-- Search -->
          <v-text-field v-model="search" prepend-inner-icon="mdi-magnify" label="Suchen..." clearable hide-details
            class="mb-3" />

          <!-- Quick actions -->
          <div class="d-flex gap-2 mb-3">
            <v-chip variant="outlined" color="accent"
              @click="chooseDish({ id: 'eating_out', type: 'eating_out', name: 'Auswärts essen' })">
              <v-icon start icon="mdi-food-takeout-box" />
              Auswärts
            </v-chip>
          </div>

          <!-- Category filter -->
          <v-chip-group v-model="selectedType" selected-class="bg-primary text-white" mandatory class="mb-3">
            <v-chip v-for="category in dishCategories" :key="category.value" :value="category.value" variant="outlined" size="small">
              {{ category.title }}
            </v-chip>
          </v-chip-group>

          <!-- Dish list -->
          <v-list density="compact" class="dish-list">
            <v-list-item v-for="dish in filteredDishes" :key="dish.id" :title="dish.name"
              :subtitle="dish.categories && dish.categories.length > 0 ? dish.categories.join(', ') : 'Keine Kategorie'" @click="chooseDish(dish)">
              <template #prepend>
                <v-icon :icon="dish.type === 'eating_out' ? 'mdi-food-takeout-box' : 'mdi-food'"
                  :color="dish.type === 'eating_out' ? 'accent' : 'primary'" />
              </template>
              <template #append>
                <v-icon icon="mdi-chevron-right" size="small" />
              </template>
            </v-list-item>

            <v-list-item v-if="filteredDishes.length === 0">
              <v-list-item-title class="text-medium-emphasis text-center">
                Keine Gerichte gefunden
              </v-list-item-title>
            </v-list-item>
          </v-list>
        </template>

        <!-- Step 2: Confirm servings -->
        <template v-else>
          <div class="text-center py-4">
            <v-icon :icon="selectedDish.type === 'eating_out' ? 'mdi-food-takeout-box' : 'mdi-food'" size="48"
              color="primary" class="mb-3" />
            <div class="text-h6 mb-1">{{ selectedDish.name }}</div>
            <div class="text-body-2 text-medium-emphasis mb-4">
              Standard: {{ selectedDish.defaultServings }} Portionen
            </div>

            <v-text-field v-model.number="servings" label="Portionen" type="number" inputmode="decimal" min="1" max="20"
              style="min-width: 200px; max-width: 200px; margin: 0 auto;" hide-details class="mb-4 centered-input" autofocus>
              <template #prepend>
                <v-btn icon="mdi-minus" size="small" variant="text" :disabled="servings <= 1" @click="servings--" />
              </template>
              <template #append>
                <v-btn icon="mdi-plus" size="small" variant="text" :disabled="servings >= 20" @click="servings++" />
              </template>
            </v-text-field>

            <div class="d-flex justify-center gap-2">
              <v-btn v-if="!showCancel" variant="text" @click="goBack">
                <v-icon start icon="mdi-arrow-left" />
                Zurück
              </v-btn>
              <v-btn v-if="showCancel" variant="text" @click="cancelSelection">
                <v-icon start icon="mdi-close" />
                Abbrechen
              </v-btn>
              <v-btn color="primary" @click="confirmSelection">
                <v-icon start icon="mdi-check" />
                Hinzufügen
              </v-btn>
            </div>
          </div>
        </template>
      </v-card-text>
    </v-card>
  </v-dialog>

  <!-- Eating Out Description Dialog -->
  <v-dialog v-model="showEatingOutDialog" max-width="400">
    <v-card>
      <v-card-title>Auswärts essen</v-card-title>
      <v-card-text>
        <v-text-field
          v-model="eatingOutDescription"
          label="Beschreibung"
          autofocus
          @keyup.enter="confirmEatingOut"
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="showEatingOutDialog = false">Abbrechen</v-btn>
        <v-btn color="primary" @click="confirmEatingOut">Hinzufügen</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.dish-list {
  max-height: 300px;
  overflow-y: auto;
}

.centered-input :deep(input[type="number"]) {
  text-align: center;
}
</style>
