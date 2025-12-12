const API_URL = import.meta.env.VITE_API_URL || ''

class ApiService {
  constructor() {
    this.baseUrl = API_URL
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    }

    try {
      const response = await fetch(url, config)
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unbekannter Fehler' }))
        throw new Error(error.error || `HTTP ${response.status}`)
      }

      // Handle 204 No Content
      if (response.status === 204) {
        return null
      }

      return await response.json()
    } catch (error) {
      console.error(`API Error [${endpoint}]:`, error)
      throw error
    }
  }

  // Vendors
  async getVendors() {
    return this.request('/api/vendors')
  }

  async createVendor(data) {
    return this.request('/api/vendors', { method: 'POST', body: JSON.stringify(data) })
  }

  async updateVendor(id, data) {
    return this.request(`/api/vendors/${id}`, { method: 'PUT', body: JSON.stringify(data) })
  }

  async deleteVendor(id) {
    return this.request(`/api/vendors/${id}`, { method: 'DELETE' })
  }

  // Categories
  async getCategories(vendorId = null) {
    const query = vendorId ? `?vendorId=${vendorId}` : ''
    return this.request(`/api/categories${query}`)
  }

  async createCategory(data) {
    return this.request('/api/categories', { method: 'POST', body: JSON.stringify(data) })
  }

  async updateCategory(id, data) {
    return this.request(`/api/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) })
  }

  async deleteCategory(id) {
    return this.request(`/api/categories/${id}`, { method: 'DELETE' })
  }

  async reorderCategories(vendorId, categoryIds) {
    return this.request('/api/categories/reorder', {
      method: 'POST',
      body: JSON.stringify({ vendorId, categoryIds })
    })
  }

  // Products
  async getProducts(search = null) {
    const query = search ? `?search=${encodeURIComponent(search)}` : ''
    return this.request(`/api/products${query}`)
  }

  async getProduct(id) {
    return this.request(`/api/products/${id}`)
  }

  async createProduct(data) {
    return this.request('/api/products', { method: 'POST', body: JSON.stringify(data) })
  }

  async updateProduct(id, data) {
    return this.request(`/api/products/${id}`, { method: 'PUT', body: JSON.stringify(data) })
  }

  async deleteProduct(id) {
    return this.request(`/api/products/${id}`, { method: 'DELETE' })
  }

  // Dishes
  async getDishes(search = null) {
    const query = search ? `?search=${encodeURIComponent(search)}` : ''
    return this.request(`/api/dishes${query}`)
  }

  async getDish(id) {
    return this.request(`/api/dishes/${id}`)
  }

  async createDish(data) {
    return this.request('/api/dishes', { method: 'POST', body: JSON.stringify(data) })
  }

  async updateDish(id, data) {
    return this.request(`/api/dishes/${id}`, { method: 'PUT', body: JSON.stringify(data) })
  }

  async deleteDish(id) {
    return this.request(`/api/dishes/${id}`, { method: 'DELETE' })
  }

  // Meals
  async getMeals(from = null, to = null) {
    const params = new URLSearchParams()
    if (from) params.append('from', from)
    if (to) params.append('to', to)
    const query = params.toString() ? `?${params.toString()}` : ''
    return this.request(`/api/meals${query}`)
  }

  async getMealsForDate(date) {
    return this.request(`/api/meals/date/${date}`)
  }

  async createMeal(data) {
    return this.request('/api/meals', { method: 'POST', body: JSON.stringify(data) })
  }

  async updateMeal(id, data) {
    return this.request(`/api/meals/${id}`, { method: 'PUT', body: JSON.stringify(data) })
  }

  async deleteMeal(id) {
    return this.request(`/api/meals/${id}`, { method: 'DELETE' })
  }

  async createMealsBulk(meals) {
    return this.request('/api/meals/bulk', { method: 'POST', body: JSON.stringify({ meals }) })
  }

  async commitMeals(mealIds) {
    return this.request('/api/meals/commit', { method: 'POST', body: JSON.stringify({ mealIds }) })
  }

  // Shopping List
  async getCurrentShoppingList() {
    return this.request('/api/shopping-list/current')
  }

  async generateShoppingList(fromDate, toDate, shoppingDate = null) {
    return this.request('/api/shopping-list/generate', {
      method: 'POST',
      body: JSON.stringify({ fromDate, toDate, shoppingDate })
    })
  }

  async addShoppingItem(data) {
    return this.request('/api/shopping-list/add-item', {
      method: 'POST',
      body: JSON.stringify(data)
    })
  }

  async toggleShoppingItem(itemId) {
    return this.request(`/api/shopping-list/toggle-item/${itemId}`, {
      method: 'POST'
    })
  }

  async removeCheckedItems() {
    return this.request('/api/shopping-list/remove-checked', {
      method: 'POST'
    })
  }

  async updateShoppingItem(itemId, data) {
    return this.request(`/api/shopping-list/item/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    })
  }

  async deleteShoppingItem(itemId) {
    return this.request(`/api/shopping-list/item/${itemId}`, {
      method: 'DELETE'
    })
  }

  async clearShoppingList() {
    return this.request('/api/shopping-list/clear', {
      method: 'DELETE'
    })
  }
}

export const api = new ApiService()
export default api
