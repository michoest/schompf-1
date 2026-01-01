import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../services/database.js';

const router = Router();

// Get meals (with date range filter)
router.get('/', async (req, res) => {
  try {
    await db.read();
    let meals = db.data.meals;
    
    // Filter by date range
    if (req.query.from) {
      meals = meals.filter(m => m.date >= req.query.from);
    }
    if (req.query.to) {
      meals = meals.filter(m => m.date <= req.query.to);
    }
    
    // Sort by date and slot order
    meals.sort((a, b) => {
      if (a.date !== b.date) {
        return a.date.localeCompare(b.date);
      }
      return (a.slotOrder || 0) - (b.slotOrder || 0);
    });
    
    res.json(meals);
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim Laden der Mahlzeiten' });
  }
});

// Get meal by ID
router.get('/:id', async (req, res) => {
  try {
    await db.read();
    const meal = db.data.meals.find(m => m.id === req.params.id);
    if (!meal) {
      return res.status(404).json({ error: 'Mahlzeit nicht gefunden' });
    }
    res.json(meal);
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim Laden der Mahlzeit' });
  }
});

// Get meals for a specific date
router.get('/date/:date', async (req, res) => {
  try {
    await db.read();
    const meals = db.data.meals
      .filter(m => m.date === req.params.date)
      .sort((a, b) => (a.slotOrder || 0) - (b.slotOrder || 0));
    res.json(meals);
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim Laden der Mahlzeiten' });
  }
});

// Create meal
router.post('/', async (req, res) => {
  try {
    const { date, slotId, slotName, slotOrder, dishId, dishName, servings, notes, subDishes } = req.body;
    if (!date) {
      return res.status(400).json({ error: 'Datum ist erforderlich' });
    }

    // Verify dish exists if provided
    let dish = null;
    if (dishId) {
      dish = db.data.dishes.find(d => d.id === dishId);
      if (!dish) {
        return res.status(400).json({ error: 'Gericht nicht gefunden' });
      }
    }

    // Determine slot info
    const slot = db.data.settings.mealSlots.find(s => s.id === slotId);

    // Validate subdishes if provided
    const validatedSubDishes = (subDishes || []).map(sub => ({
      dishId: sub.dishId,
      scalingFactor: sub.scalingFactor || 1,
      optional: sub.optional || false
    }));

    const meal = {
      id: uuidv4(),
      date, // Format: YYYY-MM-DD
      slotId: slotId || null,
      slotName: slotName || slot?.name || 'Mahlzeit',
      slotOrder: slotOrder ?? slot?.order ?? 99,
      dishId: dishId || null,
      dishName: dishName || dish?.name || null,
      servings: servings || dish?.defaultServings || db.data.settings.defaultServings,
      notes: notes || null,
      subDishes: validatedSubDishes,
      status: 'planned', // planned | committed | prepared
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db.data.meals.push(meal);
    await db.write();
    res.status(201).json(meal);
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim Erstellen der Mahlzeit' });
  }
});

// Update meal
router.put('/:id', async (req, res) => {
  try {
    await db.read();
    const index = db.data.meals.findIndex(m => m.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Mahlzeit nicht gefunden' });
    }

    const { date, slotId, slotName, slotOrder, dishId, dishName, servings, notes, status, subDishes } = req.body;

    // Verify dish exists if changing
    let dish = null;
    if (dishId !== undefined) {
      if (dishId) {
        dish = db.data.dishes.find(d => d.id === dishId);
        if (!dish) {
          return res.status(400).json({ error: 'Gericht nicht gefunden' });
        }
      }
    } else if (db.data.meals[index].dishId) {
      dish = db.data.dishes.find(d => d.id === db.data.meals[index].dishId);
    }

    // Validate subdishes if provided
    let validatedSubDishes = db.data.meals[index].subDishes || [];
    if (subDishes !== undefined) {
      validatedSubDishes = subDishes.map(sub => ({
        dishId: sub.dishId,
        scalingFactor: sub.scalingFactor || 1,
        optional: sub.optional || false
      }));
    }

    db.data.meals[index] = {
      ...db.data.meals[index],
      date: date ?? db.data.meals[index].date,
      slotId: slotId !== undefined ? slotId : db.data.meals[index].slotId,
      slotName: slotName ?? db.data.meals[index].slotName,
      slotOrder: slotOrder ?? db.data.meals[index].slotOrder,
      dishId: dishId !== undefined ? dishId : db.data.meals[index].dishId,
      dishName: dishName !== undefined ? dishName : (dishId !== undefined ? (dish?.name || null) : db.data.meals[index].dishName),
      servings: servings ?? db.data.meals[index].servings,
      notes: notes !== undefined ? notes : db.data.meals[index].notes,
      subDishes: validatedSubDishes,
      status: status !== undefined ? status : (db.data.meals[index].status || db.data.meals[index].committed ? 'committed' : 'planned'),
      updatedAt: new Date().toISOString()
    };

    await db.write();
    res.json(db.data.meals[index]);
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim Aktualisieren der Mahlzeit' });
  }
});

// Delete meal
router.delete('/:id', async (req, res) => {
  try {
    await db.read();
    const index = db.data.meals.findIndex(m => m.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Mahlzeit nicht gefunden' });
    }
    
    db.data.meals.splice(index, 1);
    await db.write();
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim Löschen der Mahlzeit' });
  }
});

// Bulk create meals for a date range (for easy planning)
router.post('/bulk', async (req, res) => {
  try {
    const { meals } = req.body;
    if (!meals || !Array.isArray(meals)) {
      return res.status(400).json({ error: 'meals Array ist erforderlich' });
    }
    
    await db.read();
    const createdMeals = [];
    
    for (const mealData of meals) {
      const { date, slotId, slotName, slotOrder, dishId, servings, notes } = mealData;
      if (!date) continue;
      
      let dish = null;
      if (dishId) {
        dish = db.data.dishes.find(d => d.id === dishId);
      }
      
      const slot = db.data.settings.mealSlots.find(s => s.id === slotId);
      
      const meal = {
        id: uuidv4(),
        date,
        slotId: slotId || null,
        slotName: slotName || slot?.name || 'Mahlzeit',
        slotOrder: slotOrder ?? slot?.order ?? 99,
        dishId: dishId || null,
        dishName: dish?.name || null,
        servings: servings || dish?.defaultServings || db.data.settings.defaultServings,
        notes: notes || null,
        status: 'planned',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      db.data.meals.push(meal);
      createdMeals.push(meal);
    }
    
    await db.write();
    res.status(201).json(createdMeals);
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim Erstellen der Mahlzeiten' });
  }
});

// Commit meals (mark as added to shopping list)
router.post('/commit', async (req, res) => {
  try {
    const { mealIds } = req.body;
    if (!mealIds || !Array.isArray(mealIds)) {
      return res.status(400).json({ error: 'mealIds Array ist erforderlich' });
    }

    await db.read();
    const updatedMeals = [];

    for (const mealId of mealIds) {
      const index = db.data.meals.findIndex(m => m.id === mealId);
      if (index !== -1) {
        db.data.meals[index].status = 'committed';
        db.data.meals[index].updatedAt = new Date().toISOString();
        updatedMeals.push(db.data.meals[index]);
      }
    }

    await db.write();
    res.json({ success: true, updatedMeals });
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim Committen der Mahlzeiten' });
  }
});

// Mark meal as prepared
router.post('/:id/mark-prepared', async (req, res) => {
  try {
    await db.read();
    const index = db.data.meals.findIndex(m => m.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Mahlzeit nicht gefunden' });
    }

    db.data.meals[index].status = 'prepared';
    db.data.meals[index].updatedAt = new Date().toISOString();

    await db.write();
    res.json(db.data.meals[index]);
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim Markieren der Mahlzeit als zubereitet' });
  }
});

// Reset meal to committed status
router.post('/:id/reset-to-committed', async (req, res) => {
  try {
    await db.read();
    const index = db.data.meals.findIndex(m => m.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Mahlzeit nicht gefunden' });
    }

    db.data.meals[index].status = 'committed';
    db.data.meals[index].updatedAt = new Date().toISOString();

    await db.write();
    res.json(db.data.meals[index]);
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim Zurücksetzen der Mahlzeit' });
  }
});

export default router;
