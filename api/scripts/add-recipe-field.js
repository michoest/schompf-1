import { Low } from 'lowdb'
import { JSONFile } from 'lowdb/node'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const file = join(__dirname, '../data/db.json')
const adapter = new JSONFile(file)
const db = new Low(adapter, {})

async function migrate() {
  console.log('🔄 Starting migration: Adding recipe field to dishes...')

  await db.read()

  if (!db.data.dishes) {
    console.log('❌ No dishes found in database')
    return
  }

  let updatedCount = 0

  for (const dish of db.data.dishes) {
    if (dish.recipe === undefined) {
      dish.recipe = null
      updatedCount++
    }
  }

  if (updatedCount > 0) {
    await db.write()
    console.log(`✅ Migration complete: Updated ${updatedCount} dish(es)`)
    console.log(`   Total dishes in database: ${db.data.dishes.length}`)
  } else {
    console.log('✨ All dishes already have the recipe field - no changes needed')
  }
}

migrate().catch(err => {
  console.error('❌ Migration failed:', err)
  process.exit(1)
})
