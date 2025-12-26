<script setup>
import { ref, computed } from 'vue'
import { useDishesStore, useAppStore } from '@/stores'

const dishesStore = useDishesStore()
const appStore = useAppStore()

const props = defineProps({
  modelValue: Boolean
})

const emit = defineEmits(['update:modelValue'])

const search = ref('')
const selectedDishes = ref([])
const showBulkEditDialog = ref(false)
const bulkEditData = ref({
  categories: [],
  published: null
})

const availableCategories = [
  'Dels',
  'Reis',
  'Leisch',
  'Getarisch',
  'Toffels',
  'Rühtück',
  'Suppe',
  'Lat',
  'Holschompf'
]

const headers = [
  { title: 'Name', key: 'name', sortable: true },
  { title: 'Kategorien', key: 'categories', sortable: false },
  { title: 'Portionen', key: 'defaultServings', sortable: true }
]

const filteredDishes = computed(() => {
  let dishes = dishesStore.dishes.filter(d => d.type !== 'eating_out')

  if (search.value) {
    const searchLower = search.value.toLowerCase()
    dishes = dishes.filter(d =>
      d.name.toLowerCase().includes(searchLower) ||
      d.categories?.some(c => c.toLowerCase().includes(searchLower))
    )
  }

  // Sort alphabetically by name
  return [...dishes].sort((a, b) => a.name.localeCompare(b.name))
})

const selectedCount = computed(() => selectedDishes.value.length)

function openBulkEdit() {
  if (selectedCount.value === 0) {
    appStore.showSnackbar('Bitte wählen Sie mindestens ein Gericht aus', 'warning')
    return
  }

  // Reset bulk edit data
  bulkEditData.value = {
    categories: [],
    published: null
  }

  showBulkEditDialog.value = true
}

async function applyBulkEdit() {
  try {
    const updates = {}

    // Only include fields that have been set
    if (bulkEditData.value.categories && bulkEditData.value.categories.length > 0) {
      updates.categories = bulkEditData.value.categories
    }

    if (bulkEditData.value.published !== null) {
      updates.published = bulkEditData.value.published
    }

    if (Object.keys(updates).length === 0) {
      appStore.showSnackbar('Bitte wählen Sie mindestens ein Feld zum Aktualisieren', 'warning')
      return
    }

    console.log('Applying bulk updates:', updates)
    console.log('To dishes:', selectedDishes.value)

    // Update each selected dish individually
    const results = []
    for (const dishId of selectedDishes.value) {
      try {
        const result = await dishesStore.updateDish(dishId, updates)
        results.push({ dishId, success: true, result })
      } catch (error) {
        console.error(`Failed to update dish ${dishId}:`, error)
        results.push({ dishId, success: false, error })
      }
    }

    const successCount = results.filter(r => r.success).length
    const failCount = results.filter(r => !r.success).length

    console.log('Update results:', { successCount, failCount, results })

    if (failCount > 0) {
      appStore.showSnackbar(`${successCount} Gerichte aktualisiert, ${failCount} Fehler`, 'warning')
    } else {
      appStore.showSnackbar(`${successCount} Gerichte aktualisiert`)
    }

    showBulkEditDialog.value = false
    selectedDishes.value = []

    // Reload dishes
    await dishesStore.fetchDishes()
  } catch (error) {
    console.error('Bulk update error:', error)
    appStore.showSnackbar('Fehler beim Aktualisieren der Gerichte', 'error')
  }
}

function toggleSelection(dishId) {
  const index = selectedDishes.value.indexOf(dishId)
  if (index === -1) {
    selectedDishes.value.push(dishId)
  } else {
    selectedDishes.value.splice(index, 1)
  }
}

function clearSelection() {
  selectedDishes.value = []
}

function close() {
  emit('update:modelValue', false)
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    fullscreen
    transition="dialog-bottom-transition"
  >
    <v-card class="d-flex flex-column" style="height: 100vh;">
      <v-toolbar color="primary">
        <v-btn icon="mdi-close" @click="close" />
        <v-toolbar-title>Gerichte bearbeiten</v-toolbar-title>
      </v-toolbar>

      <v-card-text class="pa-4 flex-grow-1 overflow-y-auto">
        <!-- Search -->
        <div class="mb-4">
          <v-text-field
            v-model="search"
            prepend-inner-icon="mdi-magnify"
            label="Gerichte durchsuchen..."
            hide-details
            clearable
            style="max-width: 400px;"
          />
        </div>

        <!-- Data Table -->
        <v-data-table
          v-model="selectedDishes"
          :headers="headers"
          :items="filteredDishes"
          item-value="id"
          show-select
          :items-per-page="-1"
          class="elevation-1"
          select-strategy="all"
          @click:row="(_event, { item }) => toggleSelection(item.id)"
        >
          <template #item.categories="{ item }">
            <div v-if="item.categories && item.categories.length > 0" class="d-flex flex-wrap gap-1">
              <v-chip
                v-for="cat in item.categories"
                :key="cat"
                size="x-small"
                variant="tonal"
                color="primary"
              >
                {{ cat }}
              </v-chip>
            </div>
            <span v-else class="text-medium-emphasis">—</span>
          </template>

          <template #item.defaultServings="{ item }">
            {{ item.defaultServings || '—' }}
          </template>

          <template #bottom>
            <div class="text-center pa-4">
              <span class="text-medium-emphasis">
                {{ filteredDishes.length }} Gerichte
              </span>
            </div>
          </template>
        </v-data-table>
      </v-card-text>

      <!-- Floating Bottom Action Bar -->
      <div v-if="selectedCount > 0" class="floating-action-bar-container">
        <v-card class="floating-action-bar" elevation="8">
          <div class="d-flex align-center justify-space-between pa-3">
            <div class="d-flex align-center gap-2">
              <v-chip color="primary" variant="flat" size="small">
                {{ selectedCount }}
              </v-chip>
              <span class="text-body-2">ausgewählt</span>
              <v-btn
                variant="text"
                size="small"
                @click="clearSelection"
              >
                Auswahl aufheben
              </v-btn>
            </div>
            <v-btn
              color="primary"
              size="small"
              @click="openBulkEdit"
            >
              <v-icon start icon="mdi-pencil" />
              Bearbeiten
            </v-btn>
          </div>
        </v-card>
      </div>
    </v-card>
  </v-dialog>

  <!-- Bulk Edit Dialog -->
  <v-dialog v-model="showBulkEditDialog" max-width="500">
    <v-card>
      <v-card-title>{{ selectedCount }} Gerichte bearbeiten</v-card-title>
      <v-card-text>
        <p class="text-medium-emphasis mb-4">
          Wählen Sie die Felder aus, die für alle ausgewählten Gerichte aktualisiert werden sollen.
        </p>

        <v-select
          v-model="bulkEditData.categories"
          :items="availableCategories"
          label="Kategorien"
          multiple
          chips
          closable-chips
          hint="Die ausgewählten Kategorien ersetzen die bestehenden Kategorien"
          persistent-hint
          class="mb-4"
        />

        <v-select
          v-model="bulkEditData.published"
          :items="[
            { title: 'Nicht ändern', value: null },
            { title: 'Im Planer anzeigen', value: true },
            { title: 'Aus Planer ausblenden', value: false }
          ]"
          label="Sichtbarkeit im Planer"
          hint="Legt fest, ob die Gerichte im Planer zur Auswahl stehen"
          persistent-hint
        />
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="showBulkEditDialog = false">
          Abbrechen
        </v-btn>
        <v-btn color="primary" @click="applyBulkEdit">
          Änderungen übernehmen
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.v-data-table {
  background: rgb(var(--v-theme-surface));
}

.floating-action-bar-container {
  position: sticky;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 12px 16px 16px;
  pointer-events: none;
  z-index: 10;
}

.floating-action-bar {
  pointer-events: all;
  border-radius: 12px !important;
  background: rgb(var(--v-theme-surface));
}
</style>
