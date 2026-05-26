const express = require('express');
const prisma  = require('../lib/prisma');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const logs = await prisma.callLog.findMany({
      where: {
        OR: [{ callerId: req.user.id }, { receiverId: req.user.id }],
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        caller:   { select: { id: true, name: true, avatar: true } },
        receiver: { select: { id: true, name: true, avatar: true } },
      },
    });
    res.json(logs);
  } catch (err) {
    console.error('GET /calls error:', err.message);
    res.status(500).json({ message: 'Could not fetch call logs' });
  }
});

module.exports = router;
