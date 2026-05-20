import { Router } from 'express';
import db from '../db.js';
import { authMiddleware, adminOnly } from '../middleware/auth.js';

const router = Router();

// GET /api/employees
router.get('/', authMiddleware, (req, res) => {
  const employees = db.prepare(
    'SELECT * FROM employees WHERE is_active = 1 ORDER BY slot_position ASC'
  ).all();
  res.json(employees);
});

// GET /api/employees/all (include inactive)
router.get('/all', authMiddleware, adminOnly, (req, res) => {
  const employees = db.prepare('SELECT * FROM employees ORDER BY slot_position ASC').all();
  res.json(employees);
});

// POST /api/employees
router.post('/', authMiddleware, adminOnly, (req, res) => {
  const { name, slot_position } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Nama karyawan wajib diisi' });
  }

  // Auto-assign slot_position if not provided
  let position = slot_position;
  if (!position) {
    const max = db.prepare('SELECT MAX(slot_position) as max FROM employees WHERE is_active = 1').get();
    position = (max.max || 0) + 1;
  }

  const result = db.prepare(
    'INSERT INTO employees (name, slot_position) VALUES (?, ?)'
  ).run(name, position);

  res.status(201).json({
    id: result.lastInsertRowid,
    name,
    slot_position: position,
    is_active: 1,
  });
});

// PUT /api/employees/:id
router.put('/:id', authMiddleware, adminOnly, (req, res) => {
  const { name, slot_position, is_active } = req.body;
  const { id } = req.params;

  const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(id);
  if (!employee) {
    return res.status(404).json({ error: 'Karyawan tidak ditemukan' });
  }

  db.prepare(`
    UPDATE employees SET
      name = COALESCE(?, name),
      slot_position = COALESCE(?, slot_position),
      is_active = COALESCE(?, is_active)
    WHERE id = ?
  `).run(name || null, slot_position || null, is_active !== undefined ? is_active : null, id);

  const updated = db.prepare('SELECT * FROM employees WHERE id = ?').get(id);
  res.json(updated);
});

// DELETE /api/employees/:id (soft delete)
router.delete('/:id', authMiddleware, adminOnly, (req, res) => {
  const { id } = req.params;
  db.prepare('UPDATE employees SET is_active = 0 WHERE id = ?').run(id);
  res.json({ success: true });
});

export default router;
