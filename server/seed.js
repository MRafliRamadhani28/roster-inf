import db from './db.js';
import bcrypt from 'bcryptjs';

const DEFAULT_PATTERN = {
  scheduleTypes: [
    { code: 'A',  label: 'Reguler',       hours: '08.00-17.00',              color: '#3b82f6' },
    { code: 'A1', label: 'Standby',        hours: '08.00-17.00 + Stand By s/d 21.00', color: '#1d4ed8' },
    { code: 'A2', label: 'IT Support',     hours: '08.00-17.00 + Stand By s/d 21.00',             color: '#7c3aed' },
    { code: 'OC', label: 'On Call',        hours: '-',                       color: '#f59e0b' },
    { code: 'BT', label: 'Back Up Teknis', hours: '-',                       color: '#14b8a6' },
  ],
  workdayPattern: {
    cycleLength: 2,
    slots: [
      { position: 1, cycle: ['A1', 'A'] },
      { position: 2, cycle: ['A', 'A1'] },
      { position: 3, cycle: ['A2', 'A'] },
    ],
  },
  nonWorkdayPattern: {
    ocSlots: [1, 2],
    btSlot: 3,
    ocRotation: 'alternate',
  },
};

async function seed() {
  console.log('🌱 Seeding database...');

  try {
    // Check if already seeded
    const { rows } = await db.query('SELECT COUNT(*) as count FROM users');
    if (parseInt(rows[0].count) > 0) {
      console.log('Database already seeded. Skipping.');
      process.exit(0);
    }

    // Create default admin user
    const adminHash = bcrypt.hashSync('admin123', 10);
    await db.query(`
      INSERT INTO users (username, password_hash, display_name, role)
      VALUES ($1, $2, $3, $4)
    `, ['admin', adminHash, 'Administrator', 'admin']);
    console.log('✅ Admin user created (admin / admin123)');

    // Create default employees
    await db.query(`INSERT INTO employees (name, slot_position) VALUES ($1, $2)`, ['Abdul Mutolib', 1]);
    await db.query(`INSERT INTO employees (name, slot_position) VALUES ($1, $2)`, ['Eka Bayu M', 2]);
    await db.query(`INSERT INTO employees (name, slot_position) VALUES ($1, $2)`, ['M. Rafli Ramadhani', 3]);
    console.log('✅ 3 default employees created');

    // Insert default pattern config
    await db.query(`
      INSERT INTO pattern_config (id, config_json) VALUES (1, $1)
    `, [JSON.stringify(DEFAULT_PATTERN)]);
    console.log('✅ Default pattern config created');

    console.log('🎉 Seeding complete!');
  } catch (err) {
    console.error('Error during seeding:', err);
  } finally {
    process.exit(0);
  }
}

seed();
