<script setup>
import { ref, computed } from 'vue'
import { useProductsStore, useCategoriesStore, useAppStore } from '@/stores'

const productsStore = useProductsStore()
const categoriesStore = useCategoriesStore()
const appStore = useAppStore()

const props = defineProps({
  modelValue: Boolean
})

const emit = defineEmits(['update:modelValue'])

const search = ref('')
const selectedProducts = ref([])
const showBulkEditDialog = ref(false)
const bulkEditData = ref({
  categoryId: null,
  unit: null,
  expirationDays: null
})

const categoryOptions = computed(() => {
  const options = []

  // Add "Keine Kategorie" as first option
  options.push({
    value: null,
    title: 'Keine Kategorie',
    subtitle: '-'
  })

  // Group categories by vendor
  for (const vendor of categoriesStore.vendors) {
    const vendorCategories = categoriesStore.getCategoriesForVendor(vendor.id)
    for (const cat of vendorCategories) {
      options.push({
        value: cat.id,
        title: cat.name,
        subtitle: vendor.name,
        vendorColor: vendor.color
      })
    }
  }

  return options
})

const headers = [
  { title: 'Name', key: 'name', sortable: true },
  { title: 'Kategorie', key: 'category', sortable: false },
  { title: 'Einheit', key: 'defaultUnit', sortable: true },
  { title: 'Haltbarkeit (Tage)', key: 'freshnessDays', sortable: true }
]

const units = [
  'Stück',
  'g',
  'kg',
  'ml',
  'l',
  'Packung',
  'Bund',
  'Dose',
  'Glas'
]

const filteredProducts = computed(() => {
  let products = productsStore.products

  if (search.value) {
    const searchLower = search.value.toLowerCase()
    products = products.filter(p =>
      p.name.toLowerCase().includes(searchLower) ||
      p.categoryName?.toLowerCase().includes(searchLower) ||
      p.vendorName?.toLowerCase().includes(searchLower)
    )
  }

  // Sort alphabetically by name
  return [...products].sort((a, b) => a.name.localeCompare(b.name))
})

const selectedCount = computed(() => selectedProducts.value.length)

function openBulkEdit() {
  if (selectedCount.value === 0) {
    appStore.showSnackbar('Bitte wählen Sie mindestens ein Produkt aus', 'warning')
    return
  }

  // Reset bulk edit data
  bulkEditData.value = {
    categoryId: null,
    unit: null,
    expirationDays: null
  }

  showBulkEditDialog.value = true
}

async function applyBulkEdit() {
  try {
    const updates = {}

    // Only include fields that have been set (using !== undefined to handle null values)
    if (bulkEditData.value.categoryId !== null && bulkEditData.value.categoryId !== '') {
      updates.categoryId = bulkEditData.value.categoryId
    }
    if (bulkEditData.value.unit !== null && bulkEditData.value.unit !== '') {
      updates.defaultUnit = bulkEditData.value.unit
    }
    if (bulkEditData.value.expirationDays !== null && bulkEditData.value.expirationDays !== '') {
      updates.freshnessDays = parseInt(bulkEditData.value.expirationDays)
    }

    if (Object.keys(updates).length === 0) {
      appStore.showSnackbar('Bitte wählen Sie mindestens eine Eigenschaft zum Ändern', 'warning')
      return
    }

    console.log('Applying bulk updates:', updates)
    console.log('To products:', selectedProducts.value)

    // Update each selected product individually
    const results = []
    for (const productId of selectedProducts.value) {
      try {
        const result = await productsStore.updateProduct(productId, updates)
        results.push({ productId, success: true, result })
      } catch (error) {
        console.error(`Failed to update product ${productId}:`, error)
        results.push({ productId, success: false, error })
      }
    }

    const successCount = results.filter(r => r.success).length
    const failCount = results.filter(r => !r.success).length

    console.log('Update results:', { successCount, failCount, results })

    if (failCount > 0) {
      appStore.showSnackbar(`${successCount} Produkte aktualisiert, ${failCount} Fehler`, 'warning')
    } else {
      appStore.showSnackbar(`${successCount} Produkte aktualisiert`)
    }

    showBulkEditDialog.value = false
    selectedProducts.value = []

    // Reload products
    await productsStore.fetchProducts()
  } catch (error) {
    console.error('Bulk update error:', error)
    appStore.showSnackbar('Fehler beim Aktualisieren der Produkte', 'error')
  }
}

function toggleSelection(productId) {
  const index = selectedProducts.value.indexOf(productId)
  if (index === -1) {
    selectedProducts.value.push(productId)
  } else {
    selectedProducts.value.splice(index, 1)
  }
}

function clearSelection() {
  selectedProducts.value = []
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
        <v-toolbar-title>Produkte bearbeiten</v-toolbar-title>
      </v-toolbar>

      <v-card-text class="pa-4 flex-grow-1 overflow-y-auto">
        <!-- Search -->
        <div class="mb-4">
          <v-text-field
            v-model="search"
            prepend-inner-icon="mdi-magnify"
            label="Produkte durchsuchen..."
            hide-details
            clearable
            style="max-width: 400px;"
          />
        </div>

        <!-- Data Table -->
        <v-data-table
          v-model="selectedProducts"
          :headers="headers"
          :items="filteredProducts"
          item-value="id"
          show-select
          :items-per-page="-1"
          class="elevation-1"
          select-strategy="all"
          @click:row="(_event, { item }) => toggleSelection(item.id)"
        >
          <template #item.category="{ item }">
            <div v-if="item.categoryName">
              <div class="text-body-2">{{ item.categoryName }}</div>
              <div class="text-caption text-medium-emphasis">{{ item.vendorName || '—' }}</div>
            </div>
            <span v-else class="text-medium-emphasis">—</span>
          </template>

          <template #item.defaultUnit="{ item }">
            {{ item.defaultUnit || '—' }}
          </template>

          <template #item.freshnessDays="{ item }">
            {{ item.freshnessDays ?? '—' }}
          </template>

          <template #bottom>
            <div class="text-center pa-4">
              <span class="text-medium-emphasis">
                {{ filteredProducts.length }} Produkte
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
      <v-card-title>{{ selectedCount }} Produkte bearbeiten</v-card-title>
      <v-card-text>
        <p class="text-medium-emphasis mb-4">
          Wählen Sie die Eigenschaften aus, die Sie für alle ausgewählten Produkte ändern möchten.
          Nicht ausgefüllte Felder bleiben unverändert.
        </p>

        <v-select
          v-model="bulkEditData.categoryId"
          :items="categoryOptions"
          item-title="title"
          item-value="value"
          label="Kategorie"
          clearable
          class="mb-3"
        >
          <template #item="{ item, props }">
            <v-list-item v-bind="props">
              <template #prepend>
                <v-avatar :color="item.raw.vendorColor || '#9CA3AF'" size="24" class="mr-2">
                  <v-icon icon="mdi-store" size="small" color="white" />
                </v-avatar>
              </template>
              <v-list-item-subtitle>{{ item.raw.subtitle }}</v-list-item-subtitle>
            </v-list-item>
          </template>
          <template #selection="{ item }">
            <v-chip :color="item.raw.vendorColor || '#9CA3AF'" size="small" label>
              {{ item.raw.title }} ({{ item.raw.subtitle }})
            </v-chip>
          </template>
        </v-select>

        <v-select
          v-model="bulkEditData.unit"
          :items="units"
          label="Einheit"
          clearable
          class="mb-3"
        />

        <v-text-field
          v-model.number="bulkEditData.expirationDays"
          label="Haltbarkeit (Tage)"
          type="number"
          inputmode="numeric"
          min="0"
          clearable
          hint="Anzahl der Tage, die das Produkt nach dem Kauf haltbar ist"
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
