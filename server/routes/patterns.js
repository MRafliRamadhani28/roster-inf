import { Router } from 'express';
import db from '../db.js';
import { authMiddleware, adminOnly } from '../middleware/auth.js';

const router = Router();

// GET /api/patterns
router.get('/', authMiddleware, (req, res) => {
  const row = db.prepare('SELECT config_json, updated_at FROM pattern_config WHERE id = 1').get();
  if (!row) return res.status(404).json({ error: 'Pattern config belum ada' });
  res.json({ config: JSON.parse(row.config_json), updated_at: row.updated_at });
});

// PUT /api/patterns
router.put('/', authMiddleware, adminOnly, (req, res) => {
  const { config } = req.body;
  if (!config || !config.scheduleTypes || !config.workdayPattern || !config.nonWorkdayPattern) {
    return res.status(400).json({ error: 'Config tidak valid' });
  }
  db.prepare(`
    INSERT INTO pattern_config (id, config_json, updated_by, updated_at)
    VALUES (1, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET config_json = excluded.config_json, updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP
  `).run(JSON.stringify(config), req.user.id);
  res.json({ success: true, config });
});

export default router;
