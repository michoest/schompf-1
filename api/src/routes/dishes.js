import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../services/database.js';

const router = Router();

// Get all dishes
router.get('/', async (req, res) => {
  try {
    await db.read();
    let dishes = db.data.dishes;
    
    // Optional filtering
    if (req.query.search) {
      const search = req.query.search.toLowerCase();
      dishes = dishes.filter(d => d.name.toLowerCase().includes(search));
    }
    if (req.query.type) {
      dishes = dishes.filter(d => d.type === req.query.type);
    }
    
    res.json(dishes);
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim Laden der Gerichte' });
  }
});

// Get dish by ID
router.get('/:id', async (req, res) => {
  try {
    await db.read();
    const dish = db.data.dishes.find(d => d.id === req.params.id);
    if (!dish) {
      return res.status(404).json({ error: 'Gericht nicht gefunden' });
    }
    res.json(dish);
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim Laden des Gerichts' });
  }
});

// Create dish
router.post('/', async (req, res) => {
  try {
    const { name, recipeUrl, ingredients, defaultServings, type, subDishes } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Name ist erforderlich' });
    }
    
    // Validate ingredients if provided
    const validatedIngredients = (ingredients || []).map(ing => ({
      id: uuidv4(),
      productId: ing.productId || null,
      productName: ing.productName || '',
      amount: ing.amount || 0,
      unit: ing.unit || '',
      optional: ing.optional || false
    }));
    
    // Validate sub-dishes if provided
    const validatedSubDishes = (subDishes || []).map(sub => ({
      dishId: sub.dishId,
      multiplier: sub.multiplier || 1
    }));
    
    const dish = {
      id: uuidv4(),
      name,
      recipeUrl: recipeUrl || null,
      ingredients: validatedIngredients,
      defaultServings: defaultServings || db.data.settings.defaultServings,
      type: type || 'dish', // 'dish', 'eating_out', 'placeholder'
      subDishes: validatedSubDishes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    db.data.dishes.push(dish);
    await db.write();
    res.status(201).json(dish);
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim Erstellen des Gerichts' });
  }
});

// Update dish
router.put('/:id', async (req, res) => {
  try {
    await db.read();
    const index = db.data.dishes.findIndex(d => d.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Gericht nicht gefunden' });
    }
    
    const { name, recipeUrl, ingredients, defaultServings, type, subDishes } = req.body;
    
    // Validate ingredients if provided
    let validatedIngredients = db.data.dishes[index].ingredients;
    if (ingredients !== undefined) {
      validatedIngredients = ingredients.map(ing => ({
        id: ing.id || uuidv4(),
        productId: ing.productId || null,
        productName: ing.productName || '',
        amount: ing.amount || 0,
        unit: ing.unit || '',
        optional: ing.optional || false
      }));
    }
    
    // Validate sub-dishes if provided
    let validatedSubDishes = db.data.dishes[index].subDishes || [];
    if (subDishes !== undefined) {
      validatedSubDishes = subDishes.map(sub => ({
        dishId: sub.dishId,
        multiplier: sub.multiplier || 1
      }));
    }
    
    db.data.dishes[index] = {
      ...db.data.dishes[index],
      name: name ?? db.data.dishes[index].name,
      recipeUrl: recipeUrl !== undefined ? recipeUrl : db.data.dishes[index].recipeUrl,
      ingredients: validatedIngredients,
      defaultServings: defaultServings ?? db.data.dishes[index].defaultServings,
      type: type ?? db.data.dishes[index].type,
      subDishes: validatedSubDishes,
      updatedAt: new Date().toISOString()
    };
    
    await db.write();
    res.json(db.data.dishes[index]);
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim Aktualisieren des Gerichts' });
  }
});

// Delete dish
router.delete('/:id', async (req, res) => {
  try {
    await db.read();
    const index = db.data.dishes.findIndex(d => d.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Gericht nicht gefunden' });
    }
    
    db.data.dishes.splice(index, 1);
    await db.write();
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim Löschen des Gerichts' });
  }
});

export default router;
