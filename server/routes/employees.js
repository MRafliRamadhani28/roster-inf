import { Router } from 'express';
import db from '../db.js';
import { authMiddleware, adminOnly } from '../middleware/auth.js';

const router = Router();

// GET /api/employees
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM employees WHERE is_active = TRUE ORDER BY slot_position ASC'
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/employees/all (include inactive)
router.get('/all', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM employees ORDER BY slot_position ASC');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/employees
router.post('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { name, slot_position } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Nama karyawan wajib diisi' });
    }

    // Auto-assign slot_position if not provided
    let position = slot_position;
    if (!position) {
      const { rows: maxRows } = await db.query('SELECT MAX(slot_position) as max FROM employees WHERE is_active = TRUE');
      position = (maxRows[0].max || 0) + 1;
    }

    const { rows } = await db.query(
      'INSERT INTO employees (name, slot_position) VALUES ($1, $2) RETURNING id',
      [name, position]
    );

    res.status(201).json({
      id: rows[0].id,
      name,
      slot_position: position,
      is_active: true,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/employees/:id
router.put('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { name, slot_position, is_active } = req.body;
    const { id } = req.params;

    const { rows: empRows } = await db.query('SELECT * FROM employees WHERE id = $1', [id]);
    const employee = empRows[0];
    if (!employee) {
      return res.status(404).json({ error: 'Karyawan tidak ditemukan' });
    }

    await db.query(`
      UPDATE employees SET
        name = COALESCE($1, name),
        slot_position = COALESCE($2, slot_position),
        is_active = COALESCE($3, is_active)
      WHERE id = $4
    `, [name || null, slot_position || null, is_active !== undefined ? is_active : null, id]);

    const { rows: updatedRows } = await db.query('SELECT * FROM employees WHERE id = $1', [id]);
    res.json(updatedRows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/employees/:id (soft delete)
router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('UPDATE employees SET is_active = FALSE WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
