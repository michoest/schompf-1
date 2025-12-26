import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../services/database.js';

const router = Router();

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
  'g': { base: 'g', factor: 1 },
  'kg': { base: 'g', factor: 1000 },
  'gramm': { base: 'g', factor: 1 },
  'kilogramm': { base: 'g', factor: 1000 },
  // Volume
  'ml': { base: 'ml', factor: 1 },
  'l': { base: 'ml', factor: 1000 },
  'liter': { base: 'ml', factor: 1000 },
  'milliliter': { base: 'ml', factor: 1 },
  // Count
  'stück': { base: 'stück', factor: 1 },
  'stk': { base: 'stück', factor: 1 },
  'st': { base: 'stück', factor: 1 },
  // Others stay as-is
};

function normalizeUnit(amount, unit) {
  const lowerUnit = (unit || '').toLowerCase().trim();
  const norm = unitNormalization[lowerUnit];
  
  if (norm) {
    return {
      amount: amount * norm.factor,
      unit: norm.base
    };
  }
  
  return { amount, unit: unit || '' };
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
      optional: ing.optional || false
    });
  }
  
  // Add ingredients from sub-dishes
  for (const subDish of (dish.subDishes || [])) {
    const subIngredients = collectIngredients(
      subDish.dishId,
      servingsMultiplier * subDish.multiplier,
      db,
      visited
    );
    ingredients.push(...subIngredients);
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

    // Start with existing items (preserve manual items and checked state)
    const existingItems = new Map();
    for (const item of db.data.shoppingList.items) {
      const key = `${item.productId || item.productName}-${item.unit}`;
      existingItems.set(key, item);
    }

    // Get meals in date range that are NOT yet committed
    const meals = db.data.meals.filter(m =>
      m.date >= fromDate && m.date <= toDate && (!m.status || m.status === 'planned')
    );

    // Collect all ingredients with traceability
    const ingredientMap = new Map(); // productName -> aggregated data
    
    for (const meal of meals) {
      if (!meal.dishId) continue;
      
      const dish = db.data.dishes.find(d => d.id === meal.dishId);
      if (!dish || dish.type === 'eating_out') continue;
      
      const servingsMultiplier = meal.servings / dish.defaultServings;
      const ingredients = collectIngredients(meal.dishId, servingsMultiplier, db);
      
      for (const ing of ingredients) {
        const key = `${ing.productId || ing.productName}-${ing.unit}`;
        const normalized = normalizeUnit(ing.amount, ing.unit);
        
        if (!ingredientMap.has(key)) {
          // Find product for category info
          const product = ing.productId ? db.data.products.find(p => p.id === ing.productId) : null;

          ingredientMap.set(key, {
            productId: ing.productId,
            productName: ing.productName || product?.name || 'Unbekannt',
            totalAmount: 0,
            optionalAmount: 0,
            unit: normalized.unit,
            categoryId: product?.categoryId || null,
            freshnessDays: product?.freshnessDays || db.data.settings.defaultFreshnessDays,
            sources: [] // Track which meals this is for
          });
        }

        const entry = ingredientMap.get(key);
        if (ing.optional) {
          entry.optionalAmount += normalized.amount;
        } else {
          entry.totalAmount += normalized.amount;
        }
        entry.sources.push({
          mealId: meal.id,
          mealDate: meal.date,
          mealSlot: meal.slotName,
          dishId: meal.dishId,
          dishName: meal.dishName,
          amount: ing.amount,
          unit: ing.unit,
          optional: ing.optional || false
        });
      }
    }
    
    // Merge new ingredients with existing items
    const mergedItems = new Map(existingItems); // Start with existing items

    for (const [key, data] of ingredientMap) {
      if (mergedItems.has(key)) {
        // Item exists - merge amounts and sources
        const existing = mergedItems.get(key);
        const normalized = normalizeUnit(data.totalAmount, data.unit);
        const existingNormalized = normalizeUnit(existing.amount, existing.unit);
        const mergedAmount = existingNormalized.amount + normalized.amount;
        const formatted = formatAmount(mergedAmount, normalized.unit);

        existing.amount = formatted.amount;
        existing.unit = formatted.unit;
        existing.displayAmount = formatted.display;
        existing.sources = [...(existing.sources || []), ...data.sources];
        // Preserve checked state and other properties
      } else {
        // New item - add it
        const formatted = formatAmount(data.totalAmount, data.unit);
        const formattedOptional = data.optionalAmount > 0 ? formatAmount(data.optionalAmount, data.unit) : null;

        // Build display amount with optional portion
        let displayAmount = formatted.display;
        if (formattedOptional) {
          displayAmount = `${formatted.display} (optional + ${formattedOptional.display})`;
        }

        // Find category and vendor
        let category = null;
        let vendor = null;
        if (data.categoryId) {
          category = db.data.categories.find(c => c.id === data.categoryId);
          if (category) {
            vendor = db.data.vendors.find(v => v.id === category.vendorId);
          }
        }

        // Calculate freshness urgency and earliest purchase date
        const earliestUseDate = data.sources.reduce((min, s) => s.mealDate < min ? s.mealDate : min, data.sources[0]?.mealDate);

        // Calculate days from shopping date to earliest use
        const daysUntilUse = shoppingDate
          ? Math.ceil((new Date(earliestUseDate) - new Date(shoppingDate)) / (1000 * 60 * 60 * 24))
          : null;

        // Calculate earliest purchase date: earliest use date minus freshness days
        let earliestPurchaseDate = null;
        if (earliestUseDate && data.freshnessDays !== null) {
          const purchaseDate = new Date(earliestUseDate);
          purchaseDate.setDate(purchaseDate.getDate() - data.freshnessDays);
          earliestPurchaseDate = purchaseDate.toISOString().split('T')[0];
        }

        // Determine freshness status based on shopping date
        let freshnessStatus = 'ok';
        if (shoppingDate && earliestPurchaseDate) {
          // Compare shopping date with earliest purchase date
          if (shoppingDate < earliestPurchaseDate) {
            freshnessStatus = 'wait'; // Too early - won't stay fresh
          } else {
            freshnessStatus = 'ok'; // Can buy now
          }
        }

        mergedItems.set(key, {
          id: uuidv4(),
          productId: data.productId,
          productName: data.productName,
          amount: formatted.amount,
          unit: formatted.unit,
          displayAmount: displayAmount,
          optionalAmount: data.optionalAmount > 0 ? formattedOptional.amount : null,
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
          sources: data.sources,
          checked: false
        });
      }
    }

    // Convert to array and sort
    const items = Array.from(mergedItems.values());
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
      mealIds: meals.map(m => m.id) // IDs of uncommitted meals included in this update
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

    // Find category and vendor
    let category = null;
    let vendor = null;
    const catId = categoryId || product?.categoryId;
    if (catId) {
      category = db.data.categories.find(c => c.id === catId);
      if (category) {
        vendor = db.data.vendors.find(v => v.id === category.vendorId);
      }
    }

    const finalAmount = amount !== null && amount !== undefined ? amount : null;
    const finalUnit = unit || null;
    const formatted = formatAmount(finalAmount, finalUnit);

    const item = {
      id: uuidv4(),
      productId: product?.id || null,
      productName: product?.name || productName,
      amount: formatted.amount,
      unit: formatted.unit,
      displayAmount: formatted.display,
      categoryId: catId || null,
      categoryName: category?.name || null,
      categoryOrder: category?.order ?? 999,
      vendorId: vendor?.id || null,
      vendorName: vendor?.name || 'Sonstiges',
      vendorColor: vendor?.color || '#9CA3AF',
      freshnessDays: product?.freshnessDays || db.data.settings.defaultFreshnessDays,
      earliestUseDate: null,
      freshnessStatus: 'ok',
      sources: [{ manual: true, addedAt: new Date().toISOString() }],
      checked: false
    };

    // Add to shopping list and save
    db.data.shoppingList.items.push(item);
    db.data.shoppingList.updatedAt = new Date().toISOString();
    await db.write();

    res.status(201).json(item);
  } catch (error) {
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

// Update shopping item (for manually added items)
router.put('/item/:itemId', async (req, res) => {
  try {
    const { productName, amount, unit, categoryId } = req.body;
    if (!productName) {
      return res.status(400).json({ error: 'productName ist erforderlich' });
    }

    await db.read();

    if (!db.data.shoppingList) {
      return res.status(404).json({ error: 'Keine Einkaufsliste vorhanden' });
    }

    const item = db.data.shoppingList.items.find(i => i.id === req.params.itemId);
    if (!item) {
      return res.status(404).json({ error: 'Artikel nicht gefunden' });
    }

    // Only allow editing manually added items
    if (!item.sources?.some(s => s.manual)) {
      return res.status(403).json({ error: 'Nur manuell hinzugefügte Artikel können bearbeitet werden' });
    }

    // Try to find existing product
    let product = db.data.products.find(p =>
      p.name.toLowerCase() === productName.toLowerCase()
    );

    // Find category and vendor
    let category = null;
    let vendor = null;
    const catId = categoryId !== undefined ? categoryId : product?.categoryId;
    if (catId) {
      category = db.data.categories.find(c => c.id === catId);
      if (category) {
        vendor = db.data.vendors.find(v => v.id === category.vendorId);
      }
    }

    const finalAmount = amount !== null && amount !== undefined ? amount : null;
    const finalUnit = unit || null;
    const formatted = formatAmount(finalAmount, finalUnit);

    // Update item properties
    item.productId = product?.id || null;
    item.productName = product?.name || productName;
    item.amount = formatted.amount;
    item.unit = formatted.unit;
    item.displayAmount = formatted.display;
    item.categoryId = catId || null;
    item.categoryName = category?.name || null;
    item.categoryOrder = category?.order ?? 999;
    item.vendorId = vendor?.id || null;
    item.vendorName = vendor?.name || 'Sonstiges';
    item.vendorColor = vendor?.color || '#9CA3AF';
    item.freshnessDays = product?.freshnessDays || db.data.settings.defaultFreshnessDays;

    db.data.shoppingList.updatedAt = new Date().toISOString();
    await db.write();

    res.json(item);
  } catch (error) {
    console.error('Error updating shopping item:', error);
    res.status(500).json({ error: 'Fehler beim Aktualisieren des Artikels' });
  }
});

// Delete shopping item
router.delete('/item/:itemId', async (req, res) => {
  try {
    await db.read();

    if (!db.data.shoppingList) {
      return res.status(404).json({ error: 'Keine Einkaufsliste vorhanden' });
    }

    const itemIndex = db.data.shoppingList.items.findIndex(i => i.id === req.params.itemId);
    if (itemIndex === -1) {
      return res.status(404).json({ error: 'Artikel nicht gefunden' });
    }

    db.data.shoppingList.items.splice(itemIndex, 1);
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
