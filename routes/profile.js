const express    = require('express');
const multer     = require('multer');
const cloudinary = require('cloudinary').v2;
const prisma     = require('../lib/prisma');

const router = express.Router();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 3 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

router.get('/', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where:  { id: req.user.id },
      select: { id: true, name: true, email: true, avatar: true, bio: true, createdAt: true },
    });
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ ...user, _id: user.id });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

router.patch('/bio', async (req, res) => {
  try {
    const { bio } = req.body;
    if (typeof bio !== 'string') return res.status(400).json({ message: 'Invalid bio' });
    const updated = await prisma.user.update({
      where:  { id: req.user.id },
      data:   { bio: bio.trim().slice(0, 160) },
      select: { id: true, name: true, email: true, avatar: true, bio: true },
    });
    res.json({ user: updated });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/avatar', upload.single('avatar'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No image provided' });
  try {
    const b64     = req.file.buffer.toString('base64');
    const dataURI = `data:${req.file.mimetype};base64,${b64}`;
    const result  = await cloudinary.uploader.upload(dataURI, {
      folder:         'chat-app/avatars',
      resource_type:  'image',
      transformation: [
        { width: 250, height: 250, crop: 'fill', gravity: 'face', quality: 'auto:good' },
      ],
    });
    const updated = await prisma.user.update({
      where:  { id: req.user.id },
      data:   { avatar: result.secure_url },
      select: { id: true, name: true, email: true, avatar: true, bio: true },
    });
    res.json({ user: updated });
  } catch (err) {
    console.error('Avatar upload error:', err.message);
    res.status(500).json({ message: 'Avatar upload failed' });
  }
});

router.use((err, _req, res, _next) => {
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ message: 'Image must be under 3MB' });
  res.status(400).json({ message: err.message });
});

module.exports = router;
