const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const prisma  = require('../lib/prisma');

const router = express.Router();

const signToken = (userId) =>
  jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '7d' });

router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: 'All fields are required' });
    if (name.length < 2 || name.length > 30)
      return res.status(400).json({ message: 'Name must be 2-30 characters' });
    if (password.length < 6)
      return res.status(400).json({ message: 'Password must be at least 6 characters' });

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing)
      return res.status(400).json({ message: 'Email is already registered' });

    const hashed = await bcrypt.hash(password, 10);
    const user   = await prisma.user.create({
      data: { name: name.trim(), email: email.toLowerCase().trim(), password: hashed },
    });

    res.status(201).json({
      token: signToken(user.id),
      user:  { id: user.id, name: user.name, email: user.email, avatar: user.avatar },
    });
  } catch (err) {
    console.error('register error:', err.message);
    res.status(500).json({ message: 'Server error, please try again' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: 'Email and password are required' });

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) return res.status(401).json({ message: 'Invalid email or password' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid email or password' });

    res.json({
      token: signToken(user.id),
      user:  { id: user.id, name: user.name, email: user.email, avatar: user.avatar, bio: user.bio },
    });
  } catch (err) {
    console.error('login error:', err.message);
    res.status(500).json({ message: 'Server error, please try again' });
  }
});

module.exports = router;
