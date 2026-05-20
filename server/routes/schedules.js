import { Router } from 'express';
import db from '../db.js';
import { authMiddleware, adminOnly } from '../middleware/auth.js';

const router = Router();

// GET /api/schedules?year=2026&month=5
router.get('/', authMiddleware, async (req, res) => {
  const { year, month } = req.query;
  if (!year || !month) {
    return res.status(400).json({ error: 'Parameter year dan month wajib diisi' });
  }

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = `${year}-${String(month).padStart(2, '0')}-31`;

  try {
    const { rows: schedules } = await db.query(`
      SELECT s.*, e.name as employee_name, e.slot_position
      FROM schedules s
      JOIN employees e ON s.employee_id = e.id
      WHERE s.date >= $1 AND s.date <= $2 AND e.is_active = TRUE
      ORDER BY e.slot_position ASC, s.date ASC
    `, [startDate, endDate]);

    res.json(schedules);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/schedules/generate - Auto-generate schedule for a month
router.post('/generate', authMiddleware, adminOnly, async (req, res) => {
  const { year, month } = req.body;
  if (!year || !month) {
    return res.status(400).json({ error: 'Parameter year dan month wajib diisi' });
  }

  try {
    // Get pattern config
    const { rows: patternRows } = await db.query('SELECT config_json FROM pattern_config WHERE id = 1');
    const patternRow = patternRows[0];
    if (!patternRow) {
      return res.status(500).json({ error: 'Pattern config belum ada. Jalankan seed terlebih dahulu.' });
    }
    const pattern = JSON.parse(patternRow.config_json);

    // Get active employees
    const { rows: employees } = await db.query(
      'SELECT * FROM employees WHERE is_active = TRUE ORDER BY slot_position ASC'
    );

    if (employees.length === 0) {
      return res.status(400).json({ error: 'Tidak ada karyawan aktif' });
    }

    // Get holidays for this month
    const { rows: holidays } = await db.query(
      'SELECT * FROM holidays WHERE year = $1 AND month = $2',
      [parseInt(year), parseInt(month)]
    );
    const holidayMap = {};
    holidays.forEach(h => { holidayMap[h.date] = h; });

    // Get last workday counter from previous month to maintain continuity
    const prevMonth = month == 1 ? 12 : parseInt(month) - 1;
    const prevYear = month == 1 ? parseInt(year) - 1 : parseInt(year);
    const { rows: prevSchedulesRows } = await db.query(`
      SELECT s.date, s.schedule_type, e.slot_position
      FROM schedules s
      JOIN employees e ON s.employee_id = e.id
      WHERE s.date LIKE $1 AND e.slot_position = 1 AND e.is_active = TRUE
      ORDER BY s.date DESC
      LIMIT 1
    `, [`${prevYear}-${String(prevMonth).padStart(2, '0')}-%`]);
    const prevSchedules = prevSchedulesRows[0];

    // Determine starting cycle index
    let workdayCycleIndex = 0;
    if (prevSchedules) {
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
        const { rows: existingRows } = await db.query(
          'SELECT * FROM schedules WHERE employee_id = $1 AND date = $2 AND is_manual_override = TRUE',
          [employee.id, dateStr]
        );
        const existing = existingRows[0];

        if (existing) {
          // Keep manual override
          entries.push({
            employee_id: employee.id,
            date: dateStr,
            schedule_type: existing.schedule_type,
            is_manual_override: true,
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
          is_manual_override: false,
        });
      }

      if (isWorkday) {
        workdayCycleIndex++;
      } else {
        ocRotationIndex++;
      }
    }

    // Upsert all entries using a transaction
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      for (const item of entries) {
        await client.query(`
          INSERT INTO schedules (employee_id, date, schedule_type, is_manual_override, created_by)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT(employee_id, date)
          DO UPDATE SET
            schedule_type = CASE WHEN schedules.is_manual_override = TRUE THEN schedules.schedule_type ELSE excluded.schedule_type END,
            updated_at = CURRENT_TIMESTAMP
        `, [item.employee_id, item.date, item.schedule_type, item.is_manual_override, req.user.id]);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    // Return generated schedules
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month).padStart(2, '0')}-31`;
    const { rows: result } = await db.query(`
      SELECT s.*, e.name as employee_name, e.slot_position
      FROM schedules s
      JOIN employees e ON s.employee_id = e.id
      WHERE s.date >= $1 AND s.date <= $2 AND e.is_active = TRUE
      ORDER BY e.slot_position ASC, s.date ASC
    `, [startDate, endDate]);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/schedules/:id - Manual override a single cell
router.put('/:id', authMiddleware, adminOnly, async (req, res) => {
  const { id } = req.params;
  const { schedule_type } = req.body;

  if (schedule_type === undefined) {
    return res.status(400).json({ error: 'schedule_type wajib diisi' });
  }

  try {
    await db.query(`
      UPDATE schedules SET schedule_type = $1, is_manual_override = TRUE, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [schedule_type, id]);

    const { rows: updatedRows } = await db.query('SELECT * FROM schedules WHERE id = $1', [id]);
    res.json(updatedRows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/schedules/cell/:employeeId/:date - Upsert by employee + date
router.put('/cell/:employeeId/:date', authMiddleware, adminOnly, async (req, res) => {
  const { employeeId, date } = req.params;
  const { schedule_type } = req.body;

  if (schedule_type === undefined) {
    return res.status(400).json({ error: 'schedule_type wajib diisi' });
  }

  try {
    await db.query(`
      INSERT INTO schedules (employee_id, date, schedule_type, is_manual_override, created_by)
      VALUES ($1, $2, $3, TRUE, $4)
      ON CONFLICT(employee_id, date)
      DO UPDATE SET schedule_type = $5, is_manual_override = TRUE, updated_at = CURRENT_TIMESTAMP
    `, [employeeId, date, schedule_type, req.user.id, schedule_type]);

    const { rows: updatedRows } = await db.query(
      'SELECT * FROM schedules WHERE employee_id = $1 AND date = $2',
      [employeeId, date]
    );
    res.json(updatedRows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/schedules/month?year=&month= - Clear non-manual schedules
router.delete('/month', authMiddleware, adminOnly, async (req, res) => {
  const { year, month } = req.query;
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = `${year}-${String(month).padStart(2, '0')}-31`;

  try {
    await db.query(
      'DELETE FROM schedules WHERE date >= $1 AND date <= $2 AND is_manual_override = FALSE',
      [startDate, endDate]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
