import { Router } from 'express';
import db from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// GET /api/holidays?year=2026&month=5
router.get('/', authMiddleware, async (req, res) => {
  const { year, month } = req.query;
  if (!year) return res.status(400).json({ error: 'Parameter year wajib diisi' });

  try {
    // Check cache first
    let cachedRows = [];
    if (month) {
      const { rows } = await db.query('SELECT * FROM holidays WHERE year = $1 AND month = $2', [parseInt(year), parseInt(month)]);
      cachedRows = rows;
    } else {
      const { rows } = await db.query('SELECT * FROM holidays WHERE year = $1', [parseInt(year)]);
      cachedRows = rows;
    }

    if (cachedRows.length > 0) {
      return res.json(cachedRows);
    }

    // Fetch from API
    let url = `https://libur.deno.dev/api?year=${year}`;
    if (month) url += `&month=${month}`;

    const response = await fetch(url);
    if (!response.ok) throw new Error(`API returned ${response.status}`);

    const data = await response.json();

    // Cache results (use ON CONFLICT DO NOTHING for PostgreSQL)
    for (const item of data) {
      const d = new Date(item.date);
      await db.query(`
        INSERT INTO holidays (date, name, is_national_holiday, year, month)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (date) DO NOTHING
      `, [item.date, item.name, item.is_national_holiday ? true : false, d.getFullYear(), d.getMonth() + 1]);
    }

    // Return from cache (normalized format)
    let resultRows = [];
    if (month) {
      const { rows } = await db.query('SELECT * FROM holidays WHERE year = $1 AND month = $2', [parseInt(year), parseInt(month)]);
      resultRows = rows;
    } else {
      const { rows } = await db.query('SELECT * FROM holidays WHERE year = $1', [parseInt(year)]);
      resultRows = rows;
    }

    res.json(resultRows);
  } catch (err) {
    console.error('Holiday API error:', err.message);
    res.status(502).json({ error: 'Gagal mengambil data hari libur', details: err.message });
  }
});

export default router;
