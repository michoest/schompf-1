<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useProductsStore, useVendorsStore, useDishesStore, useAppStore } from '@/stores'
import ProductBulkEditor from '@/components/ProductBulkEditor.vue'
import DishBulkEditor from '@/components/DishBulkEditor.vue'

const productsStore = useProductsStore()
const vendorsStore = useVendorsStore()
const dishesStore = useDishesStore()
const appStore = useAppStore()

const search = ref('')
const activeTab = ref('vendors')
const windowWidth = ref(window.innerWidth)
const showBulkEditor = ref(false)
const showDishBulkEditor = ref(false)

const isMobile = computed(() => windowWidth.value < 960)
const canShowBulkEditor = computed(() => windowWidth.value >= 640)

function onResize() {
  windowWidth.value = window.innerWidth
}

// Vendor form
const showVendorDialog = ref(false)
const editingVendor = ref(null)
const vendorForm = ref({
  name: '',
  color: '#10B981'
})

// Category form
const showCategoryDialog = ref(false)
const editingCategory = ref(null)
const categoryForm = ref({
  name: '',
  vendorId: null
})

// Product form
const showProductDialog = ref(false)
const editingProduct = ref(null)
const productForm = ref({
  name: '',
  categoryId: null,
  defaultUnit: '',
  freshnessDays: 7
})

// Dish form
const showDishDialog = ref(false)
const editingDish = ref(null)
const dishForm = ref({
  name: '',
  recipe: '',
  recipeUrl: '',
  defaultServings: 2,
  categories: [],
  ingredients: [],
  published: false
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

// Ingredient form
const showIngredientDialog = ref(false)
const editingIngredient = ref(null)
const ingredientForm = ref({
  productId: null,
  productName: '',
  amount: 1,
  unit: '',
  optional: false
})

// JSON import
const showJsonImportDialog = ref(false)
const jsonInput = ref('')
const jsonError = ref('')

// Ingredient search
const ingredientSearch = ref('')

const commonUnits = ['g', 'kg', 'ml', 'l', 'Stück', 'EL', 'TL', 'Bund', 'Packung', 'Dose', 'Paar']
const vendorColors = [
  '#10B981', '#0EA5E9', '#8B5CF6', '#F97316',
  '#EF4444', '#EC4899', '#14B8A6', '#6366F1'
]

// Computed
const sortedVendors = computed(() => {
  // Sort alphabetically by name
  return [...vendorsStore.vendors].sort((a, b) => a.name.localeCompare(b.name))
})

const filteredProducts = computed(() => {
  let products = productsStore.products

  if (search.value && activeTab.value === 'products') {
    const searchLower = search.value.toLowerCase()
    products = products.filter(p =>
      p.name.toLowerCase().includes(searchLower)
    )
  }

  // Sort alphabetically by name
  return [...products].sort((a, b) => a.name.localeCompare(b.name))
})

const filteredDishes = computed(() => {
  let dishes = dishesStore.dishes

  if (search.value && activeTab.value === 'dishes') {
    const searchLower = search.value.toLowerCase()
    dishes = dishes.filter(d =>
      d.name.toLowerCase().includes(searchLower)
    )
  }

  // Sort alphabetically by name
  return [...dishes].sort((a, b) => a.name.localeCompare(b.name))
})

const categoriesWithVendor = computed(() => {
  return vendorsStore.categories.map(cat => {
    const vendor = vendorsStore.vendors.find(v => v.id === cat.vendorId)
    return {
      ...cat,
      vendorName: vendor?.name || 'Unbekannt',
      vendorColor: vendor?.color || '#9CA3AF',
      displayName: `${cat.name} (${vendor?.name || 'Unbekannt'})`
    }
  }).sort((a, b) => {
    // Sort alphabetically by category name
    return a.name.localeCompare(b.name)
  })
})

// Vendors with their categories, sorted
const vendorsWithCategories = computed(() => {
  // Sort vendors alphabetically
  const sorted = [...vendorsStore.vendors].sort((a, b) => a.name.localeCompare(b.name))

  return sorted.map(vendor => {
    // Get categories for this vendor, sorted by order
    const categories = vendorsStore.getCategoriesForVendor(vendor.id)
      .sort((a, b) => (a.order || 0) - (b.order || 0))

    return {
      ...vendor,
      categories
    }
  })
})

// Ingredient search results
const ingredientSearchResults = computed(() => {
  if (!ingredientSearch.value || ingredientSearch.value.length < 2) {
    return []
  }

  const searchLower = ingredientSearch.value.toLowerCase()
  const results = []

  for (const dish of dishesStore.dishes) {
    if (dish.type === 'eating_out') continue

    if (dish.ingredients && Array.isArray(dish.ingredients)) {
      for (const ing of dish.ingredients) {
        const productName = ing.productName || ''
        if (productName.toLowerCase().includes(searchLower)) {
          results.push({
            dishId: dish.id,
            dishName: dish.name,
            ingredientName: ing.productName,
            ingredientAmount: ing.amount,
            ingredientUnit: ing.unit,
            ingredientOptional: ing.optional || false
          })
        }
      }
    }
  }

  return results
})

const dishesUsingIngredient = computed(() => {
  const uniqueDishes = new Set()
  ingredientSearchResults.value.forEach(r => uniqueDishes.add(r.dishId))
  return Array.from(uniqueDishes)
})

const groupedIngredients = computed(() => {
  const groups = new Map()

  for (const result of ingredientSearchResults.value) {
    const key = result.ingredientName
    if (!groups.has(key)) {
      groups.set(key, {
        ingredientName: key,
        dishes: []
      })
    }

    groups.get(key).dishes.push({
      id: result.dishId,
      name: result.dishName,
      ingredientAmount: result.ingredientAmount,
      ingredientUnit: result.ingredientUnit,
      ingredientOptional: result.ingredientOptional
    })
  }

  return Array.from(groups.values()).sort((a, b) =>
    a.ingredientName.localeCompare(b.ingredientName)
  )
})

const productsWithCategory = computed(() => {
  return filteredProducts.value.map(product => {
    const category = vendorsStore.categories.find(c => c.id === product.categoryId)
    const vendor = category ? vendorsStore.vendors.find(v => v.id === category.vendorId) : null

    return {
      ...product,
      categoryName: category?.name || null,
      vendorName: vendor?.name || null,
      vendorColor: vendor?.color || '#9CA3AF'
    }
  })
})

const productOptions = computed(() => {
  return productsStore.products.map(p => {
    const category = vendorsStore.categories.find(c => c.id === p.categoryId)
    const vendor = category ? vendorsStore.vendors.find(v => v.id === category.vendorId) : null
    return {
      value: p.id,
      title: p.name,
      subtitle: vendor && category ? `${vendor.name}: ${category.name}` : 'Keine Kategorie',
      product: p
    }
  })
})

// Auto-suggest unit based on selected product
watch(() => ingredientForm.value.productId, (productId) => {
  if (!productId) return

  const product = productsStore.products.find(p => p.id === productId)
  if (product) {
    ingredientForm.value.productName = product.name
    if (product.defaultUnit && !ingredientForm.value.unit) {
      ingredientForm.value.unit = product.defaultUnit
    }
  }
})

// Auto-suggest product when typing name
watch(() => ingredientForm.value.productName, (name) => {
  if (!name || ingredientForm.value.productId) return

  const nameLower = name.toLowerCase().trim()
  const matchingProduct = productsStore.products.find(p =>
    p.name.toLowerCase() === nameLower
  )

  if (matchingProduct) {
    ingredientForm.value.productId = matchingProduct.id
  }
})

// Vendor actions
function openVendorDialog(vendor = null) {
  if (vendor) {
    editingVendor.value = vendor
    vendorForm.value = { ...vendor }
  } else {
    editingVendor.value = null
    vendorForm.value = { name: '', color: '#10B981' }
  }
  showVendorDialog.value = true
}

async function saveVendor() {
  if (!vendorForm.value.name.trim()) {
    appStore.showSnackbar('Name ist erforderlich', 'error')
    return
  }

  try {
    if (editingVendor.value) {
      await vendorsStore.updateVendor(editingVendor.value.id, vendorForm.value)
      appStore.showSnackbar('Händler aktualisiert')
    } else {
      await vendorsStore.createVendor(vendorForm.value)
      appStore.showSnackbar('Händler erstellt')
    }
    showVendorDialog.value = false
  } catch (error) {
    appStore.showSnackbar('Fehler beim Speichern', 'error')
  }
}

async function deleteVendor(vendor) {
  if (!confirm(`"${vendor.name}" wirklich löschen?`)) return

  try {
    await vendorsStore.deleteVendor(vendor.id)
    appStore.showSnackbar('Händler gelöscht')
  } catch (error) {
    appStore.showSnackbar('Fehler beim Löschen', 'error')
  }
}

// Category actions
function openCategoryDialog(category = null) {
  if (category) {
    editingCategory.value = category
    categoryForm.value = { ...category }
  } else {
    editingCategory.value = null
    categoryForm.value = { name: '', vendorId: null }
  }
  showCategoryDialog.value = true
}

async function saveCategory() {
  if (!categoryForm.value.name.trim() || !categoryForm.value.vendorId) {
    appStore.showSnackbar('Name und Händler sind erforderlich', 'error')
    return
  }

  try {
    if (editingCategory.value) {
      await vendorsStore.updateCategory(editingCategory.value.id, categoryForm.value)
      appStore.showSnackbar('Kategorie aktualisiert')
    } else {
      await vendorsStore.createCategory(categoryForm.value)
      appStore.showSnackbar('Kategorie erstellt')
    }
    showCategoryDialog.value = false
  } catch (error) {
    appStore.showSnackbar('Fehler beim Speichern', 'error')
  }
}

async function deleteCategory(category) {
  if (!confirm(`"${category.name}" wirklich löschen?`)) return

  try {
    await vendorsStore.deleteCategory(category.id)
    appStore.showSnackbar('Kategorie gelöscht')
  } catch (error) {
    appStore.showSnackbar('Fehler beim Löschen', 'error')
  }
}

async function moveCategoryUp(category, vendorId) {
  const categories = vendorsStore.getCategoriesForVendor(vendorId)
    .sort((a, b) => (a.order || 0) - (b.order || 0))

  const currentIndex = categories.findIndex(c => c.id === category.id)
  if (currentIndex <= 0) return // Already at top

  const prevCategory = categories[currentIndex - 1]

  try {
    // Swap orders
    await vendorsStore.updateCategory(category.id, { order: prevCategory.order })
    await vendorsStore.updateCategory(prevCategory.id, { order: category.order })
    // Refetch to ensure UI is updated
    await vendorsStore.fetchCategories()
    appStore.showSnackbar('Reihenfolge aktualisiert')
  } catch (error) {
    appStore.showSnackbar('Fehler beim Verschieben', 'error')
  }
}

async function moveCategoryDown(category, vendorId) {
  const categories = vendorsStore.getCategoriesForVendor(vendorId)
    .sort((a, b) => (a.order || 0) - (b.order || 0))

  const currentIndex = categories.findIndex(c => c.id === category.id)
  if (currentIndex >= categories.length - 1) return // Already at bottom

  const nextCategory = categories[currentIndex + 1]

  try {
    // Swap orders
    await vendorsStore.updateCategory(category.id, { order: nextCategory.order })
    await vendorsStore.updateCategory(nextCategory.id, { order: category.order })
    // Refetch to ensure UI is updated
    await vendorsStore.fetchCategories()
    appStore.showSnackbar('Reihenfolge aktualisiert')
  } catch (error) {
    appStore.showSnackbar('Fehler beim Verschieben', 'error')
  }
}

// Product actions
function openProductDialog(product = null) {
  if (product) {
    editingProduct.value = product
    productForm.value = { ...product }
  } else {
    editingProduct.value = null
    productForm.value = {
      name: '',
      categoryId: null,
      defaultUnit: '',
      freshnessDays: 7
    }
  }
  showProductDialog.value = true
}

async function saveProduct() {
  if (!productForm.value.name.trim()) {
    appStore.showSnackbar('Name ist erforderlich', 'error')
    return
  }

  try {
    if (editingProduct.value) {
      await productsStore.updateProduct(editingProduct.value.id, productForm.value)
      appStore.showSnackbar('Produkt aktualisiert')
    } else {
      await productsStore.createProduct(productForm.value)
      appStore.showSnackbar('Produkt erstellt')
    }
    showProductDialog.value = false
  } catch (error) {
    appStore.showSnackbar('Fehler beim Speichern', 'error')
  }
}

async function deleteProduct(product) {
  if (!confirm(`"${product.name}" wirklich löschen?`)) return

  try {
    await productsStore.deleteProduct(product.id)
    appStore.showSnackbar('Produkt gelöscht')
  } catch (error) {
    appStore.showSnackbar('Fehler beim Löschen', 'error')
  }
}

// Dish actions
function openDishDialog(dish = null) {
  if (dish) {
    editingDish.value = dish
    dishForm.value = {
      name: dish.name,
      recipe: dish.recipe || '',
      recipeUrl: dish.recipeUrl || '',
      defaultServings: dish.defaultServings,
      categories: [...(dish.categories || [])],
      ingredients: [...(dish.ingredients || [])],
      published: dish.published ?? true
    }
  } else {
    editingDish.value = null
    dishForm.value = {
      name: '',
      recipe: '',
      recipeUrl: '',
      defaultServings: 2,
      categories: [],
      ingredients: [],
      published: false
    }
  }
  showDishDialog.value = true
}

async function saveDish() {
  if (!dishForm.value.name.trim()) {
    appStore.showSnackbar('Name ist erforderlich', 'error')
    return
  }

  try {
    const data = {
      name: dishForm.value.name.trim(),
      recipe: dishForm.value.recipe || null,
      recipeUrl: dishForm.value.recipeUrl || null,
      defaultServings: dishForm.value.defaultServings,
      categories: dishForm.value.categories,
      ingredients: dishForm.value.ingredients,
      published: dishForm.value.published,
      type: 'dish'
    }

    if (editingDish.value) {
      await dishesStore.updateDish(editingDish.value.id, data)
      appStore.showSnackbar('Gericht aktualisiert')
    } else {
      await dishesStore.createDish(data)
      appStore.showSnackbar('Gericht erstellt')
    }
    showDishDialog.value = false
    await dishesStore.fetchDishes()
  } catch (error) {
    appStore.showSnackbar('Fehler beim Speichern', 'error')
  }
}

async function deleteDish(dish) {
  if (!confirm(`"${dish.name}" wirklich löschen?`)) return

  try {
    await dishesStore.deleteDish(dish.id)
    appStore.showSnackbar('Gericht gelöscht')
  } catch (error) {
    appStore.showSnackbar('Fehler beim Löschen', 'error')
  }
}

// Ingredient actions
function openIngredientDialog(ingredient = null) {
  if (ingredient) {
    editingIngredient.value = ingredient
    ingredientForm.value = { ...ingredient }
  } else {
    editingIngredient.value = null
    ingredientForm.value = {
      productId: null,
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

  // Handle undefined amounts: both amount and unit can be null
  let amount = parseFloat(ingredientForm.value.amount)
  let unit = ingredientForm.value.unit

  // If amount is empty/null/0 and unit is empty, treat as undefined amount
  if ((!amount || amount === 0) && !unit) {
    amount = null
    unit = null
  }

  const ingredient = {
    id: editingIngredient.value?.id || crypto.randomUUID(),
    productId: ingredientForm.value.productId || null,
    productName: ingredientForm.value.productName.trim(),
    amount: amount,
    unit: unit,
    optional: ingredientForm.value.optional
  }

  if (editingIngredient.value) {
    const idx = dishForm.value.ingredients.findIndex(i => i.id === editingIngredient.value.id)
    if (idx !== -1) {
      dishForm.value.ingredients[idx] = ingredient
    }
  } else {
    dishForm.value.ingredients.push(ingredient)
  }

  showIngredientDialog.value = false
}

function deleteIngredient(ingredient) {
  dishForm.value.ingredients = dishForm.value.ingredients.filter(i => i.id !== ingredient.id)
}

// JSON import
function openJsonImport() {
  jsonInput.value = ''
  jsonError.value = ''
  showJsonImportDialog.value = true
}

async function importFromJson() {
  jsonError.value = ''

  try {
    const data = JSON.parse(jsonInput.value)

    // Validate required fields
    if (!data.name || typeof data.name !== 'string') {
      jsonError.value = 'Fehler: "name" ist erforderlich und muss ein String sein'
      return
    }

    if (!Array.isArray(data.ingredients)) {
      jsonError.value = 'Fehler: "ingredients" muss ein Array sein'
      return
    }

    // Validate ingredients
    for (let i = 0; i < data.ingredients.length; i++) {
      const ing = data.ingredients[i]
      if (!ing.productName || typeof ing.productName !== 'string') {
        jsonError.value = `Fehler in Zutat ${i + 1}: "productName" ist erforderlich`
        return
      }
      // Allow null for both amount and unit (undefined amount)
      if (ing.amount !== null && ing.amount !== undefined && typeof ing.amount !== 'number') {
        jsonError.value = `Fehler in Zutat ${i + 1}: "amount" muss eine Zahl oder null sein`
        return
      }
    }

    // Create the dish
    const dishData = {
      name: data.name,
      recipeUrl: data.recipeUrl || null,
      defaultServings: data.defaultServings || 2,
      categories: data.categories || [],
      ingredients: data.ingredients.map(ing => {
        // Handle undefined amounts: if both amount and unit are null, keep as null
        let amount = ing.amount ?? null
        let unit = ing.unit ?? null

        // If both are null or empty, treat as undefined amount
        if ((amount === null || amount === 0) && (unit === null || unit === '')) {
          amount = null
          unit = null
        }

        return {
          id: crypto.randomUUID(),
          productId: null, // Will be linked if product exists
          productName: ing.productName,
          amount: amount,
          unit: unit,
          optional: ing.optional || false
        }
      }),
      type: 'dish'
    }

    await dishesStore.createDish(dishData)
    appStore.showSnackbar('Gericht aus JSON erstellt')
    showJsonImportDialog.value = false
    await dishesStore.fetchDishes()
  } catch (error) {
    if (error instanceof SyntaxError) {
      jsonError.value = `JSON Syntax-Fehler: ${error.message}`
    } else {
      jsonError.value = `Fehler: ${error.message}`
    }
  }
}

onMounted(() => {
  window.addEventListener('resize', onResize)
  productsStore.fetchProducts()
  vendorsStore.fetchVendors()
  vendorsStore.fetchCategories()
  dishesStore.fetchDishes()
})

onUnmounted(() => {
  window.removeEventListener('resize', onResize)
})
</script>

<template>
  <div class="verwaltung-view">
    <h1 class="text-h5 font-weight-bold mb-4">Verwaltung</h1>

    <!-- Tabs -->
    <v-tabs v-model="activeTab" color="primary" class="mb-4">
      <v-tab value="vendors">Kategorien</v-tab>
      <v-tab value="products">Produkte</v-tab>
      <v-tab value="dishes">Gerichte</v-tab>
      <v-tab value="ingredients">Zutaten</v-tab>
    </v-tabs>

    <v-window v-model="activeTab">
      <!-- Vendors & Categories Tab -->
      <v-window-item value="vendors">
        <div class="d-flex justify-end mb-4 gap-2">
          <v-btn variant="tonal" color="primary" @click="openCategoryDialog()">
            <v-icon start icon="mdi-plus" />
            Neue Kategorie
          </v-btn>
          <v-btn color="primary" @click="openVendorDialog()">
            <v-icon start icon="mdi-plus" />
            Neuer Händler
          </v-btn>
        </div>

        <v-card variant="flat" color="surface">
          <div v-if="vendorsWithCategories.length > 0">
            <!-- Loop through vendors -->
            <div v-for="(vendor, vendorIdx) in vendorsWithCategories" :key="vendor.id">
              <!-- Vendor Header -->
              <div class="vendor-header">
                <div class="d-flex align-center gap-2">
                  <v-avatar :color="vendor.color" size="24">
                    <v-icon icon="mdi-store" size="small" color="white" />
                  </v-avatar>
                  <span class="text-subtitle-1 font-weight-medium">{{ vendor.name }}</span>
                </div>
                <div class="d-flex align-center gap-1">
                  <v-btn icon="mdi-pencil" variant="text" size="x-small" @click="openVendorDialog(vendor)" />
                  <v-btn icon="mdi-delete" variant="text" size="x-small" color="error" @click="deleteVendor(vendor)" />
                </div>
              </div>

              <!-- Categories for this vendor -->
              <v-list v-if="vendor.categories.length > 0" density="compact" class="mb-4">
                <v-list-item
                  v-for="(category, catIdx) in vendor.categories"
                  :key="category.id"
                  @click="openCategoryDialog(category)"
                  class="category-item"
                >
                  <template #prepend>
                    <v-icon icon="mdi-tag" size="small" color="primary" class="ml-4" />
                  </template>

                  <v-list-item-title>{{ category.name }}</v-list-item-title>

                  <template #append>
                    <div class="d-flex align-center gap-1">
                      <v-btn
                        icon="mdi-arrow-up"
                        variant="text"
                        size="x-small"
                        :disabled="catIdx === 0"
                        @click.stop="moveCategoryUp(category, vendor.id)"
                      />
                      <v-btn
                        icon="mdi-arrow-down"
                        variant="text"
                        size="x-small"
                        :disabled="catIdx === vendor.categories.length - 1"
                        @click.stop="moveCategoryDown(category, vendor.id)"
                      />
                      <v-btn icon="mdi-delete" variant="text" size="x-small" color="error" @click.stop="deleteCategory(category)" />
                    </div>
                  </template>
                </v-list-item>
              </v-list>

              <!-- Empty state for vendor with no categories -->
              <div v-else class="text-center pa-4 mb-4">
                <span class="text-caption text-medium-emphasis">Keine Kategorien</span>
              </div>

              <!-- Divider between vendors -->
              <v-divider v-if="vendorIdx < vendorsWithCategories.length - 1" class="my-2" />
            </div>
          </div>

          <v-card-text v-else class="text-center pa-8">
            <div class="text-medium-emphasis">Keine Händler vorhanden</div>
          </v-card-text>
        </v-card>
      </v-window-item>

      <!-- Products Tab -->
      <v-window-item value="products">
        <div class="d-flex align-center justify-space-between mb-4 flex-wrap gap-2">
          <v-text-field v-model="search" prepend-inner-icon="mdi-magnify" label="Produkte suchen..." clearable
            hide-details style="max-width: 300px" />

          <div class="d-flex gap-2">
            <v-btn
              v-if="canShowBulkEditor"
              variant="tonal"
              color="primary"
              @click="showBulkEditor = true"
            >
              <v-icon start icon="mdi-table-edit" />
              Massenbearbeitung
            </v-btn>
            <v-btn color="primary" @click="openProductDialog()">
              <v-icon start icon="mdi-plus" />
              Neues Produkt
            </v-btn>
          </div>
        </div>

        <v-card variant="flat" color="surface">
          <v-list v-if="productsWithCategory.length > 0" density="compact">
            <v-list-item v-for="product in productsWithCategory" :key="product.id" @click="openProductDialog(product)">
              <template #default>
                <div class="d-flex flex-wrap align-center ga-2 mb-1">
                  <span class="text-body-1">{{ product.name }}</span>
                  <v-chip v-if="product.categoryName" :color="product.vendorColor" size="x-small" label>
                    {{ product.vendorName }}: {{ product.categoryName }}
                  </v-chip>
                </div>
                <div class="text-caption text-medium-emphasis">
                  {{ product.defaultUnit || 'Keine Einheit' }} · {{ product.freshnessDays }} Tage haltbar
                </div>
              </template>

              <template #append>
                <v-btn icon="mdi-delete" variant="text" size="small" color="error"
                  @click.stop="deleteProduct(product)" />
              </template>
            </v-list-item>
          </v-list>

          <v-card-text v-else class="text-center pa-8">
            <div class="text-medium-emphasis">Keine Produkte gefunden</div>
          </v-card-text>
        </v-card>
      </v-window-item>

      <!-- Dishes Tab -->
      <v-window-item value="dishes">
        <div class="d-flex align-center justify-space-between mb-4 flex-wrap gap-2">
          <v-text-field v-model="search" prepend-inner-icon="mdi-magnify" label="Gerichte suchen..." clearable
            hide-details style="max-width: 300px" />

          <div class="d-flex gap-2">
            <v-btn
              v-if="canShowBulkEditor"
              variant="tonal"
              color="primary"
              @click="showDishBulkEditor = true"
            >
              <v-icon start icon="mdi-table-edit" />
              Massenbearbeitung
            </v-btn>
            <v-btn variant="tonal" color="primary" @click="openJsonImport()">
              <v-icon start icon="mdi-code-json" />
              JSON Import
            </v-btn>
            <v-btn color="primary" @click="openDishDialog()">
              <v-icon start icon="mdi-plus" />
              Neues Gericht
            </v-btn>
          </div>
        </div>

        <v-card variant="flat" color="surface">
          <v-list v-if="filteredDishes.length > 0">
            <v-list-item v-for="dish in filteredDishes" :key="dish.id" @click="openDishDialog(dish)">
              <template #prepend>
                <v-avatar color="primary" variant="tonal">
                  <v-icon :icon="dish.type === 'eating_out' ? 'mdi-food-takeout-box' : 'mdi-food'" />
                </v-avatar>
              </template>

              <template #default>
                <div class="d-flex flex-wrap align-center ga-2 mb-1">
                  <span class="text-body-1">{{ dish.name }}</span>
                  <v-chip v-for="cat in dish.categories" :key="cat" size="x-small" variant="tonal" color="primary">
                    {{ cat }}
                  </v-chip>
                </div>
                <div class="text-caption text-medium-emphasis">
                  {{ dish.defaultServings }} Portionen · {{ dish.ingredients?.length || 0 }} Zutaten
                </div>
              </template>

              <template #append>
                <v-icon v-if="dish.recipe" icon="mdi-book-open-variant" size="small" class="mr-2 text-medium-emphasis" />
                <v-btn v-if="dish.recipeUrl" icon="mdi-open-in-new" variant="text" size="small" :href="dish.recipeUrl"
                  target="_blank" @click.stop />
                <v-btn icon="mdi-delete" variant="text" size="small" color="error" @click.stop="deleteDish(dish)" />
              </template>
            </v-list-item>
          </v-list>

          <v-card-text v-else class="text-center pa-8">
            <div class="text-medium-emphasis">Keine Gerichte gefunden</div>
          </v-card-text>
        </v-card>
      </v-window-item>

      <!-- Ingredients Tab -->
      <v-window-item value="ingredients">
        <div class="mb-4">
          <v-text-field
            v-model="ingredientSearch"
            prepend-inner-icon="mdi-magnify"
            label="Zutat suchen..."
            clearable
            hide-details
            style="max-width: 400px;"
          />
        </div>

        <v-card v-if="ingredientSearchResults.length > 0" variant="flat" color="surface">
          <v-card-text>
            <div class="text-subtitle-2 mb-3">
              {{ ingredientSearchResults.length }} Zutat(en) gefunden in {{ dishesUsingIngredient.length }} Gericht(en)
            </div>

            <!-- Group by ingredient name -->
            <div v-for="(group, idx) in groupedIngredients" :key="idx" class="mb-6">
              <div class="text-subtitle-1 font-weight-bold mb-2">
                {{ group.ingredientName }}
              </div>
              <v-list density="compact">
                <v-list-item
                  v-for="dish in group.dishes"
                  :key="dish.id"
                  @click="openDishDialog(dishesStore.dishes.find(d => d.id === dish.id))"
                >
                  <template #prepend>
                    <v-icon icon="mdi-food" color="primary" />
                  </template>
                  <v-list-item-title>{{ dish.name }}</v-list-item-title>
                  <v-list-item-subtitle>
                    <span v-if="dish.ingredientAmount !== null && dish.ingredientAmount !== 0">
                      {{ dish.ingredientAmount }} {{ dish.ingredientUnit }}
                    </span>
                    <span v-if="dish.ingredientOptional" class="text-medium-emphasis"> (optional)</span>
                  </v-list-item-subtitle>
                </v-list-item>
              </v-list>
            </div>
          </v-card-text>
        </v-card>

        <v-card v-else-if="ingredientSearch" variant="flat" color="surface">
          <v-card-text class="text-center pa-8">
            <div class="text-medium-emphasis">
              Keine Gerichte mit dieser Zutat gefunden
            </div>
          </v-card-text>
        </v-card>

        <v-card v-else variant="flat" color="surface">
          <v-card-text class="text-center pa-8">
            <v-icon icon="mdi-information-outline" size="48" class="mb-3 text-medium-emphasis" />
            <div class="text-medium-emphasis">
              Geben Sie eine Zutat ein, um alle Gerichte zu finden, die diese Zutat verwenden
            </div>
          </v-card-text>
        </v-card>
      </v-window-item>
    </v-window>

    <!-- Vendor Dialog -->
    <v-dialog v-model="showVendorDialog" max-width="400">
      <v-card>
        <v-card-title>
          {{ editingVendor ? 'Händler bearbeiten' : 'Neuer Händler' }}
        </v-card-title>
        <v-card-text>
          <v-text-field v-model="vendorForm.name" label="Name" autofocus class="mb-3" />
          <div class="text-subtitle-2 mb-2">Farbe</div>
          <div class="d-flex flex-wrap gap-2">
            <v-btn v-for="color in vendorColors" :key="color" :color="color"
              :variant="vendorForm.color === color ? 'flat' : 'outlined'" icon size="small"
              @click="vendorForm.color = color">
              <v-icon v-if="vendorForm.color === color" icon="mdi-check" color="white" />
            </v-btn>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showVendorDialog = false">Abbrechen</v-btn>
          <v-btn color="primary" @click="saveVendor">Speichern</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Category Dialog -->
    <v-dialog v-model="showCategoryDialog" max-width="400">
      <v-card>
        <v-card-title>
          {{ editingCategory ? 'Kategorie bearbeiten' : 'Neue Kategorie' }}
        </v-card-title>
        <v-card-text>
          <v-text-field v-model="categoryForm.name" label="Name" autofocus class="mb-3" />
          <v-select v-model="categoryForm.vendorId" :items="sortedVendors" item-title="name" item-value="id"
            label="Händler" />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showCategoryDialog = false">Abbrechen</v-btn>
          <v-btn color="primary" @click="saveCategory">Speichern</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Product Dialog -->
    <v-dialog v-model="showProductDialog" max-width="500">
      <v-card>
        <v-card-title>
          {{ editingProduct ? 'Produkt bearbeiten' : 'Neues Produkt' }}
        </v-card-title>
        <v-card-text>
          <v-text-field v-model="productForm.name" label="Name" autofocus class="mb-3" />
          <v-select v-model="productForm.categoryId" :items="categoriesWithVendor" item-title="displayName"
            item-value="id" label="Kategorie" clearable class="mb-3" />
          <v-row>
            <v-col cols="6">
              <v-combobox v-model="productForm.defaultUnit" :items="commonUnits" label="Standard-Einheit" />
            </v-col>
            <v-col cols="6">
              <v-text-field v-model.number="productForm.freshnessDays" label="Haltbarkeit (Tage)" type="number"
                inputmode="numeric" min="1" />
            </v-col>
          </v-row>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showProductDialog = false">Abbrechen</v-btn>
          <v-btn color="primary" @click="saveProduct">Speichern</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dish Dialog -->
    <v-dialog v-model="showDishDialog" max-width="700" scrollable>
      <v-card>
        <v-card-title>
          {{ editingDish ? 'Gericht bearbeiten' : 'Neues Gericht' }}
        </v-card-title>
        <v-card-text>
          <!-- Basic info -->
          <div class="text-subtitle-2 mb-3">Grunddaten</div>

          <v-row>
            <v-col cols="12" md="6">
              <v-text-field v-model="dishForm.name" label="Name" autofocus />
            </v-col>
            <v-col cols="12" md="6">
              <v-text-field v-model="dishForm.recipeUrl" label="Rezept-Link" type="url"
                prepend-inner-icon="mdi-link" />
            </v-col>
            <v-col cols="12" md="4">
              <v-text-field v-model.number="dishForm.defaultServings" label="Standard-Portionen" type="number" inputmode="numeric" min="1"
                max="20" />
            </v-col>
            <v-col cols="12">
              <v-select
                v-model="dishForm.categories"
                :items="availableCategories"
                label="Kategorien"
                multiple
                chips
                closable-chips
                hint="Wähle eine oder mehrere Kategorien für dieses Gericht"
                persistent-hint
              />
            </v-col>
            <v-col cols="12">
              <v-textarea
                v-model="dishForm.recipe"
                label="Rezept / Zubereitungsanleitung"
                hint="Hier kannst du die Zubereitung Schritt für Schritt beschreiben"
                persistent-hint
                rows="6"
                auto-grow
                prepend-inner-icon="mdi-book-open-variant"
              />
            </v-col>
            <v-col cols="12">
              <v-checkbox
                v-model="dishForm.published"
                label="Im Planer anzeigen"
                hint="Wenn deaktiviert, wird das Gericht nicht im Planer zur Auswahl angezeigt"
                persistent-hint
                color="primary"
              />
            </v-col>
          </v-row>

          <v-divider class="my-4" />

          <!-- Ingredients -->
          <div class="d-flex align-center justify-space-between mb-3">
            <div class="text-subtitle-2">
              Zutaten ({{ dishForm.ingredients.length }}) — pro Portion
            </div>
            <v-btn variant="tonal" color="primary" size="small" @click="openIngredientDialog()">
              <v-icon start icon="mdi-plus" />
              Zutat hinzufügen
            </v-btn>
          </div>

          <v-list v-if="dishForm.ingredients.length > 0" density="compact">
            <v-list-item v-for="ing in dishForm.ingredients" :key="ing.id" :title="ing.productName">
              <template #subtitle>
                <span v-if="ing.amount !== null && ing.amount !== 0 && ing.unit !== null">
                  {{ ing.amount }} {{ ing.unit }}{{ ing.optional ? ' (optional)' : '' }}
                </span>
                <span v-else-if="ing.optional">(optional)</span>
              </template>

              <template #prepend>
                <v-icon icon="mdi-circle-small" />
              </template>

              <template #append>
                <v-btn icon="mdi-pencil" variant="text" size="small" @click="openIngredientDialog(ing)" />
                <v-btn icon="mdi-delete" variant="text" size="small" color="error" @click="deleteIngredient(ing)" />
              </template>
            </v-list-item>
          </v-list>

          <v-alert v-else type="info" variant="tonal" class="mt-2">
            Noch keine Zutaten hinzugefügt
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showDishDialog = false">Abbrechen</v-btn>
          <v-btn color="primary" @click="saveDish">Speichern</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Ingredient Dialog -->
    <v-dialog v-model="showIngredientDialog" max-width="500">
      <v-card>
        <v-card-title>
          {{ editingIngredient ? 'Zutat bearbeiten' : 'Zutat hinzufügen' }}
        </v-card-title>
        <v-card-text>
          <!-- Product selection -->
          <v-autocomplete v-model="ingredientForm.productId" :items="productOptions" item-title="title"
            item-value="value" label="Produkt auswählen (optional)" clearable class="mb-3">
            <template #item="{ item, props }">
              <v-list-item v-bind="props">
                <v-list-item-subtitle>{{ item.raw.subtitle }}</v-list-item-subtitle>
              </v-list-item>
            </template>
          </v-autocomplete>

          <!-- Manual product name -->
          <v-text-field v-model="ingredientForm.productName" label="Produktname" :autofocus="!editingIngredient"
            class="mb-3" hint="Wird automatisch ausgefüllt, wenn ein Produkt ausgewählt wurde" />

          <v-row>
            <v-col cols="6">
              <v-text-field v-model.number="ingredientForm.amount" label="Menge pro Portion" type="number"
                inputmode="decimal" min="0" step="0.1" />
            </v-col>
            <v-col cols="6">
              <v-combobox v-model="ingredientForm.unit" :items="commonUnits" label="Einheit" />
            </v-col>
          </v-row>

          <v-checkbox v-model="ingredientForm.optional" label="Optional" hide-details />
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

    <!-- JSON Import Dialog -->
    <v-dialog v-model="showJsonImportDialog" max-width="800" scrollable>
      <v-card>
        <v-card-title>Gericht aus JSON importieren</v-card-title>
        <v-card-text>
          <v-alert type="info" variant="tonal" class="mb-4">
            <div class="text-subtitle-2 mb-2">Erwartetes Format:</div>
            <pre class="text-caption">{
  "name": "Gericht Name",
  "recipeUrl": "https://...",
  "defaultServings": 2,
  "ingredients": [
    {
      "productName": "Zutat 1",
      "amount": 200,
      "unit": "g",
      "optional": false
    }
  ]
}</pre>
          </v-alert>

          <v-textarea v-model="jsonInput" label="JSON eingeben" rows="15" auto-grow class="json-input" />

          <v-alert v-if="jsonError" type="error" variant="tonal" class="mt-3">
            {{ jsonError }}
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showJsonImportDialog = false">Abbrechen</v-btn>
          <v-btn color="primary" @click="importFromJson" :disabled="!jsonInput.trim()">
            Importieren
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Product Bulk Editor -->
    <ProductBulkEditor v-model="showBulkEditor" />

    <!-- Dish Bulk Editor -->
    <DishBulkEditor v-model="showDishBulkEditor" />
  </div>
</template>

<style scoped>
.json-input :deep(textarea) {
  font-family: 'Courier New', monospace;
  font-size: 0.875rem;
}

.vendor-header {
  padding: 12px 8px 12px 16px !important;
  background: rgba(var(--v-theme-primary), 0.05);
  border-radius: 8px;
  margin: 8px 8px 4px 8px;
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  flex-wrap: nowrap !important;
  min-height: auto !important;
  height: auto !important;
}

.vendor-header > div {
  flex-shrink: 0;
}

.vendor-header > div:first-child {
  flex: 1;
  min-width: 0;
}

.category-item {
  padding-left: 24px !important;
}
</style>
