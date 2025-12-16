import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '@/services/api'

export const useAppStore = defineStore('app', () => {
  // State
  const loading = ref(false)
  const error = ref(null)
  const snackbar = ref({
    show: false,
    message: '',
    color: 'success'
  })

  // Actions
  function showSnackbar(message, color = 'success') {
    snackbar.value = { show: true, message, color }
  }

  function hideSnackbar() {
    snackbar.value.show = false
  }

  function setLoading(value) {
    loading.value = value
  }

  function setError(err) {
    error.value = err
    if (err) {
      showSnackbar(err, 'error')
    }
  }

  return {
    loading,
    error,
    snackbar,
    showSnackbar,
    hideSnackbar,
    setLoading,
    setError
  }
})

export const useVendorsStore = defineStore('vendors', () => {
  const vendors = ref([])
  const categories = ref([])
  const loading = ref(false)

  async function fetchVendors() {
    loading.value = true
    try {
      vendors.value = await api.getVendors()
    } catch (error) {
      console.error('Error fetching vendors:', error)
    } finally {
      loading.value = false
    }
  }

  async function fetchCategories() {
    loading.value = true
    try {
      categories.value = await api.getCategories()
    } catch (error) {
      console.error('Error fetching categories:', error)
    } finally {
      loading.value = false
    }
  }

  async function createVendor(data) {
    const vendor = await api.createVendor(data)
    vendors.value.push(vendor)
    return vendor
  }

  async function updateVendor(id, data) {
    const vendor = await api.updateVendor(id, data)
    const index = vendors.value.findIndex(v => v.id === id)
    if (index !== -1) vendors.value[index] = vendor
    return vendor
  }

  async function deleteVendor(id) {
    await api.deleteVendor(id)
    vendors.value = vendors.value.filter(v => v.id !== id)
  }

  async function createCategory(data) {
    const category = await api.createCategory(data)
    categories.value.push(category)
    return category
  }

  async function updateCategory(id, data) {
    const category = await api.updateCategory(id, data)
    const index = categories.value.findIndex(c => c.id === id)
    if (index !== -1) categories.value[index] = category
    return category
  }

  async function deleteCategory(id) {
    await api.deleteCategory(id)
    categories.value = categories.value.filter(c => c.id !== id)
  }

  function getCategoriesForVendor(vendorId) {
    return categories.value
      .filter(c => c.vendorId === vendorId)
      .sort((a, b) => (a.order || 0) - (b.order || 0))
  }

  return {
    vendors,
    categories,
    loading,
    fetchVendors,
    fetchCategories,
    createVendor,
    updateVendor,
    deleteVendor,
    createCategory,
    updateCategory,
    deleteCategory,
    getCategoriesForVendor
  }
})

// Alias for easier access
export const useCategoriesStore = useVendorsStore

export const useProductsStore = defineStore('products', () => {
  const products = ref([])
  const loading = ref(false)

  async function fetchProducts(search = null) {
    loading.value = true
    try {
      products.value = await api.getProducts(search)
    } catch (error) {
      console.error('Error fetching products:', error)
    } finally {
      loading.value = false
    }
  }

  async function createProduct(data) {
    const product = await api.createProduct(data)
    products.value.push(product)
    return product
  }

  async function updateProduct(id, data) {
    const product = await api.updateProduct(id, data)
    const index = products.value.findIndex(p => p.id === id)
    if (index !== -1) products.value[index] = product
    return product
  }

  async function deleteProduct(id) {
    await api.deleteProduct(id)
    products.value = products.value.filter(p => p.id !== id)
  }

  async function loadProducts(search = null) {
    return fetchProducts(search)
  }

  return {
    products,
    loading,
    fetchProducts,
    loadProducts,
    createProduct,
    updateProduct,
    deleteProduct
  }
})

export const useDishesStore = defineStore('dishes', () => {
  const dishes = ref([])
  const loading = ref(false)

  async function fetchDishes(search = null) {
    loading.value = true
    try {
      dishes.value = await api.getDishes(search)
    } catch (error) {
      console.error('Error fetching dishes:', error)
    } finally {
      loading.value = false
    }
  }

  async function fetchDish(id) {
    return await api.getDish(id)
  }

  async function createDish(data) {
    const dish = await api.createDish(data)
    dishes.value.push(dish)
    return dish
  }

  async function updateDish(id, data) {
    const dish = await api.updateDish(id, data)
    const index = dishes.value.findIndex(d => d.id === id)
    if (index !== -1) dishes.value[index] = dish
    return dish
  }

  async function deleteDish(id) {
    await api.deleteDish(id)
    dishes.value = dishes.value.filter(d => d.id !== id)
  }

  return {
    dishes,
    loading,
    fetchDishes,
    fetchDish,
    createDish,
    updateDish,
    deleteDish
  }
})

export const useMealsStore = defineStore('meals', () => {
  const meals = ref([])
  const loading = ref(false)

  async function fetchMeals(from = null, to = null) {
    loading.value = true
    try {
      meals.value = await api.getMeals(from, to)
    } catch (error) {
      console.error('Error fetching meals:', error)
    } finally {
      loading.value = false
    }
  }

  async function createMeal(data) {
    const meal = await api.createMeal(data)
    meals.value.push(meal)
    return meal
  }

  async function updateMeal(id, data) {
    const meal = await api.updateMeal(id, data)
    const index = meals.value.findIndex(m => m.id === id)
    if (index !== -1) meals.value[index] = meal
    return meal
  }

  async function deleteMeal(id) {
    await api.deleteMeal(id)
    meals.value = meals.value.filter(m => m.id !== id)
  }

  async function commitMeals(mealIds) {
    const result = await api.commitMeals(mealIds)
    // Update local meals to reflect committed status
    for (const updatedMeal of result.updatedMeals) {
      const index = meals.value.findIndex(m => m.id === updatedMeal.id)
      if (index !== -1) {
        meals.value[index] = updatedMeal
      }
    }
    return result
  }

  function getMealsForDate(date) {
    return meals.value
      .filter(m => m.date === date)
      .sort((a, b) => (a.slotOrder || 0) - (b.slotOrder || 0))
  }

  return {
    meals,
    loading,
    fetchMeals,
    createMeal,
    updateMeal,
    deleteMeal,
    commitMeals,
    getMealsForDate
  }
})

export const useShoppingStore = defineStore('shopping', () => {
  const shoppingList = ref(null)
  const loading = ref(false)

  async function loadCurrentList() {
    loading.value = true
    try {
      shoppingList.value = await api.getCurrentShoppingList()
    } catch (error) {
      console.error('Error loading shopping list:', error)
    } finally {
      loading.value = false
    }
  }

  async function generateList(fromDate, toDate, shoppingDate = null) {
    loading.value = true
    try {
      shoppingList.value = await api.generateShoppingList(fromDate, toDate, shoppingDate)
    } catch (error) {
      console.error('Error generating shopping list:', error)
    } finally {
      loading.value = false
    }
  }

  async function toggleItem(itemId) {
    if (!shoppingList.value) return
    try {
      const updatedItem = await api.toggleShoppingItem(itemId)
      const item = shoppingList.value.items.find(i => i.id === itemId)
      if (item) {
        item.checked = updatedItem.checked
      }
    } catch (error) {
      console.error('Error toggling item:', error)
    }
  }

  async function removeCheckedItems() {
    if (!shoppingList.value) return
    try {
      await api.removeCheckedItems()
      shoppingList.value.items = shoppingList.value.items.filter(i => !i.checked)
    } catch (error) {
      console.error('Error removing checked items:', error)
    }
  }

  return {
    shoppingList,
    loading,
    loadCurrentList,
    generateList,
    toggleItem,
    removeCheckedItems
  }
})
