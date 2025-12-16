import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../services/database.js';

const router = Router();

// Get all products
router.get('/', async (req, res) => {
  try {
    await db.read();
    let products = db.data.products;

    // Optional filtering
    if (req.query.categoryId) {
      products = products.filter(p => p.categoryId === req.query.categoryId);
    }
    if (req.query.search) {
      const search = req.query.search.toLowerCase();
      products = products.filter(p => p.name.toLowerCase().includes(search));
    }

    // Enrich products with category and vendor names
    const enrichedProducts = products.map(product => {
      const category = db.data.categories.find(c => c.id === product.categoryId);
      const vendor = category ? db.data.vendors.find(v => v.id === category.vendorId) : null;

      return {
        ...product,
        categoryName: category?.name || null,
        vendorName: vendor?.name || null,
        vendorColor: vendor?.color || null
      };
    });

    res.json(enrichedProducts);
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim Laden der Produkte' });
  }
});

// Get product by ID
router.get('/:id', async (req, res) => {
  try {
    await db.read();
    const product = db.data.products.find(p => p.id === req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Produkt nicht gefunden' });
    }

    // Enrich product with category and vendor names
    const category = db.data.categories.find(c => c.id === product.categoryId);
    const vendor = category ? db.data.vendors.find(v => v.id === category.vendorId) : null;

    const enrichedProduct = {
      ...product,
      categoryName: category?.name || null,
      vendorName: vendor?.name || null,
      vendorColor: vendor?.color || null
    };

    res.json(enrichedProduct);
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim Laden des Produkts' });
  }
});

// Create product
router.post('/', async (req, res) => {
  try {
    const { name, categoryId, defaultUnit, freshnessDays } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Name ist erforderlich' });
    }
    
    // Verify category exists if provided
    if (categoryId) {
      const category = db.data.categories.find(c => c.id === categoryId);
      if (!category) {
        return res.status(400).json({ error: 'Kategorie nicht gefunden' });
      }
    }
    
    const product = {
      id: uuidv4(),
      name,
      categoryId: categoryId || null,
      defaultUnit: defaultUnit || null,
      freshnessDays: freshnessDays ?? db.data.settings.defaultFreshnessDays,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    db.data.products.push(product);
    await db.write();
    res.status(201).json(product);
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim Erstellen des Produkts' });
  }
});

// Update product
router.put('/:id', async (req, res) => {
  try {
    await db.read();
    const index = db.data.products.findIndex(p => p.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Produkt nicht gefunden' });
    }
    
    const { name, categoryId, defaultUnit, freshnessDays } = req.body;
    
    // Verify category exists if changing
    if (categoryId && categoryId !== db.data.products[index].categoryId) {
      const category = db.data.categories.find(c => c.id === categoryId);
      if (!category) {
        return res.status(400).json({ error: 'Kategorie nicht gefunden' });
      }
    }
    
    db.data.products[index] = {
      ...db.data.products[index],
      name: name ?? db.data.products[index].name,
      categoryId: categoryId !== undefined ? categoryId : db.data.products[index].categoryId,
      defaultUnit: defaultUnit !== undefined ? defaultUnit : db.data.products[index].defaultUnit,
      freshnessDays: freshnessDays ?? db.data.products[index].freshnessDays,
      updatedAt: new Date().toISOString()
    };
    
    await db.write();
    res.json(db.data.products[index]);
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim Aktualisieren des Produkts' });
  }
});

// Delete product
router.delete('/:id', async (req, res) => {
  try {
    await db.read();
    const index = db.data.products.findIndex(p => p.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Produkt nicht gefunden' });
    }
    
    db.data.products.splice(index, 1);
    await db.write();
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim Löschen des Produkts' });
  }
});

export default router;
