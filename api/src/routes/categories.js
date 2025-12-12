import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../services/database.js';

const router = Router();

// Get all categories (optionally filtered by vendor)
router.get('/', async (req, res) => {
  try {
    await db.read();
    let categories = db.data.categories;
    
    if (req.query.vendorId) {
      categories = categories.filter(c => c.vendorId === req.query.vendorId);
    }
    
    // Sort by vendor, then by order within vendor
    categories.sort((a, b) => {
      if (a.vendorId !== b.vendorId) {
        return a.vendorId.localeCompare(b.vendorId);
      }
      return (a.order || 0) - (b.order || 0);
    });
    
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim Laden der Kategorien' });
  }
});

// Get category by ID
router.get('/:id', async (req, res) => {
  try {
    await db.read();
    const category = db.data.categories.find(c => c.id === req.params.id);
    if (!category) {
      return res.status(404).json({ error: 'Kategorie nicht gefunden' });
    }
    res.json(category);
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim Laden der Kategorie' });
  }
});

// Create category
router.post('/', async (req, res) => {
  try {
    const { name, vendorId, order } = req.body;
    if (!name || !vendorId) {
      return res.status(400).json({ error: 'Name und Händler sind erforderlich' });
    }
    
    // Verify vendor exists
    const vendor = db.data.vendors.find(v => v.id === vendorId);
    if (!vendor) {
      return res.status(400).json({ error: 'Händler nicht gefunden' });
    }
    
    // Calculate order if not provided
    const vendorCategories = db.data.categories.filter(c => c.vendorId === vendorId);
    const maxOrder = vendorCategories.reduce((max, c) => Math.max(max, c.order || 0), -1);
    
    const category = {
      id: uuidv4(),
      name,
      vendorId,
      order: order ?? maxOrder + 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    db.data.categories.push(category);
    await db.write();
    res.status(201).json(category);
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim Erstellen der Kategorie' });
  }
});

// Update category
router.put('/:id', async (req, res) => {
  try {
    await db.read();
    const index = db.data.categories.findIndex(c => c.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Kategorie nicht gefunden' });
    }
    
    const { name, vendorId, order } = req.body;
    
    // If vendorId is changing, verify new vendor exists
    if (vendorId && vendorId !== db.data.categories[index].vendorId) {
      const vendor = db.data.vendors.find(v => v.id === vendorId);
      if (!vendor) {
        return res.status(400).json({ error: 'Händler nicht gefunden' });
      }
    }
    
    db.data.categories[index] = {
      ...db.data.categories[index],
      name: name ?? db.data.categories[index].name,
      vendorId: vendorId ?? db.data.categories[index].vendorId,
      order: order ?? db.data.categories[index].order,
      updatedAt: new Date().toISOString()
    };
    
    await db.write();
    res.json(db.data.categories[index]);
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim Aktualisieren der Kategorie' });
  }
});

// Reorder categories within a vendor
router.post('/reorder', async (req, res) => {
  try {
    const { vendorId, categoryIds } = req.body;
    if (!vendorId || !categoryIds || !Array.isArray(categoryIds)) {
      return res.status(400).json({ error: 'vendorId und categoryIds sind erforderlich' });
    }
    
    await db.read();
    
    categoryIds.forEach((id, index) => {
      const catIndex = db.data.categories.findIndex(c => c.id === id && c.vendorId === vendorId);
      if (catIndex !== -1) {
        db.data.categories[catIndex].order = index;
        db.data.categories[catIndex].updatedAt = new Date().toISOString();
      }
    });
    
    await db.write();
    
    const updatedCategories = db.data.categories
      .filter(c => c.vendorId === vendorId)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    
    res.json(updatedCategories);
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim Sortieren der Kategorien' });
  }
});

// Delete category
router.delete('/:id', async (req, res) => {
  try {
    await db.read();
    const index = db.data.categories.findIndex(c => c.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Kategorie nicht gefunden' });
    }
    
    db.data.categories.splice(index, 1);
    await db.write();
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim Löschen der Kategorie' });
  }
});

export default router;
