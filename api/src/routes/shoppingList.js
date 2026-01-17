import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../services/database.js';

const router = Router();

/**
 * Helper to format date as YYYY-MM-DD without timezone shifts
 * @param {Date} date - Date object to format
 * @returns {string} Date string in YYYY-MM-DD format
 */
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Helper to parse YYYY-MM-DD date string as local date
 * @param {string} dateStr - Date string in YYYY-MM-DD format
 * @returns {Date} Date object at local midnight
 */
function parseLocalDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// Get current shopping list
router.get('/current', async (req, res) => {
  try {
    await db.read();
    if (!db.data.shoppingList || !db.data.shoppingList.items || db.data.shoppingList.items.length === 0) {
      return res.json(null);
    }
    res.json(db.data.shoppingList);
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim Laden der Einkaufsliste' });
  }
});

/**
 * Unit conversion helpers
 * Tries to normalize units for aggregation
 */
const unitNormalization = {
  // Weight
  'g': { base: 'g', factor: 1, group: 'weight' },
  'kg': { base: 'g', factor: 1000, group: 'weight' },
  'gramm': { base: 'g', factor: 1, group: 'weight' },
  'kilogramm': { base: 'g', factor: 1000, group: 'weight' },
  // Volume
  'ml': { base: 'ml', factor: 1, group: 'volume' },
  'l': { base: 'ml', factor: 1000, group: 'volume' },
  'liter': { base: 'ml', factor: 1000, group: 'volume' },
  'milliliter': { base: 'ml', factor: 1, group: 'volume' },
  // Count
  'stück': { base: 'stück', factor: 1, group: 'count' },
  'stk': { base: 'stück', factor: 1, group: 'count' },
  'st': { base: 'stück', factor: 1, group: 'count' },
  // Others stay as-is
};

function normalizeUnit(amount, unit) {
  const lowerUnit = (unit || '').toLowerCase().trim();
  const norm = unitNormalization[lowerUnit];

  if (norm) {
    return {
      amount: amount * norm.factor,
      unit: norm.base,
      group: norm.group
    };
  }

  return { amount, unit: unit || '', group: null };
}

function getUnitGroup(unit) {
  const lowerUnit = (unit || '').toLowerCase().trim();
  const norm = unitNormalization[lowerUnit];
  return norm?.group || null;
}

function formatAmount(amount, unit) {
  // Handle null or 0 amounts (unspecified amounts like "salt", "pepper", etc.)
  if (amount === null || amount === 0 || amount === undefined) {
    return { amount: 0, unit: unit || '', display: '' };
  }

  // Convert back to larger units if appropriate
  if (unit === 'g' && amount >= 1000) {
    return { amount: amount / 1000, unit: 'kg', display: `${(amount / 1000).toFixed(1).replace(/\.0$/, '')} kg` };
  }
  if (unit === 'ml' && amount >= 1000) {
    return { amount: amount / 1000, unit: 'l', display: `${(amount / 1000).toFixed(1).replace(/\.0$/, '')} l` };
  }

  const displayAmount = Number.isInteger(amount) ? amount : amount.toFixed(1).replace(/\.0$/, '');
  return { amount, unit, display: unit ? `${displayAmount} ${unit}` : `${displayAmount}` };
}

/**
 * Get unique key for a shopping list item
 * Items are unique by productName (lowercase) + categoryId
 */
function getItemKey(productName, categoryId) {
  return `${(productName || '').toLowerCase().trim()}::${categoryId || 'null'}`;
}

/**
 * Aggregate amounts by unit group
 * Returns an object with { unitGroups: { [group]: { amount, unit } }, incompatible: [...] }
 */
function aggregateAmounts(amounts) {
  const unitGroups = {};  // { weight: { amount: 500, unit: 'g' }, volume: { amount: 200, unit: 'ml' } }
  const incompatible = []; // Amounts that couldn't be normalized

  for (const amt of amounts) {
    if (amt.amount === null || amt.amount === undefined || amt.amount === 0) {
      // Skip amounts without values (like "salt to taste")
      continue;
    }

    const normalized = normalizeUnit(amt.amount, amt.unit);

    if (normalized.group) {
      // This unit can be normalized
      if (!unitGroups[normalized.group]) {
        unitGroups[normalized.group] = { amount: 0, unit: normalized.unit };
      }
      unitGroups[normalized.group].amount += normalized.amount;
    } else {
      // Can't normalize - check if we already have this unit
      const existingIdx = incompatible.findIndex(i =>
        (i.unit || '').toLowerCase() === (amt.unit || '').toLowerCase()
      );
      if (existingIdx !== -1) {
        incompatible[existingIdx].amount += amt.amount;
      } else {
        incompatible.push({ amount: amt.amount, unit: amt.unit || '' });
      }
    }
  }

  return { unitGroups, incompatible };
}

/**
 * Format aggregated amounts for display
 */
function formatAggregatedDisplay(unitGroups, incompatible) {
  const parts = [];

  // Format each unit group
  for (const group of Object.values(unitGroups)) {
    const formatted = formatAmount(group.amount, group.unit);
    if (formatted.display) {
      parts.push(formatted.display);
    }
  }

  // Add incompatible amounts
  for (const inc of incompatible) {
    const formatted = formatAmount(inc.amount, inc.unit);
    if (formatted.display) {
      parts.push(formatted.display);
    }
  }

  return parts.join(' + ') || '';
}

/**
 * Calculate total amount from amounts array, respecting unit groups
 */
function calculateTotals(amounts) {
  const { unitGroups, incompatible } = aggregateAmounts(amounts);
  const displayAmount = formatAggregatedDisplay(unitGroups, incompatible);

  // For simple cases (single unit group), return the primary values
  const groups = Object.values(unitGroups);
  if (groups.length === 1 && incompatible.length === 0) {
    const formatted = formatAmount(groups[0].amount, groups[0].unit);
    return {
      amount: formatted.amount,
      unit: formatted.unit,
      displayAmount: formatted.display
    };
  }

  // For mixed units, return null for amount/unit but provide display
  return {
    amount: null,
    unit: null,
    displayAmount
  };
}

/**
 * Recursively collect ingredients from a dish, including sub-dishes
 */
function collectIngredients(dishId, servingsMultiplier, db, visited = new Set()) {
  if (visited.has(dishId)) return []; // Prevent circular references
  visited.add(dishId);

  const dish = db.data.dishes.find(d => d.id === dishId);
  if (!dish) return [];

  const ingredients = [];

  // Add direct ingredients (including optional ones)
  for (const ing of dish.ingredients) {
    ingredients.push({
      productId: ing.productId,
      productName: ing.productName,
      amount: ing.amount * servingsMultiplier,
      unit: ing.unit,
      optional: ing.optional || false,
      sourceDishId: dishId,
      sourceDishName: dish.name
    });
  }

  // Add ingredients from sub-dishes
  for (const subDish of (dish.subDishes || [])) {
    const subIngredients = collectIngredients(
      subDish.dishId,
      servingsMultiplier * (subDish.scalingFactor || subDish.multiplier || 1),
      db,
      visited
    );
    ingredients.push(...subIngredients);
  }

  return ingredients;
}

/**
 * Collect ingredients from a meal, including selected subdishes
 */
function collectMealIngredients(meal, db) {
  const ingredients = [];

  // Collect from main dish
  const mainIngredients = collectIngredients(meal.dishId, meal.servings, db);
  ingredients.push(...mainIngredients);

  // Collect from meal's selected subdishes (if any)
  if (meal.subDishes && meal.subDishes.length > 0) {
    for (const subDish of meal.subDishes) {
      const subIngredients = collectIngredients(
        subDish.dishId,
        meal.servings * (subDish.scalingFactor || 1),
        db,
        new Set([meal.dishId]) // Prevent main dish from being included again
      );
      ingredients.push(...subIngredients);
    }
  }

  return ingredients;
}

// Generate shopping list from meals
router.post('/generate', async (req, res) => {
  try {
    const { fromDate, toDate, shoppingDate } = req.body;
    if (!fromDate || !toDate) {
      return res.status(400).json({ error: 'fromDate und toDate sind erforderlich' });
    }

    await db.read();

    // Get or create current shopping list
    if (!db.data.shoppingList) {
      db.data.shoppingList = {
        id: uuidv4(),
        generatedAt: new Date().toISOString(),
        items: []
      };
    }

    // Build map of existing items by productName+categoryId key
    const existingItemsMap = new Map();
    for (const item of db.data.shoppingList.items) {
      const key = getItemKey(item.productName, item.categoryId);
      existingItemsMap.set(key, item);
    }

    // Get meals in date range that are NOT yet committed
    const meals = db.data.meals.filter(m =>
      m.date >= fromDate && m.date <= toDate && (!m.status || m.status === 'planned')
    );

    // Collect new meal sources to add
    // Key: productName+categoryId -> { productInfo, sources[] }
    const newMealSources = new Map();

    for (const meal of meals) {
      if (!meal.dishId) continue;

      const dish = db.data.dishes.find(d => d.id === meal.dishId);
      if (!dish || dish.type === 'eating_out') continue;

      // Collect ingredients from main dish and selected subdishes
      const ingredients = collectMealIngredients(meal, db);

      for (const ing of ingredients) {
        // Find product for category info
        const product = ing.productId ? db.data.products.find(p => p.id === ing.productId) : null;
        const categoryId = product?.categoryId || null;
        const productName = ing.productName || product?.name || 'Unbekannt';

        const key = getItemKey(productName, categoryId);

        if (!newMealSources.has(key)) {
          newMealSources.set(key, {
            productId: ing.productId || product?.id || null,
            productName,
            categoryId,
            freshnessDays: product?.freshnessDays || db.data.settings.defaultFreshnessDays,
            sources: []
          });
        }

        newMealSources.get(key).sources.push({
          sourceType: 'meal',
          mealId: meal.id,
          mealDate: meal.date,
          mealSlot: meal.slotName,
          dishId: meal.dishId,
          dishName: meal.dishName,
          sourceDishId: ing.sourceDishId,
          sourceDishName: ing.sourceDishName,
          amount: ing.amount,
          unit: ing.unit,
          optional: ing.optional || false,
          addedAt: new Date().toISOString()
        });
      }
    }

    // Merge new sources with existing items
    for (const [key, data] of newMealSources) {
      if (existingItemsMap.has(key)) {
        // Item exists - add new sources (avoid duplicates by mealId)
        const existing = existingItemsMap.get(key);

        // Migrate old sources format to new amounts format if needed
        if (!existing.amounts && existing.sources) {
          existing.amounts = existing.sources.map(s => ({
            ...s,
            sourceType: s.manual ? 'manual' : 'meal'
          }));
          delete existing.sources;
        }
        if (!existing.amounts) {
          existing.amounts = [];
        }

        const existingMealIds = new Set(
          existing.amounts
            .filter(a => a.sourceType === 'meal')
            .map(a => a.mealId)
        );

        // Only add sources from meals we haven't already added
        const newSources = data.sources.filter(s => !existingMealIds.has(s.mealId));
        if (newSources.length > 0) {
          existing.amounts = [...existing.amounts, ...newSources];
          // Recalculate totals
          const totals = calculateTotals(existing.amounts.filter(a => !a.deleted));
          existing.displayAmount = totals.displayAmount;
          existing.amount = totals.amount;
          existing.unit = totals.unit;
        }
      } else {
        // New item - create it
        const category = data.categoryId
          ? db.data.categories.find(c => c.id === data.categoryId)
          : null;
        const vendor = category
          ? db.data.vendors.find(v => v.id === category.vendorId)
          : null;

        // Calculate freshness info
        const mealSources = data.sources.filter(s => s.mealDate);
        const earliestUseDate = mealSources.length > 0
          ? mealSources.reduce((min, s) => s.mealDate < min ? s.mealDate : min, mealSources[0].mealDate)
          : null;

        let earliestPurchaseDate = null;
        if (earliestUseDate && data.freshnessDays !== null) {
          const purchaseDate = parseLocalDate(earliestUseDate);
          purchaseDate.setDate(purchaseDate.getDate() - data.freshnessDays);
          earliestPurchaseDate = formatDate(purchaseDate);
        }

        let freshnessStatus = 'ok';
        if (shoppingDate && earliestPurchaseDate) {
          if (shoppingDate < earliestPurchaseDate) {
            freshnessStatus = 'wait';
          }
        }

        const totals = calculateTotals(data.sources);

        existingItemsMap.set(key, {
          id: uuidv4(),
          productId: data.productId,
          productName: data.productName,
          categoryId: data.categoryId,
          categoryName: category?.name || null,
          categoryOrder: category?.order ?? 999,
          vendorId: vendor?.id || null,
          vendorName: vendor?.name || 'Sonstiges',
          vendorColor: vendor?.color || '#9CA3AF',
          freshnessDays: data.freshnessDays,
          earliestUseDate,
          earliestPurchaseDate,
          freshnessStatus,
          amounts: data.sources,
          amount: totals.amount,
          unit: totals.unit,
          displayAmount: totals.displayAmount,
          checked: false,
          deleted: false
        });
      }
    }

    // Convert to array and sort
    const items = Array.from(existingItemsMap.values());
    items.sort((a, b) => {
      if (a.vendorName !== b.vendorName) {
        if (a.vendorName === 'Sonstiges') return 1;
        if (b.vendorName === 'Sonstiges') return -1;
        return a.vendorName.localeCompare(b.vendorName);
      }
      if (a.categoryOrder !== b.categoryOrder) {
        return a.categoryOrder - b.categoryOrder;
      }
      return a.productName.localeCompare(b.productName);
    });

    // Update the shopping list in the database
    db.data.shoppingList = {
      id: db.data.shoppingList.id,
      fromDate,
      toDate,
      shoppingDate: shoppingDate || null,
      generatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      items,
      mealIds: meals.map(m => m.id)
    };

    await db.write();
    res.json(db.data.shoppingList);
  } catch (error) {
    console.error('Error generating shopping list:', error);
    res.status(500).json({ error: 'Fehler beim Generieren der Einkaufsliste' });
  }
});

// Add manual item to shopping list (for API/voice integration)
router.post('/add-item', async (req, res) => {
  try {
    const { productName, amount, unit, categoryId } = req.body;
    if (!productName) {
      return res.status(400).json({ error: 'productName ist erforderlich' });
    }

    await db.read();

    // Get or create current shopping list
    if (!db.data.shoppingList) {
      db.data.shoppingList = {
        id: uuidv4(),
        generatedAt: new Date().toISOString(),
        items: []
      };
    }

    // Try to find existing product
    let product = db.data.products.find(p =>
      p.name.toLowerCase() === productName.toLowerCase()
    );

    // Determine final category - use provided categoryId, or product's default
    const finalCategoryId = categoryId !== undefined ? categoryId : (product?.categoryId || null);

    // Find category and vendor
    let category = null;
    let vendor = null;
    if (finalCategoryId) {
      category = db.data.categories.find(c => c.id === finalCategoryId);
      if (category) {
        vendor = db.data.vendors.find(v => v.id === category.vendorId);
      }
    }

    const finalProductName = product?.name || productName;
    const key = getItemKey(finalProductName, finalCategoryId);

    // Check if item with same productName+categoryId already exists
    const existingItem = db.data.shoppingList.items.find(item =>
      getItemKey(item.productName, item.categoryId) === key
    );

    const newSource = {
      sourceType: 'manual',
      amount: amount !== null && amount !== undefined ? amount : null,
      unit: unit || null,
      addedAt: new Date().toISOString()
    };

    let resultItem;

    if (existingItem) {
      // Merge with existing item - add new source
      // Migrate old sources format if needed
      if (!existingItem.amounts && existingItem.sources) {
        existingItem.amounts = existingItem.sources.map(s => ({
          ...s,
          sourceType: s.manual ? 'manual' : 'meal'
        }));
        delete existingItem.sources;
      }
      if (!existingItem.amounts) {
        existingItem.amounts = [];
      }

      existingItem.amounts.push(newSource);

      // Recalculate totals
      const totals = calculateTotals(existingItem.amounts.filter(a => !a.deleted));
      existingItem.displayAmount = totals.displayAmount;
      existingItem.amount = totals.amount;
      existingItem.unit = totals.unit;

      // If item was soft-deleted, restore it
      if (existingItem.deleted) {
        existingItem.deleted = false;
      }

      resultItem = existingItem;
    } else {
      // Create new item
      const formatted = formatAmount(newSource.amount, newSource.unit);

      resultItem = {
        id: uuidv4(),
        productId: product?.id || null,
        productName: finalProductName,
        categoryId: finalCategoryId,
        categoryName: category?.name || null,
        categoryOrder: category?.order ?? 999,
        vendorId: vendor?.id || null,
        vendorName: vendor?.name || 'Sonstiges',
        vendorColor: vendor?.color || '#9CA3AF',
        freshnessDays: product?.freshnessDays || db.data.settings.defaultFreshnessDays,
        earliestUseDate: null,
        freshnessStatus: 'ok',
        amounts: [newSource],
        amount: formatted.amount,
        unit: formatted.unit,
        displayAmount: formatted.display,
        checked: false,
        deleted: false
      };

      db.data.shoppingList.items.push(resultItem);
    }

    db.data.shoppingList.updatedAt = new Date().toISOString();
    await db.write();

    res.status(201).json(resultItem);
  } catch (error) {
    console.error('Error adding shopping item:', error);
    res.status(500).json({ error: 'Fehler beim Hinzufügen des Artikels' });
  }
});

// Toggle item checked status
router.post('/toggle-item/:itemId', async (req, res) => {
  try {
    await db.read();

    if (!db.data.shoppingList) {
      return res.status(404).json({ error: 'Keine Einkaufsliste vorhanden' });
    }

    const item = db.data.shoppingList.items.find(i => i.id === req.params.itemId);
    if (!item) {
      return res.status(404).json({ error: 'Artikel nicht gefunden' });
    }

    item.checked = !item.checked;
    db.data.shoppingList.updatedAt = new Date().toISOString();
    await db.write();

    res.json(item);
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim Aktualisieren des Artikels' });
  }
});

// Remove checked items
router.post('/remove-checked', async (req, res) => {
  try {
    await db.read();

    if (!db.data.shoppingList) {
      return res.status(404).json({ error: 'Keine Einkaufsliste vorhanden' });
    }

    db.data.shoppingList.items = db.data.shoppingList.items.filter(i => !i.checked);
    db.data.shoppingList.updatedAt = new Date().toISOString();
    await db.write();

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim Löschen der Artikel' });
  }
});

// Update shopping item
// - amount/unit: Calculate delta from current total and add as manual adjustment
// - categoryId: Update item's category (changes where it appears, but unique key for merging is still original)
router.put('/item/:itemId', async (req, res) => {
  try {
    const { amount, unit, categoryId } = req.body;

    await db.read();

    if (!db.data.shoppingList) {
      return res.status(404).json({ error: 'Keine Einkaufsliste vorhanden' });
    }

    const item = db.data.shoppingList.items.find(i => i.id === req.params.itemId);
    if (!item) {
      return res.status(404).json({ error: 'Artikel nicht gefunden' });
    }

    // Migrate old sources format if needed
    if (!item.amounts && item.sources) {
      item.amounts = item.sources.map(s => ({
        ...s,
        sourceType: s.manual ? 'manual' : 'meal'
      }));
      delete item.sources;
    }
    if (!item.amounts) {
      item.amounts = [];
    }

    // Handle amount changes - calculate delta and add as manual adjustment
    if (amount !== undefined && unit !== undefined) {
      // Normalize the new desired amount
      const normalizedNew = normalizeUnit(amount, unit);

      // Calculate current total for this unit group
      const currentAmounts = item.amounts.filter(a => !a.deleted);
      const { unitGroups } = aggregateAmounts(currentAmounts);

      // Find the matching unit group
      const targetGroup = normalizedNew.group;
      let currentTotal = 0;

      if (targetGroup && unitGroups[targetGroup]) {
        currentTotal = unitGroups[targetGroup].amount;
      } else {
        // For non-normalized units, sum amounts with same unit
        const sameUnitAmounts = currentAmounts.filter(a =>
          (a.unit || '').toLowerCase() === (unit || '').toLowerCase()
        );
        currentTotal = sameUnitAmounts.reduce((sum, a) => sum + (a.amount || 0), 0);
      }

      // Calculate delta
      const delta = normalizedNew.amount - currentTotal;

      // Only add adjustment if there's a difference
      if (Math.abs(delta) > 0.001) {
        // Convert delta back to display unit
        let adjustmentAmount = delta;
        let adjustmentUnit = normalizedNew.unit;

        // If the new unit is the display unit (e.g., 'kg' vs 'g'), use it
        if (unit && normalizedNew.unit !== unit.toLowerCase()) {
          // User specified a larger unit, convert back
          const userNorm = unitNormalization[unit.toLowerCase()];
          if (userNorm && userNorm.group === targetGroup) {
            adjustmentAmount = delta / userNorm.factor;
            adjustmentUnit = unit;
          }
        }

        item.amounts.push({
          sourceType: 'manual',
          amount: adjustmentAmount,
          unit: adjustmentUnit,
          addedAt: new Date().toISOString(),
          isAdjustment: true
        });
      }
    }

    // Handle category change - update display category (doesn't affect merge key)
    if (categoryId !== undefined) {
      let category = null;
      let vendor = null;

      if (categoryId) {
        category = db.data.categories.find(c => c.id === categoryId);
        if (category) {
          vendor = db.data.vendors.find(v => v.id === category.vendorId);
        }
      }

      item.categoryId = categoryId;
      item.categoryName = category?.name || null;
      item.categoryOrder = category?.order ?? 999;
      item.vendorId = vendor?.id || null;
      item.vendorName = vendor?.name || 'Sonstiges';
      item.vendorColor = vendor?.color || '#9CA3AF';
    }

    // Recalculate totals
    const totals = calculateTotals(item.amounts.filter(a => !a.deleted));
    item.displayAmount = totals.displayAmount;
    item.amount = totals.amount;
    item.unit = totals.unit;

    db.data.shoppingList.updatedAt = new Date().toISOString();
    await db.write();

    res.json(item);
  } catch (error) {
    console.error('Error updating shopping item:', error);
    res.status(500).json({ error: 'Fehler beim Aktualisieren des Artikels' });
  }
});

// Delete shopping item (soft delete - preserves sources for traceability)
router.delete('/item/:itemId', async (req, res) => {
  try {
    await db.read();

    if (!db.data.shoppingList) {
      return res.status(404).json({ error: 'Keine Einkaufsliste vorhanden' });
    }

    const item = db.data.shoppingList.items.find(i => i.id === req.params.itemId);
    if (!item) {
      return res.status(404).json({ error: 'Artikel nicht gefunden' });
    }

    // Migrate old sources format if needed
    if (!item.amounts && item.sources) {
      item.amounts = item.sources.map(s => ({
        ...s,
        sourceType: s.manual ? 'manual' : 'meal'
      }));
      delete item.sources;
    }

    // Check if item has any meal sources
    const hasMealSources = (item.amounts || []).some(a => a.sourceType === 'meal');

    if (hasMealSources) {
      // Soft delete - mark as deleted but preserve sources
      item.deleted = true;

      // Add negative adjustment to zero out the total
      const currentAmounts = (item.amounts || []).filter(a => !a.deleted);
      const totals = calculateTotals(currentAmounts);

      if (totals.amount && totals.amount > 0) {
        item.amounts.push({
          sourceType: 'manual',
          amount: -totals.amount,
          unit: totals.unit,
          addedAt: new Date().toISOString(),
          isAdjustment: true,
          reason: 'deleted'
        });
      }

      // Recalculate (should be zero or empty)
      const newTotals = calculateTotals(item.amounts.filter(a => !a.deleted));
      item.displayAmount = newTotals.displayAmount || '0';
      item.amount = 0;
    } else {
      // No meal sources - can safely hard delete
      const itemIndex = db.data.shoppingList.items.findIndex(i => i.id === req.params.itemId);
      db.data.shoppingList.items.splice(itemIndex, 1);
    }

    db.data.shoppingList.updatedAt = new Date().toISOString();
    await db.write();

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting shopping item:', error);
    res.status(500).json({ error: 'Fehler beim Löschen des Artikels' });
  }
});

// Clear all items from shopping list
router.delete('/clear', async (req, res) => {
  try {
    await db.read();

    if (!db.data.shoppingList) {
      return res.status(404).json({ error: 'Keine Einkaufsliste vorhanden' });
    }

    db.data.shoppingList.items = [];
    db.data.shoppingList.updatedAt = new Date().toISOString();
    await db.write();

    res.status(204).send();
  } catch (error) {
    console.error('Error clearing shopping list:', error);
    res.status(500).json({ error: 'Fehler beim Leeren der Liste' });
  }
});

export default router;
