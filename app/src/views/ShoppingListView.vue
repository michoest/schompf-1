<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useShoppingStore, useAppStore, useVendorsStore, useProductsStore } from '@/stores'
import api from '@/services/api'

const shoppingStore = useShoppingStore()
const appStore = useAppStore()
const vendorsStore = useVendorsStore()
const productsStore = useProductsStore()

const showSourceDialog = ref(false)
const selectedItem = ref(null)

const showAddItemDialog = ref(false)
const newItem = ref({ name: '', amount: null, unit: '', categoryId: null })
const userSelectedCategory = ref(false)
const addItemNameInput = ref(null)

const showEditItemDialog = ref(false)
const editItem = ref({ id: null, name: '', amount: 1, unit: 'Stück', categoryId: null })
const userSelectedEditCategory = ref(false)

const showClearConfirmDialog = ref(false)
const showDeleteConfirmDialog = ref(false)
const itemToDelete = ref(null)
const showActionsMenu = ref(false)

const showCompleted = ref(false)
const showFutureItems = ref(true)

// Track items that are being checked (to delay their disappearance)
const itemsBeingChecked = ref(new Set())

// Add this watch
watch(() => newItem.value.name, (name) => {
  // Don't auto-update if user explicitly selected a category
  if (userSelectedCategory.value) return

  if (!name || name.trim().length < 2) {
    newItem.value.categoryId = null
    return
  }

  // Find matching product (case-insensitive, exact match)
  const nameLower = name.toLowerCase().trim()
  const matchingProduct = productsStore.products.find(p =>
    p.name.toLowerCase() === nameLower
  )

  if (matchingProduct && matchingProduct.categoryId) {
    newItem.value.categoryId = matchingProduct.categoryId
  } else {
    // Clear category if no exact match (prevents prefix products from sticking)
    newItem.value.categoryId = null
  }
})

watch(showAddItemDialog, (open) => {
  if (open) {
    newItem.value = { name: '', amount: null, unit: '', categoryId: null }
    userSelectedCategory.value = false
    // Focus the input field after dialog opens with multiple attempts for mobile reliability
    setTimeout(() => {
      if (addItemNameInput.value) {
        const component = addItemNameInput.value
        const inputEl = component.$el?.querySelector('input')

        if (inputEl) {
          // Try multiple approaches to ensure focus works on mobile
          inputEl.focus()
          inputEl.click()

          // Additional attempt after a short delay
          setTimeout(() => {
            inputEl.focus()
          }, 100)
        }
      }
    }, 350)
  }
})

watch(showEditItemDialog, (open) => {
  if (!open) {
    editItem.value = { id: null, name: '', amount: 1, unit: 'Stück', categoryId: null, hasMealSources: false }
    userSelectedEditCategory.value = false
  }
})

// Helper to check if item has meal sources (new amounts format or old sources format)
function hasMealSources(item) {
  if (item.amounts) {
    return item.amounts.some(a => a.sourceType === 'meal')
  }
  // Fallback for old format
  return item.sources?.some(s => !s.manual)
}

// Helper to get all sources (amounts) for display
function getItemSources(item) {
  if (item.amounts) {
    return item.amounts
  }
  // Convert old format
  return (item.sources || []).map(s => ({
    ...s,
    sourceType: s.manual ? 'manual' : 'meal'
  }))
}

// Computed
const filteredItems = computed(() => {
  if (!shoppingStore.shoppingList?.items) return []

  return shoppingStore.shoppingList.items.filter(item => {
    // Hide soft-deleted items
    if (item.deleted) return false

    // Keep items that are being checked visible for animation
    if (itemsBeingChecked.value.has(item.id)) return true

    // Filter by completed status
    if (!showCompleted.value && item.checked) return false

    // Filter by future items (items with 'wait' status)
    if (!showFutureItems.value && item.freshnessStatus === 'wait') return false

    return true
  })
})

const itemsByVendor = computed(() => {
  const grouped = {}
  for (const item of filteredItems.value) {
    const vendor = item.vendorName || 'Sonstiges'
    if (!grouped[vendor]) {
      grouped[vendor] = {
        name: vendor,
        color: item.vendorColor || '#9CA3AF',
        categories: {}
      }
    }

    const category = item.categoryName || 'Sonstiges'
    if (!grouped[vendor].categories[category]) {
      grouped[vendor].categories[category] = []
    }
    grouped[vendor].categories[category].push(item)
  }

  // Convert categories object to sorted array
  return Object.values(grouped).map(vendor => ({
    ...vendor,
    categories: Object.entries(vendor.categories)
      .map(([name, items]) => ({ name, items }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }))
})

const checkedCount = computed(() => {
  if (!shoppingStore.shoppingList?.items) return 0
  return shoppingStore.shoppingList.items.filter(i => i.checked).length
})

const totalCount = computed(() => {
  if (!shoppingStore.shoppingList?.items) return 0
  return shoppingStore.shoppingList.items.filter(i => !i.deleted).length
})

// Items that should be counted (respects future items filter, but not checked filter)
const countableItems = computed(() => {
  if (!shoppingStore.shoppingList?.items) return []

  return shoppingStore.shoppingList.items.filter(item => {
    // Exclude soft-deleted items
    if (item.deleted) return false
    // Filter by future items (items with 'wait' status)
    if (!showFutureItems.value && item.freshnessStatus === 'wait') return false
    return true
  })
})

const visibleCheckedCount = computed(() => {
  return countableItems.value.filter(i => i.checked).length
})

const visibleTotalCount = computed(() => {
  return countableItems.value.length
})

const hasCheckedItems = computed(() => checkedCount.value > 0)

const categoryOptions = computed(() => {
  const options = []

  // Add "Sonstiges" as first option
  options.push({
    value: null,
    title: 'Sonstiges',
    subtitle: 'Manuell hinzugefügt'
  })

  // Group categories by vendor
  for (const vendor of vendorsStore.vendors) {
    const vendorCategories = vendorsStore.getCategoriesForVendor(vendor.id)
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

// Actions
async function toggleItem(item) {
  const wasChecked = item.checked

  // If checking an item and we're hiding completed items, add delay
  if (!wasChecked && !showCompleted.value) {
    // Add to the set to keep it visible
    itemsBeingChecked.value.add(item.id)

    // Toggle the item state
    await shoppingStore.toggleItem(item.id)

    // Wait 500ms for the animation to play
    setTimeout(() => {
      // Remove from the set so it can be filtered out
      itemsBeingChecked.value.delete(item.id)
    }, 500)
  } else {
    // For unchecking or when showing completed, just toggle immediately
    await shoppingStore.toggleItem(item.id)
  }
}

function removeChecked() {
  shoppingStore.removeCheckedItems()
  appStore.showSnackbar('Erledigte Artikel entfernt')
}

async function addManualItem() {
  if (!newItem.value.name.trim()) {
    appStore.showSnackbar('Name ist erforderlich', 'error')
    return
  }

  try {
    // Accept both comma and dot as decimal separator
    const amountStr = newItem.value.amount ? String(newItem.value.amount).replace(',', '.') : ''
    const amount = amountStr ? parseFloat(amountStr) : null
    const item = await api.addShoppingItem({
      productName: newItem.value.name.trim(),
      amount: amount,
      unit: newItem.value.unit || null,
      categoryId: newItem.value.categoryId
    })

    if (shoppingStore.shoppingList) {
      shoppingStore.shoppingList.items.push(item)
    }

    const productName = newItem.value.name.trim()
    showAddItemDialog.value = false
    newItem.value = { name: '', amount: null, unit: '', categoryId: null }
    userSelectedCategory.value = false
    appStore.showSnackbar(`${productName} hinzugefügt`)
  } catch (error) {
    appStore.showSnackbar('Fehler beim Hinzufügen', 'error')
  }
}

function showSources(item) {
  selectedItem.value = item
  showSourceDialog.value = true
}

function getFreshnessColor(status) {
  switch (status) {
    case 'today': return 'error'
    case 'wait': return 'warning'
    default: return 'success'
  }
}

function getFreshnessIcon(status) {
  switch (status) {
    case 'today': return 'mdi-clock-alert'
    case 'wait': return 'mdi-clock-outline'
    default: return 'mdi-check-circle'
  }
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const days = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
  return `${days[date.getDay()]}, ${date.getDate()}.${date.getMonth() + 1}.`
}

onMounted(() => {
  vendorsStore.fetchVendors()
  vendorsStore.fetchCategories()
  productsStore.fetchProducts()
  // Load the current shopping list from the database
  shoppingStore.loadCurrentList()
})

function onCategorySelect(categoryId) {
  newItem.value.categoryId = categoryId
  userSelectedCategory.value = true
}

function onEditCategorySelect(categoryId) {
  editItem.value.categoryId = categoryId
  userSelectedEditCategory.value = true
}

function openEditDialog(item) {
  // All items can now be edited (amount and category)
  editItem.value = {
    id: item.id,
    name: item.productName,
    amount: item.amount,
    unit: item.unit,
    categoryId: item.categoryId,
    hasMealSources: hasMealSources(item)
  }
  userSelectedEditCategory.value = false
  showEditItemDialog.value = true
}

async function saveEditedItem() {
  try {
    const productName = editItem.value.name
    // Accept both comma and dot as decimal separator
    const amountStr = editItem.value.amount !== null && editItem.value.amount !== '' && editItem.value.amount !== undefined
      ? String(editItem.value.amount).replace(',', '.')
      : ''
    const amount = amountStr ? parseFloat(amountStr) : null

    await api.updateShoppingItem(editItem.value.id, {
      amount: amount,
      unit: editItem.value.unit || null,
      categoryId: editItem.value.categoryId
    })

    // Reload the list to get updated item
    await shoppingStore.loadCurrentList()

    showEditItemDialog.value = false
    appStore.showSnackbar(`${productName} aktualisiert`)
  } catch (error) {
    appStore.showSnackbar('Fehler beim Aktualisieren', 'error')
  }
}

function confirmDeleteItem(item) {
  itemToDelete.value = item
  showDeleteConfirmDialog.value = true
}

async function deleteItem() {
  if (!itemToDelete.value) return

  try {
    const productName = itemToDelete.value.productName
    await api.deleteShoppingItem(itemToDelete.value.id)

    // Reload list to get updated state (handles both soft and hard delete)
    await shoppingStore.loadCurrentList()

    showDeleteConfirmDialog.value = false
    itemToDelete.value = null
    appStore.showSnackbar(`${productName} gelöscht`)
  } catch (error) {
    appStore.showSnackbar('Fehler beim Löschen', 'error')
  }
}

async function clearAllItems() {
  try {
    await api.clearShoppingList()

    // Clear local state
    if (shoppingStore.shoppingList) {
      shoppingStore.shoppingList.items = []
    }

    showClearConfirmDialog.value = false
    appStore.showSnackbar('Einkaufsliste geleert')
  } catch (error) {
    appStore.showSnackbar('Fehler beim Leeren der Liste', 'error')
  }
}
</script>

<template>
  <div class="shopping-list-view">
    <!-- Header -->
    <v-card v-if="shoppingStore.shoppingList" class="mb-4" variant="flat" color="surface">
      <v-card-text class="pa-3">
        <div class="d-flex align-center justify-space-between">
          <div>
            <div class="text-subtitle-2 text-medium-emphasis">Einkaufsliste</div>
            <div class="text-body-2">
              Zuletzt erstellt am {{ formatDate(shoppingStore.shoppingList.generatedAt.split('T')[0]) }}
            </div>
          </div>
          <v-menu v-model="showActionsMenu" location="bottom end">
            <template #activator="{ props }">
              <v-btn icon="mdi-dots-vertical" variant="text" size="small" v-bind="props" />
            </template>
            <v-list density="compact">
              <v-list-item @click="showClearConfirmDialog = true">
                <template #prepend>
                  <v-icon icon="mdi-delete-sweep" />
                </template>
                <v-list-item-title>Liste leeren</v-list-item-title>
              </v-list-item>
            </v-list>
          </v-menu>
        </div>
      </v-card-text>
    </v-card>

    <!-- Progress indicator -->
    <v-card v-if="visibleTotalCount > 0" class="mb-4" variant="flat" color="surface">
      <v-card-text class="pa-3">
        <div class="d-flex align-center justify-space-between mb-2">
          <span class="text-body-2">{{ visibleCheckedCount }} von {{ visibleTotalCount }} erledigt</span>
          <v-btn v-if="hasCheckedItems" variant="text" color="error" size="small" @click="removeChecked">
            Erledigte löschen
          </v-btn>
        </div>
        <v-progress-linear :model-value="(visibleCheckedCount / visibleTotalCount) * 100" color="primary" bg-color="surface-variant" height="8" rounded />
      </v-card-text>
    </v-card>

    <!-- Filter Toggles -->
    <v-card v-if="totalCount > 0" class="mb-4" variant="flat" color="surface">
      <v-card-text class="pa-3">
        <div class="d-flex gap-4">
          <v-switch
            v-model="showCompleted"
            color="primary"
            label="Erledigte anzeigen"
            hide-details
            density="compact"
          />
          <v-switch
            v-model="showFutureItems"
            color="primary"
            label="Zukünftige anzeigen"
            hide-details
            density="compact"
          />
        </div>
      </v-card-text>
    </v-card>

    <!-- Shopping list by vendor -->
    <div v-if="shoppingStore.shoppingList">
      <!-- Empty filtered list message -->
      <v-card v-if="itemsByVendor.length === 0 && totalCount > 0" variant="flat" color="surface" class="mb-4">
        <v-card-text class="text-center pa-8">
          <v-icon icon="mdi-filter-off-outline" size="64" color="warning" class="mb-4" />
          <div class="text-h6 mb-2">Keine Artikel zum Anzeigen</div>
          <div class="text-body-2 text-medium-emphasis">
            Alle Artikel sind für später vorgesehen. Deaktiviere den Filter, um sie zu sehen.
          </div>
        </v-card-text>
      </v-card>

      <!-- Empty shopping list message -->
      <v-card v-if="totalCount === 0" variant="flat" color="surface" class="mb-4">
        <v-card-text class="text-center pa-8">
          <v-icon icon="mdi-cart-outline" size="64" color="primary" class="mb-4" />
          <div class="text-h6 mb-2">Einkaufsliste ist leer</div>
          <div class="text-body-2 text-medium-emphasis">
            Füge Artikel manuell hinzu oder erstelle eine Liste aus deinen geplanten Mahlzeiten.
          </div>
        </v-card-text>
      </v-card>

      <div v-for="vendor in itemsByVendor" :key="vendor.name" class="mb-4">
        <!-- Vendor header -->
        <div class="vendor-header mb-2">
          <v-chip :color="vendor.color" variant="flat" size="small" label>
            <v-icon start icon="mdi-store" size="small" />
            {{ vendor.name }}
          </v-chip>
        </div>

        <!-- Items grouped by category -->
        <v-card variant="flat" color="surface">
          <v-list density="compact">
            <template v-for="(category, categoryIdx) in vendor.categories" :key="category.name">
              <!-- Category separator -->
              <v-list-subheader v-if="categoryIdx > 0 || vendor.categories.length > 1" class="category-separator">
                {{ category.name }}
              </v-list-subheader>

              <!-- Items in this category -->
              <v-list-item v-for="item in category.items" :key="item.id" :class="{ 'item-checked': item.checked }"
                @click="openEditDialog(item)">
                <template #prepend>
                  <v-checkbox-btn :model-value="item.checked" color="primary" @click.stop="toggleItem(item)" />
                </template>

                <v-list-item-title :class="{ 'text-decoration-line-through': item.checked }">
                  {{ item.productName }}
                </v-list-item-title>

                <v-list-item-subtitle>
                  {{ item.displayAmount }}
                </v-list-item-subtitle>

                <template #append>
                  <div class="d-flex align-center gap-1">
                    <!-- Freshness indicator - only show when item should not be bought yet -->
                    <v-tooltip v-if="item.freshnessStatus === 'wait'" location="top">
                      <template #activator="{ props }">
                        <v-icon v-bind="props" :icon="getFreshnessIcon(item.freshnessStatus)"
                          :color="getFreshnessColor(item.freshnessStatus)" size="small" />
                      </template>
                      <div>
                        <div>
                          Frühestens kaufen ab: {{ formatDate(item.earliestPurchaseDate) }}
                        </div>
                        <div class="text-caption">
                          Benötigt am {{ formatDate(item.earliestUseDate) }}
                        </div>
                      </div>
                    </v-tooltip>

                    <!-- Source info button - show if has any sources -->
                    <v-btn v-if="getItemSources(item).length > 0" icon="mdi-information-outline" variant="text" size="x-small"
                      @click.stop="showSources(item)" />

                    <!-- Edit button - all items can be edited -->
                    <v-btn icon="mdi-pencil" variant="text" size="x-small"
                      @click.stop="openEditDialog(item)" />

                    <!-- Delete button - all items can be deleted -->
                    <v-btn icon="mdi-delete" variant="text" size="x-small"
                      color="error" @click.stop="confirmDeleteItem(item)" />
                  </div>
                </template>
              </v-list-item>
            </template>
          </v-list>
        </v-card>
      </div>
    </div>

    <!-- Empty state -->
    <v-card v-else-if="!shoppingStore.loading" variant="flat" color="surface">
      <v-card-text class="text-center pa-8">
        <v-icon icon="mdi-cart-outline" size="64" color="primary" class="mb-4" />
        <div class="text-h6 mb-2">Keine Einkaufsliste</div>
        <div class="text-body-2 text-medium-emphasis">
          Erstelle eine Einkaufsliste im Planer, indem du Mahlzeiten hinzufügst und auf "Einkaufsliste erstellen" klickst.
        </div>
      </v-card-text>
    </v-card>

    <!-- Loading -->
    <v-card v-else variant="flat" color="surface">
      <v-card-text class="text-center pa-8">
        <v-progress-circular indeterminate color="primary" />
        <div class="mt-4">Lade Einkaufsliste...</div>
      </v-card-text>
    </v-card>

    <!-- FAB for adding manual items -->
    <v-btn v-if="!shoppingStore.loading" color="accent" icon="mdi-plus" size="large" position="fixed"
      location="bottom end" class="mb-16 mr-4" elevation="4" @click="showAddItemDialog = true" />

    <!-- Add item dialog -->
    <v-dialog v-model="showAddItemDialog" max-width="400">
      <v-card @keydown.esc="showAddItemDialog = false" @keydown.enter="addManualItem">
        <v-card-title>Artikel hinzufügen</v-card-title>
        <v-card-text>
          <v-text-field ref="addItemNameInput" v-model="newItem.name" label="Produkt" autofocus class="mb-3" />
          <v-row>
            <v-col cols="6">
              <v-text-field v-model="newItem.amount" label="Menge" type="text" inputmode="decimal" />
            </v-col>
            <v-col cols="6">
              <v-combobox v-model="newItem.unit" :items="['Stück', 'g', 'kg', 'ml', 'l', 'Packung', 'Bund', 'Paar']"
                label="Einheit" />
            </v-col>
          </v-row>
          <v-select v-model="newItem.categoryId" :items="categoryOptions" item-title="title" item-value="value"
            label="Kategorie" class="mt-3" @update:model-value="onCategorySelect">
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
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showAddItemDialog = false">Abbrechen</v-btn>
          <v-btn color="primary" @click="addManualItem">Hinzufügen</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Source dialog -->
    <v-dialog v-model="showSourceDialog" max-width="400">
      <v-card v-if="selectedItem">
        <v-card-title>{{ selectedItem.productName }}</v-card-title>
        <v-card-subtitle>{{ selectedItem.displayAmount }}</v-card-subtitle>
        <v-card-text>
          <div class="text-subtitle-2 mb-2">Mengen:</div>
          <v-list density="compact">
            <v-list-item v-for="(source, idx) in getItemSources(selectedItem)" :key="idx">
              <template #prepend>
                <v-icon
                  :icon="source.sourceType === 'meal' ? 'mdi-silverware-fork-knife' : 'mdi-pencil'"
                  size="small"
                  class="mr-2"
                />
              </template>
              <v-list-item-title v-if="source.dishName">
                {{ source.dishName }}
                <span v-if="source.sourceDishId && source.sourceDishId !== source.dishId" class="text-medium-emphasis">
                  ({{ source.sourceDishName }})
                </span>
              </v-list-item-title>
              <v-list-item-title v-else-if="source.sourceType === 'manual'">
                {{ source.isAdjustment ? 'Anpassung' : 'Manuell hinzugefügt' }}
              </v-list-item-title>
              <v-list-item-subtitle>
                <span v-if="source.mealDate">
                  {{ formatDate(source.mealDate) }} · {{ source.mealSlot }} ·
                </span>
                <span v-if="source.amount !== null && source.amount !== undefined && source.amount !== 0">
                  {{ source.amount > 0 ? '+' : '' }}{{ source.amount }} {{ source.unit }}
                </span>
              </v-list-item-subtitle>
            </v-list-item>
          </v-list>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showSourceDialog = false">Schließen</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Edit item dialog -->
    <v-dialog v-model="showEditItemDialog" max-width="400">
      <v-card @keydown.esc="showEditItemDialog = false" @keydown.enter="saveEditedItem">
        <v-card-title>Artikel bearbeiten</v-card-title>
        <v-card-text>
          <!-- Name is shown but not editable (locked) -->
          <v-text-field
            v-model="editItem.name"
            label="Produkt"
            readonly
            disabled
            class="mb-3"
          />
          <v-row>
            <v-col cols="6">
              <v-text-field v-model="editItem.amount" label="Menge" type="text" inputmode="decimal" autofocus />
            </v-col>
            <v-col cols="6">
              <v-combobox v-model="editItem.unit" :items="['Stück', 'g', 'kg', 'ml', 'l', 'Packung', 'Bund', 'Paar']"
                label="Einheit" />
            </v-col>
          </v-row>
          <v-select v-model="editItem.categoryId" :items="categoryOptions" item-title="title" item-value="value"
            label="Kategorie" class="mt-3" @update:model-value="onEditCategorySelect">
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
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showEditItemDialog = false">Abbrechen</v-btn>
          <v-btn color="primary" @click="saveEditedItem">Speichern</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Delete confirmation dialog -->
    <v-dialog v-model="showDeleteConfirmDialog" max-width="400">
      <v-card>
        <v-card-title>Artikel löschen?</v-card-title>
        <v-card-text>
          Möchtest du "{{ itemToDelete?.productName }}" wirklich löschen?
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showDeleteConfirmDialog = false">Abbrechen</v-btn>
          <v-btn color="error" @click="deleteItem">Löschen</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Clear list confirmation dialog -->
    <v-dialog v-model="showClearConfirmDialog" max-width="400">
      <v-card>
        <v-card-title>Liste leeren?</v-card-title>
        <v-card-text>
          Möchtest du wirklich alle Artikel aus der Einkaufsliste löschen?
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showClearConfirmDialog = false">Abbrechen</v-btn>
          <v-btn color="error" @click="clearAllItems">Liste leeren</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.vendor-header {
  display: flex;
  align-items: center;
}

.item-checked {
  opacity: 0.6;
}

.category-separator {
  font-size: 0.875rem;
  font-weight: 500;
  color: rgb(var(--v-theme-primary));
  margin-top: 8px;
}
</style>
