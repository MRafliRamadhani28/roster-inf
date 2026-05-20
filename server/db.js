import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load .env from root directory
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      display_name VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL DEFAULT 'viewer' CHECK(role IN ('admin', 'viewer')),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS employees (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      slot_position INTEGER NOT NULL,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL,
      date VARCHAR(10) NOT NULL,
      schedule_type VARCHAR(50) NOT NULL DEFAULT '',
      is_manual_override BOOLEAN DEFAULT FALSE,
      created_by INTEGER,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id),
      UNIQUE(employee_id, date)
    );

    CREATE TABLE IF NOT EXISTS holidays (
      id SERIAL PRIMARY KEY,
      date VARCHAR(10) NOT NULL,
      name VARCHAR(255) NOT NULL,
      is_national_holiday BOOLEAN NOT NULL,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      UNIQUE(date)
    );

    CREATE TABLE IF NOT EXISTS pattern_config (
      id INTEGER PRIMARY KEY DEFAULT 1,
      config_json TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_by INTEGER,
      FOREIGN KEY (updated_by) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_schedules_date ON schedules(date);
    CREATE INDEX IF NOT EXISTS idx_schedules_employee ON schedules(employee_id);
    CREATE INDEX IF NOT EXISTS idx_holidays_year_month ON holidays(year, month);
  `);
  console.log('PostgreSQL Database tables created or verified.');
} catch (error) {
  console.error('Error initializing PostgreSQL tables:', error);
}

export default pool;
