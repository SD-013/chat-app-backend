require('dotenv').config();
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const jwt        = require('jsonwebtoken');

const prisma        = require('./lib/prisma');
const authRoutes    = require('./routes/auth');
const messageRoutes = require('./routes/messages');
const userRoutes    = require('./routes/users');
const uploadRoutes  = require('./routes/upload');
const profileRoutes = require('./routes/profile');
const callRoutes    = require('./routes/calls');
const { verifyToken } = require('./middleware/auth');

const app    = express();
const server = http.createServer(app);

const allowedOrigins = process.env.CLIENT_URL
  ? process.env.CLIENT_URL.split(',').map(s => s.trim())
  : ['http://localhost:5173'];

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok', ts: Date.now() }));
app.use('/api/auth',     authRoutes);
app.use('/api/messages', verifyToken, messageRoutes);
app.use('/api/users',    verifyToken, userRoutes);
app.use('/api/upload',   verifyToken, uploadRoutes);
app.use('/api/profile',  verifyToken, profileRoutes);
app.use('/api/calls',    verifyToken, callRoutes);

const io = new Server(server, {
  cors: { origin: allowedOrigins, methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
});

const userSocketMap = new Map();

const getSocketId = (userId) => userSocketMap.get(userId);

io.on('connection', (socket) => {
  socket.on('user-online', ({ userId }) => {
    userSocketMap.set(userId, socket.id);
    io.emit('online-users', [...userSocketMap.keys()]);
  });

  socket.on('send-message', async ({ content, token, receiverId, messageType, imageUrl }) => {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const sender  = await prisma.user.findUnique({
        where:  { id: decoded.id },
        select: { id: true, name: true, avatar: true },
      });
      if (!sender) return;

      const receiverSocketId = getSocketId(receiverId);
      const initialStatus    = receiverSocketId ? 'DELIVERED' : 'SENT';

      const message = await prisma.message.create({
        data: {
          senderId:     decoded.id,
          receiverId,
          senderName:   sender.name,
          senderAvatar: sender.avatar ?? null,
          content:      content     ?? '',
          messageType:  messageType === 'image' ? 'IMAGE' : 'TEXT',
          imageUrl:     imageUrl    ?? null,
          status:       initialStatus,
        },
      });

      const msgObj = serializeMessage(message);
      if (receiverSocketId) io.to(receiverSocketId).emit('new-message', msgObj);
      socket.emit('message-sent', msgObj);
    } catch (err) {
      console.error('send-message error:', err.message);
    }
  });

  socket.on('messages-read', async ({ senderId, token }) => {
    try {
      const decoded    = jwt.verify(token, process.env.JWT_SECRET);
      const receiverId = decoded.id;
      const result = await prisma.message.updateMany({
        where: { senderId, receiverId, status: { not: 'READ' } },
        data:  { status: 'READ' },
      });
      if (result.count > 0) {
        const senderSocketId = getSocketId(senderId);
        if (senderSocketId) io.to(senderSocketId).emit('messages-read', { byUserId: receiverId });
      }
    } catch (err) {
      console.error('messages-read error:', err.message);
    }
  });

  socket.on('call:initiate', ({ to, from, callType, offer }) => {
    const toSocketId = getSocketId(to);
    if (toSocketId) {
      io.to(toSocketId).emit('call:incoming', { from, callType, offer });
    } else {
      socket.emit('call:unavailable', { to });
    }
  });

  socket.on('call:answer', ({ to, answer }) => {
    const toSocketId = getSocketId(to);
    if (toSocketId) io.to(toSocketId).emit('call:answered', { answer });
  });

  socket.on('call:ice-candidate', ({ to, candidate }) => {
    const toSocketId = getSocketId(to);
    if (toSocketId) io.to(toSocketId).emit('call:ice-candidate', { candidate });
  });

  socket.on('call:decline', ({ to, from }) => {
    const toSocketId = getSocketId(to);
    if (toSocketId) io.to(toSocketId).emit('call:declined', { by: from });
  });

  socket.on('call:end', ({ to, from, callType, duration, status }) => {
    const toSocketId = getSocketId(to);
    if (toSocketId) io.to(toSocketId).emit('call:ended', { by: from });
    prisma.callLog.create({
      data: {
        callerId:   from,
        receiverId: to,
        callType:   callType === 'voice' ? 'VOICE' : 'VIDEO',
        status:     status === 'answered' ? 'ANSWERED' : status === 'declined' ? 'DECLINED' : 'MISSED',
        duration:   duration ?? null,
      },
    }).catch(() => {});
  });

  socket.on('call:busy', ({ to, from }) => {
    const toSocketId = getSocketId(to);
    if (toSocketId) io.to(toSocketId).emit('call:busy', { from });
  });

  socket.on('typing:start', ({ to, from }) => {
    const toSocketId = getSocketId(to);
    if (toSocketId) io.to(toSocketId).emit('typing:start', { from });
  });

  socket.on('typing:stop', ({ to, from }) => {
    const toSocketId = getSocketId(to);
    if (toSocketId) io.to(toSocketId).emit('typing:stop', { from });
  });

  socket.on('disconnect', () => {
    for (const [uid, sid] of userSocketMap.entries()) {
      if (sid === socket.id) { userSocketMap.delete(uid); break; }
    }
    io.emit('online-users', [...userSocketMap.keys()]);
  });
});

function serializeMessage(m) {
  return {
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
  };
}

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server on port ${PORT}`));
