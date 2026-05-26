const { PrismaClient } = require('@prisma/client');

const createPrismaClient = () =>
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

const prisma = global.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') global.__prisma = prisma;

module.exports = prisma;
