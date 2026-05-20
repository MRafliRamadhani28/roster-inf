import { Router } from 'express';
import db from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// GET /api/holidays?year=2026&month=5
router.get('/', authMiddleware, async (req, res) => {
  const { year, month } = req.query;
  if (!year) return res.status(400).json({ error: 'Parameter year wajib diisi' });

  // Check cache first
  const cached = month
    ? db.prepare('SELECT * FROM holidays WHERE year = ? AND month = ?').all(parseInt(year), parseInt(month))
    : db.prepare('SELECT * FROM holidays WHERE year = ?').all(parseInt(year));

  if (cached.length > 0) {
    return res.json(cached);
  }

  // Fetch from API
  try {
    let url = `https://libur.deno.dev/api?year=${year}`;
    if (month) url += `&month=${month}`;

    const response = await fetch(url);
    if (!response.ok) throw new Error(`API returned ${response.status}`);

    const data = await response.json();

    // Cache results
    const insert = db.prepare(`
      INSERT OR IGNORE INTO holidays (date, name, is_national_holiday, year, month)
      VALUES (?, ?, ?, ?, ?)
    `);
    const insertMany = db.transaction((items) => {
      for (const item of items) {
        const d = new Date(item.date);
        insert.run(item.date, item.name, item.is_national_holiday ? 1 : 0, d.getFullYear(), d.getMonth() + 1);
      }
    });
    insertMany(data);

    // Return from cache (normalized format)
    const result = month
      ? db.prepare('SELECT * FROM holidays WHERE year = ? AND month = ?').all(parseInt(year), parseInt(month))
      : db.prepare('SELECT * FROM holidays WHERE year = ?').all(parseInt(year));

    res.json(result);
  } catch (err) {
    console.error('Holiday API error:', err.message);
    res.status(502).json({ error: 'Gagal mengambil data hari libur', details: err.message });
  }
});

export default router;
