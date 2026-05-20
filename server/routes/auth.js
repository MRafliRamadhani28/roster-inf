import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../db.js';
import { JWT_SECRET, authMiddleware, adminOnly } from '../middleware/auth.js';

const router = Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username dan password wajib diisi' });
    }

    const { rows } = await db.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = rows[0];
    if (!user) {
      return res.status(401).json({ error: 'Username atau password salah' });
    }

    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Username atau password salah' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, displayName: user.display_name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/auth/register (admin only)
router.post('/register', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { username, password, displayName, role } = req.body;
    if (!username || !password || !displayName) {
      return res.status(400).json({ error: 'Username, password, dan nama wajib diisi' });
    }

    const validRoles = ['admin', 'viewer'];
    const userRole = validRoles.includes(role) ? role : 'viewer';

    const { rows: existingRows } = await db.query('SELECT id FROM users WHERE username = $1', [username]);
    if (existingRows.length > 0) {
      return res.status(409).json({ error: 'Username sudah digunakan' });
    }

    const hash = bcrypt.hashSync(password, 10);
    const { rows } = await db.query(`
      INSERT INTO users (username, password_hash, display_name, role)
      VALUES ($1, $2, $3, $4) RETURNING id
    `, [username, hash, displayName, userRole]);

    res.status(201).json({
      id: rows[0].id,
      username,
      displayName,
      role: userRole,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, (req, res) => {
  res.json({
    id: req.user.id,
    username: req.user.username,
    displayName: req.user.displayName,
    role: req.user.role,
  });
});

// GET /api/auth/users (admin only)
router.get('/users', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT id, username, display_name, role, created_at FROM users');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/auth/users/:id (admin only)
router.delete('/users/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ error: 'Tidak dapat menghapus akun Anda sendiri' });
    }

    const result = await db.query('DELETE FROM users WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User tidak ditemukan' });
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
