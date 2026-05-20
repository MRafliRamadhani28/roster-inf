import { Router } from 'express';
import db from '../db.js';
import { authMiddleware, adminOnly } from '../middleware/auth.js';

const router = Router();

// GET /api/schedules?year=2026&month=5
router.get('/', authMiddleware, (req, res) => {
  const { year, month } = req.query;
  if (!year || !month) {
    return res.status(400).json({ error: 'Parameter year dan month wajib diisi' });
  }

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = `${year}-${String(month).padStart(2, '0')}-31`;

  const schedules = db.prepare(`
    SELECT s.*, e.name as employee_name, e.slot_position
    FROM schedules s
    JOIN employees e ON s.employee_id = e.id
    WHERE s.date >= ? AND s.date <= ? AND e.is_active = 1
    ORDER BY e.slot_position ASC, s.date ASC
  `).all(startDate, endDate);

  res.json(schedules);
});

// POST /api/schedules/generate - Auto-generate schedule for a month
router.post('/generate', authMiddleware, adminOnly, (req, res) => {
  const { year, month } = req.body;
  if (!year || !month) {
    return res.status(400).json({ error: 'Parameter year dan month wajib diisi' });
  }

  // Get pattern config
  const patternRow = db.prepare('SELECT config_json FROM pattern_config WHERE id = 1').get();
  if (!patternRow) {
    return res.status(500).json({ error: 'Pattern config belum ada. Jalankan seed terlebih dahulu.' });
  }
  const pattern = JSON.parse(patternRow.config_json);

  // Get active employees
  const employees = db.prepare(
    'SELECT * FROM employees WHERE is_active = 1 ORDER BY slot_position ASC'
  ).all();

  if (employees.length === 0) {
    return res.status(400).json({ error: 'Tidak ada karyawan aktif' });
  }

  // Get holidays for this month
  const holidays = db.prepare(
    'SELECT * FROM holidays WHERE year = ? AND month = ?'
  ).all(parseInt(year), parseInt(month));
  const holidayMap = {};
  holidays.forEach(h => { holidayMap[h.date] = h; });

  // Get last workday counter from previous month to maintain continuity
  const prevMonth = month == 1 ? 12 : parseInt(month) - 1;
  const prevYear = month == 1 ? parseInt(year) - 1 : parseInt(year);
  const prevSchedules = db.prepare(`
    SELECT s.date, s.schedule_type, e.slot_position
    FROM schedules s
    JOIN employees e ON s.employee_id = e.id
    WHERE s.date LIKE ? AND e.slot_position = 1 AND e.is_active = 1
    ORDER BY s.date DESC
    LIMIT 1
  `).get(`${prevYear}-${String(prevMonth).padStart(2, '0')}-%`);

  // Determine starting cycle index
  let workdayCycleIndex = 0;
  if (prevSchedules) {
    // If last schedule of slot 1 was A1, next should be A (index 1), and vice versa
    const lastType = prevSchedules.schedule_type;
    const slot1Cycle = pattern.workdayPattern.slots.find(s => s.position === 1)?.cycle || ['A1', 'A'];
    const lastIdx = slot1Cycle.indexOf(lastType);
    if (lastIdx !== -1) {
      workdayCycleIndex = (lastIdx + 1) % pattern.workdayPattern.cycleLength;
    }
  }

  // OC rotation counter for non-workdays
  let ocRotationIndex = 0;

  // Generate days of the month
  const daysInMonth = new Date(parseInt(year), parseInt(month), 0).getDate();
  const entries = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayOfWeek = new Date(parseInt(year), parseInt(month) - 1, day).getDay(); // 0=Sun, 6=Sat
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isHoliday = !!holidayMap[dateStr];
    const isWorkday = !isWeekend && !isHoliday;

    for (const employee of employees) {
      // Check if there's a manual override
      const existing = db.prepare(
        'SELECT * FROM schedules WHERE employee_id = ? AND date = ? AND is_manual_override = 1'
      ).get(employee.id, dateStr);

      if (existing) {
        // Keep manual override
        entries.push({
          employee_id: employee.id,
          date: dateStr,
          schedule_type: existing.schedule_type,
          is_manual_override: 1,
        });
        continue;
      }

      let scheduleType = '';

      if (isWorkday) {
        // Find slot config for this employee
        const slotConfig = pattern.workdayPattern.slots.find(s => s.position === employee.slot_position);
        if (slotConfig) {
          const cycleIdx = workdayCycleIndex % pattern.workdayPattern.cycleLength;
          scheduleType = slotConfig.cycle[cycleIdx] || 'A';
        } else {
          scheduleType = 'A';
        }
      } else {
        // Non-workday: assign OC and BT
        const ocSlots = pattern.nonWorkdayPattern.ocSlots || [1, 2];
        const btSlot = pattern.nonWorkdayPattern.btSlot || 3;

        if (employee.slot_position === btSlot) {
          scheduleType = 'BT';
        } else if (ocSlots.includes(employee.slot_position)) {
          // Determine which OC slot is active this non-workday
          const ocIdx = ocRotationIndex % ocSlots.length;
          if (employee.slot_position === ocSlots[ocIdx]) {
            scheduleType = 'OC';
          } else {
            scheduleType = '';
          }
        } else {
          scheduleType = '';
        }
      }

      entries.push({
        employee_id: employee.id,
        date: dateStr,
        schedule_type: scheduleType,
        is_manual_override: 0,
      });
    }

    if (isWorkday) {
      workdayCycleIndex++;
    } else {
      ocRotationIndex++;
    }
  }

  // Upsert all entries
  const upsert = db.prepare(`
    INSERT INTO schedules (employee_id, date, schedule_type, is_manual_override, created_by)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(employee_id, date)
    DO UPDATE SET
      schedule_type = CASE WHEN is_manual_override = 1 THEN schedule_type ELSE excluded.schedule_type END,
      updated_at = CURRENT_TIMESTAMP
  `);

  const insertMany = db.transaction((items) => {
    for (const item of items) {
      upsert.run(item.employee_id, item.date, item.schedule_type, item.is_manual_override, req.user.id);
    }
  });

  insertMany(entries);

  // Return generated schedules
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = `${year}-${String(month).padStart(2, '0')}-31`;
  const result = db.prepare(`
    SELECT s.*, e.name as employee_name, e.slot_position
    FROM schedules s
    JOIN employees e ON s.employee_id = e.id
    WHERE s.date >= ? AND s.date <= ? AND e.is_active = 1
    ORDER BY e.slot_position ASC, s.date ASC
  `).all(startDate, endDate);

  res.json(result);
});

// PUT /api/schedules/:id - Manual override a single cell
router.put('/:id', authMiddleware, adminOnly, (req, res) => {
  const { id } = req.params;
  const { schedule_type } = req.body;

  if (schedule_type === undefined) {
    return res.status(400).json({ error: 'schedule_type wajib diisi' });
  }

  db.prepare(`
    UPDATE schedules SET schedule_type = ?, is_manual_override = 1, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(schedule_type, id);

  const updated = db.prepare('SELECT * FROM schedules WHERE id = ?').get(id);
  res.json(updated);
});

// PUT /api/schedules/cell/:employeeId/:date - Upsert by employee + date
router.put('/cell/:employeeId/:date', authMiddleware, adminOnly, (req, res) => {
  const { employeeId, date } = req.params;
  const { schedule_type } = req.body;

  if (schedule_type === undefined) {
    return res.status(400).json({ error: 'schedule_type wajib diisi' });
  }

  db.prepare(`
    INSERT INTO schedules (employee_id, date, schedule_type, is_manual_override, created_by)
    VALUES (?, ?, ?, 1, ?)
    ON CONFLICT(employee_id, date)
    DO UPDATE SET schedule_type = ?, is_manual_override = 1, updated_at = CURRENT_TIMESTAMP
  `).run(employeeId, date, schedule_type, req.user.id, schedule_type);

  const updated = db.prepare(
    'SELECT * FROM schedules WHERE employee_id = ? AND date = ?'
  ).get(employeeId, date);
  res.json(updated);
});

// DELETE /api/schedules/month?year=&month= - Clear non-manual schedules
router.delete('/month', authMiddleware, adminOnly, (req, res) => {
  const { year, month } = req.query;
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = `${year}-${String(month).padStart(2, '0')}-31`;

  db.prepare(
    'DELETE FROM schedules WHERE date >= ? AND date <= ? AND is_manual_override = 0'
  ).run(startDate, endDate);

  res.json({ success: true });
});

export default router;
