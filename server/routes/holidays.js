import { Router } from 'express';
import db from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

const HOLIDAY_NAMES_ID = {
  "Ascension Day of Jesus Christ": "Kenaikan Isa Almasih",
  "Ascension of the Prophet Muhammad": "Isra Mikraj Nabi Muhammad SAW",
  "Bali's Day of Silence and Hindu New Year (Nyepi)": "Hari Raya Nyepi (Tahun Baru Saka)",
  "Boxing Day": "Cuti Bersama Natal",
  "Chinese New Year Joint Holiday": "Cuti Bersama Tahun Baru Imlek",
  "Chinese New Year's Day": "Tahun Baru Imlek",
  "Christmas Day": "Hari Raya Natal",
  "Christmas Eve Joint Holiday": "Cuti Bersama Natal",
  "Day off for Maulid Nabi Muhammad": "Cuti Bersama Maulid Nabi Muhammad SAW",
  "Easter Sunday": "Hari Paskah",
  "Election Day": "Hari Pemungutan Suara",
  "Good Friday": "Wafat Isa Almasih",
  "Idul Adha": "Hari Raya Idul Adha",
  "Idul Fitri": "Hari Raya Idul Fitri",
  "Idul Fitri Holiday": "Hari Raya Idul Fitri",
  "Idul Fitri Joint Holiday": "Cuti Bersama Idul Fitri",
  "Indonesian Independence Day": "Hari Kemerdekaan Republik Indonesia",
  "Indonesian Independence Day observed": "Hari Kemerdekaan Republik Indonesia",
  "International Labor Day": "Hari Buruh Internasional",
  "Joint Holiday (Cuti Bersama)": "Cuti Bersama",
  "Joint Holiday after Ascension Day": "Cuti Bersama Kenaikan Isa Almasih",
  "Joint Holiday for Bali's Day of Silence and Hindu New Year (Nyepi)": "Cuti Bersama Hari Raya Nyepi",
  "Joint Holiday for Idul Adha": "Cuti Bersama Idul Adha",
  "Joint Holiday for Maulid Nabi Muhammad (The Prophet Muhammad's Birthday)": "Cuti Bersama Maulid Nabi Muhammad SAW",
  "Joint Holiday for Waisak Day": "Cuti Bersama Hari Raya Waisak",
  "Maulid Nabi Muhammad": "Maulid Nabi Muhammad SAW",
  "Muharram / Islamic New Year": "Tahun Baru Islam 1 Muharram",
  "Muharram / Islamic New Year Holiday": "Tahun Baru Islam 1 Muharram",
  "New Year's Day": "Tahun Baru Masehi",
  "Pancasila Day": "Hari Lahir Pancasila",
  "Waisak Day (Buddha's Anniversary)": "Hari Raya Waisak",
};

function localizeName(name) {
  const base = name.replace(' (Tentative Date)', '').trim();
  return HOLIDAY_NAMES_ID[base] || base;
}

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
    let url = `https://use.api.co.id/holidays/indonesia/?year=${year}`;
    if (month) url += `&month=${month}`;

    const response = await fetch(url, {
      headers: { 'x-api-co-id': process.env.HOLIDAY_API_KEY || '' }
    });
    if (!response.ok) throw new Error(`API returned ${response.status}`);

    const json = await response.json();
    if (!json.is_success) throw new Error(json.message || 'API returned is_success=false');

    const data = (json.data || []).filter(item => item.is_holiday || item.is_joint_holiday);

    // Cache results (use ON CONFLICT DO NOTHING for PostgreSQL)
    for (const item of data) {
      const [y, m] = item.date.split('-');
      await db.query(`
        INSERT INTO holidays (date, name, is_national_holiday, year, month)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (date) DO UPDATE SET name = EXCLUDED.name, is_national_holiday = EXCLUDED.is_national_holiday
      `, [item.date, localizeName(item.name), item.is_holiday === true, parseInt(y), parseInt(m)]);
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
