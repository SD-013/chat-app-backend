const express = require('express');
const prisma  = require('../lib/prisma');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where:   { id: { not: req.user.id } },
      select:  { id: true, name: true, email: true, avatar: true, bio: true },
      orderBy: { name: 'asc' },
    });
    res.json(users.map(u => ({ ...u, _id: u.id })));
  } catch (err) {
    console.error('GET /users error:', err.message);
    res.status(500).json({ message: 'Could not fetch users' });
  }
});

module.exports = router;
