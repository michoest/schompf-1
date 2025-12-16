<script setup>
import { ref, computed, onMounted } from 'vue'
import { useProductsStore, useVendorsStore, useAppStore } from '@/stores'

const productsStore = useProductsStore()
const vendorsStore = useVendorsStore()
const appStore = useAppStore()

const search = ref('')
const activeTab = ref('products')

// Product form
const showProductDialog = ref(false)
const editingProduct = ref(null)
const productForm = ref({
  name: '',
  categoryId: null,
  defaultUnit: '',
  freshnessDays: 7
})

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

const commonUnits = ['g', 'kg', 'ml', 'l', 'Stück', 'EL', 'TL', 'Bund', 'Packung', 'Dose']
const vendorColors = [
  '#10B981', '#0EA5E9', '#8B5CF6', '#F97316',
  '#EF4444', '#EC4899', '#14B8A6', '#6366F1'
]

// Computed
const filteredProducts = computed(() => {
  if (!search.value) return productsStore.products

  const searchLower = search.value.toLowerCase()
  return productsStore.products.filter(p =>
    p.name.toLowerCase().includes(searchLower)
  )
})

const categoriesWithVendor = computed(() => {
  return vendorsStore.categories.map(cat => {
    const vendor = vendorsStore.vendors.find(v => v.id === cat.vendorId)
    return {
      ...cat,
      vendorName: vendor?.name || 'Unbekannt',
      displayName: `${cat.name} (${vendor?.name || 'Unbekannt'})`
    }
  })
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

onMounted(() => {
  productsStore.fetchProducts()
  vendorsStore.fetchVendors()
  vendorsStore.fetchCategories()
})
</script>

<template>
  <div class="products-view">
    <!-- Tabs -->
    <v-tabs v-model="activeTab" color="primary" class="mb-4">
      <v-tab value="products">Produkte</v-tab>
      <v-tab value="vendors">Händler</v-tab>
      <v-tab value="categories">Kategorien</v-tab>
    </v-tabs>

    <v-window v-model="activeTab">
      <!-- Products Tab -->
      <v-window-item value="products">
        <div class="d-flex align-center justify-space-between mb-4 flex-wrap gap-2">
          <v-text-field v-model="search" prepend-inner-icon="mdi-magnify" label="Produkte suchen..." clearable
            hide-details style="max-width: 300px" />

          <v-btn color="primary" @click="openProductDialog()">
            <v-icon start icon="mdi-plus" />
            Neues Produkt
          </v-btn>
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

      <!-- Vendors Tab -->
      <v-window-item value="vendors">
        <div class="d-flex justify-end mb-4">
          <v-btn color="primary" @click="openVendorDialog()">
            <v-icon start icon="mdi-plus" />
            Neuer Händler
          </v-btn>
        </div>

        <v-card variant="flat" color="surface">
          <v-list v-if="vendorsStore.vendors.length > 0">
            <v-list-item v-for="vendor in vendorsStore.vendors" :key="vendor.id" :title="vendor.name"
              @click="openVendorDialog(vendor)">
              <template #prepend>
                <v-avatar :color="vendor.color" size="32">
                  <v-icon icon="mdi-store" size="small" />
                </v-avatar>
              </template>

              <template #append>
                <v-btn icon="mdi-delete" variant="text" size="small" color="error" @click.stop="deleteVendor(vendor)" />
              </template>
            </v-list-item>
          </v-list>

          <v-card-text v-else class="text-center pa-8">
            <div class="text-medium-emphasis">Keine Händler vorhanden</div>
          </v-card-text>
        </v-card>
      </v-window-item>

      <!-- Categories Tab -->
      <v-window-item value="categories">
        <div class="d-flex justify-end mb-4">
          <v-btn color="primary" @click="openCategoryDialog()">
            <v-icon start icon="mdi-plus" />
            Neue Kategorie
          </v-btn>
        </div>

        <v-card variant="flat" color="surface">
          <v-list v-if="categoriesWithVendor.length > 0">
            <v-list-item v-for="cat in categoriesWithVendor" :key="cat.id" :title="cat.name" :subtitle="cat.vendorName"
              @click="openCategoryDialog(cat)">
              <template #append>
                <v-chip size="small" variant="tonal">{{ cat.order }}</v-chip>
                <v-btn icon="mdi-delete" variant="text" size="small" color="error" @click.stop="deleteCategory(cat)" />
              </template>
            </v-list-item>
          </v-list>

          <v-card-text v-else class="text-center pa-8">
            <div class="text-medium-emphasis">Keine Kategorien vorhanden</div>
          </v-card-text>
        </v-card>
      </v-window-item>
    </v-window>

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
              <v-icon v-if="vendorForm.color === color" icon="mdi-check" />
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
          <v-select v-model="categoryForm.vendorId" :items="vendorsStore.vendors" item-title="name" item-value="id"
            label="Händler" />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showCategoryDialog = false">Abbrechen</v-btn>
          <v-btn color="primary" @click="saveCategory">Speichern</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped></style>
