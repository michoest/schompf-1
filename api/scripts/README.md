# Migration Scripts

## migrate-old-db.js

Migrates recipes from the old database format to the new Schompf database structure.

### What it does:

1. **Extracts Products**: Collects all unique product names from all recipe ingredients
2. **Transforms Dishes**: Converts old recipe format to new dish format with proper ingredient linking
3. **Skips Invalid Data**: Ignores dishes with empty names
4. **Preserves Data**: Keeps recipe URLs, serving amounts, and optional ingredient flags
5. **Creates Clean Database**: Generates a fresh database with vendors/categories left empty for manual assignment

### Usage:

```bash
cd api
npm run migrate
```

### What gets migrated:

- ✅ All dishes with non-empty names
- ✅ All ingredients from valid dishes
- ✅ Recipe URLs (from `recipe` field → `recipeUrl`)
- ✅ Serving amounts (from `standardAmount` field → `defaultServings`)
- ✅ Optional ingredient flags
- ✅ Ingredient amounts and units (null values converted to 0 and empty string)

### What needs manual setup after migration:

1. Add vendors in the Verwaltung view
2. Create categories and assign them to vendors
3. Assign products to categories (for better shopping list organization)

### Notes:

- The migration **replaces** the existing `api/data/db.json` file
- Original data is read from `api/data/old_db.json`
- All products are created without category assignments (categoryId: null)
- All products default to 7 days freshness
- Dishes without names are skipped and counted in the summary
