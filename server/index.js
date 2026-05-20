import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import authRoutes from './routes/auth.js';
import employeeRoutes from './routes/employees.js';
import scheduleRoutes from './routes/schedules.js';
import patternRoutes from './routes/patterns.js';
import holidayRoutes from './routes/holidays.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4003;

app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/patterns', patternRoutes);
app.use('/api/holidays', holidayRoutes);

// Serve static frontend (production)
const distPath = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`🚀 Roster server running at http://localhost:${PORT}`);
  console.log(`   API: http://localhost:${PORT}/api`);

  // In dev mode, remind about Vite
  if (!fs.existsSync(distPath)) {
    console.log(`   Frontend dev: run 'npx vite' in another terminal (port 3003)`);
  }
});
