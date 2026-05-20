import db from './db.js';
import bcrypt from 'bcryptjs';

const DEFAULT_PATTERN = {
  scheduleTypes: [
    { code: 'A',  label: 'Reguler',       hours: '08.00-17.00',              color: '#3b82f6' },
    { code: 'A1', label: 'Standby',        hours: '08.00-17.00 + s/d 21.00', color: '#1d4ed8' },
    { code: 'A2', label: 'IT Support',     hours: '17.00-21.00',             color: '#7c3aed' },
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

function seed() {
  console.log('🌱 Seeding database...');

  // Check if already seeded
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (userCount.count > 0) {
    console.log('Database already seeded. Skipping.');
    return;
  }

  // Create default admin user
  const adminHash = bcrypt.hashSync('admin123', 10);
  db.prepare(`
    INSERT INTO users (username, password_hash, display_name, role)
    VALUES (?, ?, ?, ?)
  `).run('admin', adminHash, 'Administrator', 'admin');
  console.log('✅ Admin user created (admin / admin123)');

  // Create default employees
  const insertEmployee = db.prepare(`
    INSERT INTO employees (name, slot_position) VALUES (?, ?)
  `);
  insertEmployee.run('Abdul Mutolib', 1);
  insertEmployee.run('Eka Bayu M', 2);
  insertEmployee.run('M. Rafli Ramadhani', 3);
  console.log('✅ 3 default employees created');

  // Insert default pattern config
  db.prepare(`
    INSERT INTO pattern_config (id, config_json) VALUES (1, ?)
  `).run(JSON.stringify(DEFAULT_PATTERN));
  console.log('✅ Default pattern config created');

  console.log('🎉 Seeding complete!');
}

seed();
