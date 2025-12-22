import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { randomUUID } from 'crypto'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const OLD_DB_PATH = join(__dirname, '../data/old_db.json')
const NEW_DB_PATH = join(__dirname, '../data/db.json')

console.log('🔄 Starting migration...\n')

// Read old database
const oldDb = JSON.parse(readFileSync(OLD_DB_PATH, 'utf8'))
console.log(`📖 Read old database: ${oldDb.menu.dishes.length} dishes found`)

// Extract all unique products from all recipes
const productsMap = new Map()

oldDb.menu.dishes.forEach(dish => {
  if (!dish.title || !dish.title.trim()) return // Skip dishes with empty names

  dish.ingredients.forEach(ingredient => {
    if (!ingredient.name || !ingredient.name.trim()) return

    const productName = ingredient.name.trim()

    if (!productsMap.has(productName)) {
      // Determine default unit based on most common usage
      let defaultUnit = ingredient.amount?.unit || ''
      if (defaultUnit === null || defaultUnit === undefined) {
        defaultUnit = ''
      }

      productsMap.set(productName, {
        id: randomUUID(),
        name: productName,
        categoryId: null,
        defaultUnit: defaultUnit || 'Stück',
        freshnessDays: 7,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
    }
  })
})

console.log(`📦 Extracted ${productsMap.size} unique products`)

// Transform dishes
const dishes = []
let skippedCount = 0

oldDb.menu.dishes.forEach(dish => {
  // Skip dishes with empty names
  if (!dish.title || !dish.title.trim()) {
    skippedCount++
    return
  }

  const ingredients = dish.ingredients
    .filter(ing => ing.name && ing.name.trim())
    .map(ing => {
      const productName = ing.name.trim()
      const product = productsMap.get(productName)

      // Handle amount
      let amount = ing.amount?.value
      let unit = ing.amount?.unit

      // Convert null to 0 for amount
      if (amount === null || amount === undefined) {
        amount = 0
      }

      // Convert null/undefined to empty string for unit
      if (unit === null || unit === undefined) {
        unit = ''
      }

      return {
        id: randomUUID(),
        productId: product?.id || null,
        productName: productName,
        amount: amount,
        unit: unit || '',
        optional: ing.optional || false
      }
    })

  dishes.push({
    id: dish.id || randomUUID(),
    name: dish.title.trim(),
    recipeUrl: dish.recipe || null,
    type: 'dish',
    defaultServings: dish.standardAmount || 2,
    ingredients: ingredients,
    subDishes: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  })
})

console.log(`🍽️  Transformed ${dishes.length} dishes (skipped ${skippedCount} with empty names)`)

// Create new database structure
const newDb = {
  vendors: [],
  categories: [],
  products: Array.from(productsMap.values()),
  dishes: dishes,
  meals: [],
  shoppingList: null,
  settings: {
    defaultServings: 2,
    defaultFreshnessDays: 7,
    mealSlots: [
      { id: 'breakfast', name: 'Frühstück', order: 0 },
      { id: 'lunch', name: 'Mittagessen', order: 1 },
      { id: 'dinner', name: 'Abendessen', order: 2 }
    ]
  }
}

// Write new database
writeFileSync(NEW_DB_PATH, JSON.stringify(newDb, null, 2), 'utf8')
console.log(`\n✅ Migration complete!`)
console.log(`📝 New database written to: ${NEW_DB_PATH}`)
console.log(`\nSummary:`)
console.log(`  - Vendors: ${newDb.vendors.length}`)
console.log(`  - Categories: ${newDb.categories.length}`)
console.log(`  - Products: ${newDb.products.length}`)
console.log(`  - Dishes: ${newDb.dishes.length}`)
console.log(`  - Meals: ${newDb.meals.length}`)
console.log(`\n💡 Next steps:`)
console.log(`  1. Add vendors in the Verwaltung view`)
console.log(`  2. Add categories and assign them to vendors`)
console.log(`  3. Assign products to categories`)
