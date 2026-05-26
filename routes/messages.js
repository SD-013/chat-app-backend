const express = require('express');
const prisma  = require('../lib/prisma');

const router = express.Router();

const serialize = (m) => ({
  _id:          m.id,
  sender:       m.senderId,
  receiver:     m.receiverId,
  senderName:   m.senderName,
  senderAvatar: m.senderAvatar,
  content:      m.content,
  messageType:  m.messageType.toLowerCase(),
  imageUrl:     m.imageUrl,
  status:       m.status.toLowerCase(),
  createdAt:    m.createdAt,
});

router.get('/:userId', async (req, res) => {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const me    = req.user.id;
    const other = req.params.userId;
    const cursor = req.query.cursor;
    const limit  = Math.min(parseInt(req.query.limit) || 50, 100);

    const where = {
      OR: [
        { senderId: me,    receiverId: other },
        { senderId: other, receiverId: me    },
      ],
    };
    if (cursor) where.createdAt = { lt: new Date(cursor) };

    const messages = await prisma.message.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    clearTimeout(timer);
    if (res.headersSent) return;

    const ordered = messages.reverse();
    res.json({
      messages:   ordered.map(serialize),
      hasMore:    messages.length === limit,
      nextCursor: messages.length === limit ? ordered[0].createdAt : null,
    });

    prisma.message.updateMany({
      where: { senderId: other, receiverId: me, status: { not: 'READ' } },
      data:  { status: 'READ' },
    }).catch(() => {});
  } catch (err) {
    clearTimeout(timer);
    if (!res.headersSent) res.status(500).json({ message: 'Could not fetch messages' });
  }
});

module.exports = router;
