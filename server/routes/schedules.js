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

    // Fetch ALL manual overrides for the month to avoid querying in loop
    const startDateStr = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDateStr = `${year}-${String(month).padStart(2, '0')}-31`;
    const { rows: manualOverridesRows } = await db.query(
      'SELECT employee_id, date, schedule_type FROM schedules WHERE date >= $1 AND date <= $2 AND is_manual_override = TRUE',
      [startDateStr, endDateStr]
    );
    const manualOverridesMap = {};
    for (const row of manualOverridesRows) {
      manualOverridesMap[`${row.employee_id}_${row.date}`] = row.schedule_type;
    }

    // Get last workday counter from previous month to maintain continuity
    const prevMonth = month == 1 ? 12 : parseInt(month) - 1;
    const prevYear = month == 1 ? parseInt(year) - 1 : parseInt(year);
    
    // Fetch last day's schedules of the previous month for ALL employees
    const { rows: prevSchedulesRows } = await db.query(`
      SELECT s.date, s.schedule_type, e.id as employee_id, e.slot_position
      FROM schedules s
      JOIN employees e ON s.employee_id = e.id
      WHERE s.date LIKE $1 AND e.is_active = TRUE
      ORDER BY s.date DESC
    `, [`${prevYear}-${String(prevMonth).padStart(2, '0')}-%`]);

    let yesterdayScheduleMap = {};
    let prevLastDate = null;
    let lastHolidaySchedule = null;
    const prevMonthDays = {};

    if (prevSchedulesRows.length > 0) {
      prevLastDate = prevSchedulesRows[0].date;
      for (const row of prevSchedulesRows) {
        if (row.date === prevLastDate) {
          yesterdayScheduleMap[row.employee_id] = row.schedule_type;
        }
        if (!prevMonthDays[row.date]) prevMonthDays[row.date] = {};
        prevMonthDays[row.date][row.employee_id] = row.schedule_type;
      }

      // Find the last holiday's schedule to carry over the OC rotation
      const sortedDates = Object.keys(prevMonthDays).sort((a, b) => b.localeCompare(a));
      for (const d of sortedDates) {
        const map = prevMonthDays[d];
        if (Object.values(map).includes('OC') || Object.values(map).includes('BT')) {
          lastHolidaySchedule = map;
          break;
        }
      }
    }

    // Determine starting cycle index from slot 1
    let workdayCycleIndex = 0;
    const slot1Employee = employees.find(e => e.slot_position === 1);
    if (slot1Employee && yesterdayScheduleMap[slot1Employee.id]) {
      const lastType = yesterdayScheduleMap[slot1Employee.id];
      const slot1Cycle = pattern.workdayPattern.slots.find(s => s.position === 1)?.cycle || ['A1', 'A'];
      const lastIdx = slot1Cycle.indexOf(lastType);
      if (lastIdx !== -1) {
        workdayCycleIndex = (lastIdx + 1) % pattern.workdayPattern.cycleLength;
      }
    }

    // OC rotation state
    let ocRotationIndex = 0;
    let lastOC_empId = null;
    if (lastHolidaySchedule) {
      const foundId = Object.keys(lastHolidaySchedule).find(id => lastHolidaySchedule[id] === 'OC');
      if (foundId) lastOC_empId = parseInt(foundId);
    }

    // Generate days of the month
    const daysInMonth = new Date(parseInt(year), parseInt(month), 0).getDate();
    const entries = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayOfWeek = new Date(parseInt(year), parseInt(month) - 1, day).getDay(); // 0=Sun, 6=Sat
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const isHoliday = !!holidayMap[dateStr];
      const isWorkday = !isWeekend && !isHoliday;

      let todayScheduleMap = {};

      if (isWorkday) {
        for (const employee of employees) {
          const overrideType = manualOverridesMap[`${employee.id}_${dateStr}`];
          if (overrideType !== undefined) {
             todayScheduleMap[employee.id] = overrideType;
          } else {
             const slotConfig = pattern.workdayPattern.slots.find(s => s.position === employee.slot_position);
             if (slotConfig) {
               const cycleIdx = workdayCycleIndex % pattern.workdayPattern.cycleLength;
               todayScheduleMap[employee.id] = slotConfig.cycle[cycleIdx] || 'A';
             } else {
               todayScheduleMap[employee.id] = 'A';
             }
          }
        }
        workdayCycleIndex++;
      } else {
        // Non-workday
        const eligibleEmployees = [];
        for (const employee of employees) {
          const overrideType = manualOverridesMap[`${employee.id}_${dateStr}`];
          if (overrideType !== undefined) {
             todayScheduleMap[employee.id] = overrideType;
          } else {
             const yestType = yesterdayScheduleMap[employee.id] || '';
             // Rule: if A1, A2, OC, or BT yesterday, cannot be OC or BT today (no consecutive days of extra shifts)
             if (['A1', 'A2', 'OC', 'BT'].includes(yestType)) {
               todayScheduleMap[employee.id] = '';
             } else {
               eligibleEmployees.push(employee);
             }
          }
        }

        eligibleEmployees.sort((a, b) => a.slot_position - b.slot_position);

        if (eligibleEmployees.length === 1) {
           todayScheduleMap[eligibleEmployees[0].id] = 'OC';
           lastOC_empId = eligibleEmployees[0].id;
        } else if (eligibleEmployees.length >= 2) {
           let ocIdx = ocRotationIndex % eligibleEmployees.length;
           
           // Ensure the same person doesn't get OC twice in a row on holidays
           if (eligibleEmployees[ocIdx].id === lastOC_empId) {
             ocRotationIndex++;
             ocIdx = ocRotationIndex % eligibleEmployees.length;
           }

           const btIdx = (ocIdx + 1) % eligibleEmployees.length;
           
           for (let i = 0; i < eligibleEmployees.length; i++) {
             if (i === ocIdx) {
               todayScheduleMap[eligibleEmployees[i].id] = 'OC';
               lastOC_empId = eligibleEmployees[i].id;
             } else if (i === btIdx) {
               todayScheduleMap[eligibleEmployees[i].id] = 'BT';
             } else {
               todayScheduleMap[eligibleEmployees[i].id] = '';
             }
           }
           ocRotationIndex++;
        }
      }

      // Record entries for DB
      for (const employee of employees) {
        const overrideType = manualOverridesMap[`${employee.id}_${dateStr}`];
        entries.push({
          employee_id: employee.id,
          date: dateStr,
          schedule_type: todayScheduleMap[employee.id],
          is_manual_override: overrideType !== undefined,
        });
      }

      yesterdayScheduleMap = { ...todayScheduleMap };
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

// DELETE /api/schedules/reset?year=&month= - Clear ALL schedules for a month
router.delete('/reset', authMiddleware, adminOnly, async (req, res) => {
  const { year, month } = req.query;
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = `${year}-${String(month).padStart(2, '0')}-31`;

  try {
    await db.query(
      'DELETE FROM schedules WHERE date >= $1 AND date <= $2',
      [startDate, endDate]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
