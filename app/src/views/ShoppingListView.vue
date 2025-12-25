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

const showEditItemDialog = ref(false)
const editItem = ref({ id: null, name: '', amount: 1, unit: 'Stück', categoryId: null })
const userSelectedEditCategory = ref(false)

const showClearConfirmDialog = ref(false)
const showDeleteConfirmDialog = ref(false)
const itemToDelete = ref(null)
const showActionsMenu = ref(false)

const showChangeCategoryDialog = ref(false)
const itemToChangeCategory = ref(null)
const newCategoryId = ref(null)

const showCompleted = ref(false)
const showFutureItems = ref(true)

// Add this watch
watch(() => newItem.value.name, (name) => {
  // Don't auto-update if user explicitly selected a category
  if (userSelectedCategory.value) return

  if (!name || name.trim().length < 2) {
    newItem.value.categoryId = null
    return
  }

  // Find matching product (case-insensitive)
  const nameLower = name.toLowerCase().trim()
  const matchingProduct = productsStore.products.find(p =>
    p.name.toLowerCase() === nameLower
  )

  if (matchingProduct && matchingProduct.categoryId) {
    newItem.value.categoryId = matchingProduct.categoryId
  }
})

watch(showAddItemDialog, (open) => {
  if (open) {
    newItem.value = { name: '', amount: null, unit: '', categoryId: null }
    userSelectedCategory.value = false
  }
})

watch(() => editItem.value.name, (name) => {
  // Don't auto-update if user explicitly selected a category
  if (userSelectedEditCategory.value) return

  if (!name || name.trim().length < 2) {
    return
  }

  // Find matching product (case-insensitive)
  const nameLower = name.toLowerCase().trim()
  const matchingProduct = productsStore.products.find(p =>
    p.name.toLowerCase() === nameLower
  )

  if (matchingProduct && matchingProduct.categoryId) {
    editItem.value.categoryId = matchingProduct.categoryId
  }
})

watch(showEditItemDialog, (open) => {
  if (!open) {
    editItem.value = { id: null, name: '', amount: 1, unit: 'Stück', categoryId: null }
    userSelectedEditCategory.value = false
  }
})

// Computed
const filteredItems = computed(() => {
  if (!shoppingStore.shoppingList?.items) return []

  return shoppingStore.shoppingList.items.filter(item => {
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
  return shoppingStore.shoppingList?.items?.filter(i => i.checked).length || 0
})

const totalCount = computed(() => {
  return shoppingStore.shoppingList?.items?.length || 0
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
function toggleItem(item) {
  shoppingStore.toggleItem(item.id)
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
    const amount = newItem.value.amount ? parseFloat(newItem.value.amount) : null
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
  // Only allow editing manually added items
  if (!item.sources?.some(s => s.manual)) {
    appStore.showSnackbar('Nur manuell hinzugefügte Artikel können bearbeitet werden', 'warning')
    return
  }

  editItem.value = {
    id: item.id,
    name: item.productName,
    amount: item.amount,
    unit: item.unit,
    categoryId: item.categoryId
  }
  userSelectedEditCategory.value = false
  showEditItemDialog.value = true
}

async function saveEditedItem() {
  if (!editItem.value.name.trim()) {
    appStore.showSnackbar('Name ist erforderlich', 'error')
    return
  }

  try {
    const productName = editItem.value.name.trim()
    await api.updateShoppingItem(editItem.value.id, {
      productName: productName,
      amount: parseFloat(editItem.value.amount) || 1,
      unit: editItem.value.unit,
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

function openChangeCategoryDialog(item) {
  itemToChangeCategory.value = item
  newCategoryId.value = item.categoryId
  showChangeCategoryDialog.value = true
}

async function changeItemCategory() {
  if (!itemToChangeCategory.value) return

  try {
    const productName = itemToChangeCategory.value.productName
    await api.updateShoppingItem(itemToChangeCategory.value.id, {
      categoryId: newCategoryId.value
    })

    // Reload the list to get updated item with new category/vendor info
    await shoppingStore.loadCurrentList()

    showChangeCategoryDialog.value = false
    itemToChangeCategory.value = null
    newCategoryId.value = null
    appStore.showSnackbar(`${productName} verschoben`)
  } catch (error) {
    appStore.showSnackbar('Fehler beim Verschieben', 'error')
  }
}

async function deleteItem() {
  if (!itemToDelete.value) return

  try {
    const productName = itemToDelete.value.productName
    await api.deleteShoppingItem(itemToDelete.value.id)

    // Remove from local state
    if (shoppingStore.shoppingList?.items) {
      const index = shoppingStore.shoppingList.items.findIndex(i => i.id === itemToDelete.value.id)
      if (index !== -1) {
        shoppingStore.shoppingList.items.splice(index, 1)
      }
    }

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
    <v-card v-if="totalCount > 0" class="mb-4" variant="flat" color="surface">
      <v-card-text class="pa-3">
        <div class="d-flex align-center justify-space-between mb-2">
          <span class="text-body-2">{{ checkedCount }} von {{ totalCount }} erledigt</span>
          <v-btn v-if="hasCheckedItems" variant="text" color="error" size="small" @click="removeChecked">
            Erledigte löschen
          </v-btn>
        </div>
        <v-progress-linear :model-value="(checkedCount / totalCount) * 100" color="primary" height="8" rounded />
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
                @click="toggleItem(item)">
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

                    <!-- Source info button -->
                    <v-btn v-if="item.sources?.length" icon="mdi-information-outline" variant="text" size="x-small"
                      @click.stop="showSources(item)" />

                    <!-- Change category button (only for manually added items) -->
                    <v-btn v-if="item.sources?.some(s => s.manual)" icon="mdi-folder-move" variant="text" size="x-small"
                      @click.stop="openChangeCategoryDialog(item)" />

                    <!-- Edit button (only for manually added items) -->
                    <v-btn v-if="item.sources?.some(s => s.manual)" icon="mdi-pencil" variant="text" size="x-small"
                      @click.stop="openEditDialog(item)" />

                    <!-- Delete button (only for manually added items) -->
                    <v-btn v-if="item.sources?.some(s => s.manual)" icon="mdi-delete" variant="text" size="x-small"
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
      <v-card>
        <v-card-title>Artikel hinzufügen</v-card-title>
        <v-card-text>
          <v-text-field v-model="newItem.name" label="Produkt" autofocus class="mb-3" @keyup.enter="addManualItem" />
          <v-row>
            <v-col cols="6">
              <v-text-field v-model.number="newItem.amount" label="Menge" type="number" inputmode="decimal" min="0" step="0.1" />
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
          <div class="text-subtitle-2 mb-2">Verwendet für:</div>
          <v-list density="compact">
            <v-list-item v-for="(source, idx) in selectedItem.sources" :key="idx">
              <v-list-item-title v-if="source.dishName">
                {{ source.dishName }}
              </v-list-item-title>
              <v-list-item-title v-else-if="source.manual">
                Manuell hinzugefügt
              </v-list-item-title>
              <v-list-item-subtitle v-if="source.mealDate">
                {{ formatDate(source.mealDate) }} · {{ source.mealSlot }}
                <span v-if="source.amount && source.amount !== 0">
                  · {{ source.amount }} {{ source.unit }}
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
      <v-card>
        <v-card-title>Artikel bearbeiten</v-card-title>
        <v-card-text>
          <v-text-field v-model="editItem.name" label="Produkt" autofocus class="mb-3" @keyup.enter="saveEditedItem" />
          <v-row>
            <v-col cols="6">
              <v-text-field v-model.number="editItem.amount" label="Menge" type="number" inputmode="decimal" min="0" step="0.1" />
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

    <!-- Change category dialog -->
    <v-dialog v-model="showChangeCategoryDialog" max-width="400">
      <v-card>
        <v-card-title>Kategorie ändern</v-card-title>
        <v-card-text>
          <p class="text-medium-emphasis mb-4">
            Verschiebe "{{ itemToChangeCategory?.productName }}" in eine andere Kategorie
          </p>
          <v-select v-model="newCategoryId" :items="categoryOptions" item-title="title" item-value="value"
            label="Neue Kategorie">
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
          <v-btn variant="text" @click="showChangeCategoryDialog = false">Abbrechen</v-btn>
          <v-btn color="primary" @click="changeItemCategory">Verschieben</v-btn>
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
