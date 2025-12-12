import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../services/database.js';

const router = Router();

// Get all vendors
router.get('/', async (req, res) => {
  try {
    await db.read();
    res.json(db.data.vendors);
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim Laden der Händler' });
  }
});

// Get vendor by ID
router.get('/:id', async (req, res) => {
  try {
    await db.read();
    const vendor = db.data.vendors.find(v => v.id === req.params.id);
    if (!vendor) {
      return res.status(404).json({ error: 'Händler nicht gefunden' });
    }
    res.json(vendor);
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim Laden des Händlers' });
  }
});

// Create vendor
router.post('/', async (req, res) => {
  try {
    const { name, color } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Name ist erforderlich' });
    }
    
    const vendor = {
      id: uuidv4(),
      name,
      color: color || '#10B981',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    db.data.vendors.push(vendor);
    await db.write();
    res.status(201).json(vendor);
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim Erstellen des Händlers' });
  }
});

// Update vendor
router.put('/:id', async (req, res) => {
  try {
    await db.read();
    const index = db.data.vendors.findIndex(v => v.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Händler nicht gefunden' });
    }
    
    const { name, color } = req.body;
    db.data.vendors[index] = {
      ...db.data.vendors[index],
      name: name ?? db.data.vendors[index].name,
      color: color ?? db.data.vendors[index].color,
      updatedAt: new Date().toISOString()
    };
    
    await db.write();
    res.json(db.data.vendors[index]);
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim Aktualisieren des Händlers' });
  }
});

// Delete vendor
router.delete('/:id', async (req, res) => {
  try {
    await db.read();
    const index = db.data.vendors.findIndex(v => v.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Händler nicht gefunden' });
    }
    
    db.data.vendors.splice(index, 1);
    await db.write();
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim Löschen des Händlers' });
  }
});

export default router;
